import { stringifyValue } from '../../../common/utils'
import { applyReplBinding, executeReplLine, type ReplBinding } from '../../../src/shared/replCore'
import { createDvala } from '../../../src/createDvala'
import type { HandlerRegistration, RunResult, Snapshot } from '../../../src/evaluator/effectTypes'
import { allBuiltinModules } from '../../../src/allModules'
import { toJS } from '../../../src/utils/interop'
import { getHandlersCode, wrapWithBoundaryHandler } from '../handlersBuffer'
import { getWorkspaceFiles } from '../fileStorage'
import { playgroundFileResolver } from '../playgroundFileResolver'
import { getState } from '../state'
import { getActiveTabKind, openOrFocusSnapshotTab } from './tabs'
import type { TerminalSnapshotEntry } from '../snapshotStorage'
import { getTerminalSnapshots, setTerminalSnapshots } from '../snapshotStorage'
import { getRightPanel } from './panelInstances'
import { SCRATCH_FILE_ID } from '../scratchBuffer'
import { getActiveSnapshotDetails, getPlaygroundReplHandlers } from '../scripts'
import { extractSnapshotBindings } from './rightPanelReplBaseline'
import { getReplPromptText, getReplPromptWidth } from './rightPanelReplPrompt'
import {
  isReplSessionStale,
  moveReplHistoryCursor,
  shouldShowReplContextBinding,
  shouldShowReloadButton,
  toPersistedReplSession,
  type PersistedReplSession,
} from './rightPanelReplState'

interface ReplSessionState {
  scope: Record<string, unknown>
  baseScope: Record<string, unknown>
  repl: ReplBinding
  inputHistory: string[]
  outputs: ReplOutputEntry[]
  loadedFileSource: string
  loadedHandlersSource: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  historyIndex: number
  draftInput: string
}

interface ReplOutputEntry {
  kind: 'input' | 'result' | 'comment' | 'error'
  text: string
  snapshotId?: string
}

const sessions = new Map<string, ReplSessionState>()
const MAX_INPUT_HISTORY = 100
const REPL_SESSIONS_STORAGE_KEY = 'playground-repl-sessions-v2'
let didHydrateSessions = false
let shouldFocusInputOnRender = false

function createEmptyReplBinding(): ReplBinding {
  return {
    result: null,
    error: null,
    history: [],
  }
}

type ReplTarget =
  | {
      kind: 'file'
      sessionKey: string
      displayLabel: string
      promptSource: string
      file: { id: string; path: string }
      fileSource: string
      handlersSource: string
    }
  | {
      kind: 'snapshot'
      sessionKey: string
      displayLabel: string
      promptSource: string
      snapshot: Snapshot
    }

function hydrateSessions(): void {
  if (didHydrateSessions) return
  didHydrateSessions = true
  const raw = localStorage.getItem(REPL_SESSIONS_STORAGE_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as Record<string, PersistedReplSession>
    for (const [fileId, session] of Object.entries(parsed)) {
      sessions.set(fileId, {
        ...session,
        historyIndex: -1,
        draftInput: '',
      })
    }
  } catch {
    localStorage.removeItem(REPL_SESSIONS_STORAGE_KEY)
  }
}

function persistSessions(): void {
  const persistedEntries = [...sessions.entries()]
    .map(([fileId, session]) => [fileId, toPersistedReplSession(session)] as const)
    .filter((entry): entry is readonly [string, PersistedReplSession] => entry[1] !== null)
  if (persistedEntries.length === 0) {
    localStorage.removeItem(REPL_SESSIONS_STORAGE_KEY)
    return
  }
  localStorage.setItem(REPL_SESSIONS_STORAGE_KEY, JSON.stringify(Object.fromEntries(persistedEntries)))
}

function getOrCreateSession(fileId: string): ReplSessionState {
  hydrateSessions()
  let session = sessions.get(fileId)
  if (!session) {
    session = {
      scope: {},
      baseScope: {},
      repl: createEmptyReplBinding(),
      inputHistory: [],
      outputs: [],
      loadedFileSource: '',
      loadedHandlersSource: '',
      status: 'idle',
      error: null,
      historyIndex: -1,
      draftInput: '',
    }
    sessions.set(fileId, session)
  }
  return session
}

function getActiveWorkspaceFile() {
  const fileId = getState('current-file-id')
  if (!fileId) return null
  return getWorkspaceFiles().find(file => file.id === fileId) ?? null
}

function getActiveReplTarget(): ReplTarget | null {
  if (getActiveTabKind() === 'snapshot') {
    const activeSnapshot = getActiveSnapshotDetails()
    if (!activeSnapshot) return null
    return {
      kind: 'snapshot',
      sessionKey: `snapshot:${activeSnapshot.snapshot.id}`,
      displayLabel: activeSnapshot.label,
      promptSource: activeSnapshot.label,
      snapshot: activeSnapshot.snapshot,
    }
  }

  const file = getActiveWorkspaceFile()
  if (!file) return null
  return {
    kind: 'file',
    sessionKey: file.id,
    displayLabel: file.path,
    promptSource: file.path,
    file,
    fileSource: getState('dvala-code'),
    handlersSource: getHandlersCode(),
  }
}

function getReplRunLocation(file: { id: string; path: string }): { filePath?: string; fileResolverBaseDir: string } {
  if (file.id === SCRATCH_FILE_ID) {
    return { filePath: undefined, fileResolverBaseDir: '' }
  }
  const slash = file.path.lastIndexOf('/')
  return {
    filePath: file.path,
    fileResolverBaseDir: slash === -1 ? '' : file.path.slice(0, slash),
  }
}

function getEffectHandlers(addOutput: (entry: ReplOutputEntry) => void): HandlerRegistration[] {
  const handlers = getPlaygroundContextHandlers().filter(
    reg => reg.pattern !== 'dvala.io.print' && reg.pattern !== 'dvala.io.error',
  )
  return [
    {
      pattern: 'dvala.io.print',
      handler: ({ arg, resume }) => {
        addOutput({ kind: 'comment', text: stringifyValue(arg, false) })
        resume(null)
      },
    },
    {
      pattern: 'dvala.io.error',
      handler: ({ arg, resume }) => {
        addOutput({ kind: 'error', text: stringifyValue(arg, false) })
        resume(null)
      },
    },
    ...handlers,
  ]
}

function getPlaygroundContextHandlers(): HandlerRegistration[] {
  return getPlaygroundReplHandlers()
}

function saveAndOpenSnapshotTab(snapshot: Snapshot, resultType: TerminalSnapshotEntry['resultType']): void {
  const entries = getTerminalSnapshots()
  entries.unshift({ kind: 'terminal', snapshot, savedAt: Date.now(), resultType })
  setTerminalSnapshots(entries)
  openOrFocusSnapshotTab(snapshot.id)
}

async function runPlaygroundReplCode(params: {
  expression: string
  scope: Record<string, unknown>
  runLocation: { filePath?: string; fileResolverBaseDir: string }
  addOutput: (entry: ReplOutputEntry) => void
}): Promise<RunResult> {
  const { filePath, fileResolverBaseDir } = params.runLocation
  const dvala = createDvala({
    debug: getState('debug'),
    modules: allBuiltinModules,
    fileResolver: playgroundFileResolver,
    fileResolverBaseDir,
  })
  return dvala.runAsync(wrapWithBoundaryHandler(params.expression), {
    scope: params.scope,
    effectHandlers: getEffectHandlers(params.addOutput),
    disableAutoCheckpoint: getState('disable-auto-checkpoint'),
    terminalSnapshot: true,
    filePath,
  })
}

function resetSessionToBaseline(session: ReplSessionState, baseScope: Record<string, unknown>, repl: ReplBinding): void {
  session.baseScope = { ...baseScope }
  session.scope = { ...baseScope }
  session.repl = repl
  applyReplBinding(session.baseScope, repl)
  applyReplBinding(session.scope, repl)
  session.historyIndex = -1
  session.draftInput = ''
}

async function loadBaseline(target: ReplTarget, session: ReplSessionState): Promise<void> {
  session.status = 'loading'
  session.error = null
  renderReplForActiveFile()
  const handlersSource = target.kind === 'file' ? target.handlersSource : ''
  let nextBaseScope: Record<string, unknown> = {}
  let repl = createEmptyReplBinding()
  try {
    if (target.kind === 'file') {
      const result = await runPlaygroundReplCode({
        expression: target.fileSource,
        scope: nextBaseScope,
        runLocation: getReplRunLocation(target.file),
        addOutput: entry => session.outputs.push(entry),
      })
      if (result.type === 'error') throw result.error
      if (result.type === 'suspended') {
        saveAndOpenSnapshotTab(result.snapshot, 'halted')
        throw new Error('Loaded file suspended. Open the snapshot tab and use the snapshot-backed REPL there.')
      }
      if (result.type === 'halted') {
        throw new Error('Loaded file halted. Reload after adjusting the file.')
      }
      nextBaseScope = { ...result.scope }
      repl = {
        result: result.value,
        error: null,
        history: [{ type: 'result', value: result.value }],
      }
    } else {
      nextBaseScope = await extractSnapshotBindings(target.snapshot)
    }
    resetSessionToBaseline(session, nextBaseScope, repl)
    session.loadedFileSource = target.kind === 'file' ? target.fileSource : target.snapshot.id
    session.loadedHandlersSource = handlersSource
    session.status = 'ready'
    session.error = null
    session.outputs = [{ kind: 'comment', text: `Loaded ${target.displayLabel}` }]
    persistSessions()
  } catch (error) {
    session.baseScope = {}
    session.scope = {}
    session.repl = createEmptyReplBinding()
    applyReplBinding(session.baseScope, session.repl)
    applyReplBinding(session.scope, session.repl)
    session.historyIndex = -1
    session.draftInput = ''
    session.loadedFileSource = target.kind === 'file' ? target.fileSource : target.snapshot.id
    session.loadedHandlersSource = handlersSource
    session.status = 'error'
    session.error = error instanceof Error ? error.message : String(error)
    session.outputs = [{ kind: 'error', text: session.error }]
    persistSessions()
  }
  renderReplForActiveFile()
}

function getInputValue(input: HTMLElement): string {
  return input instanceof HTMLInputElement ? input.value : (input.textContent ?? '')
}

function setInputValue(input: HTMLElement, value: string): void {
  if (input instanceof HTMLInputElement) {
    input.value = value
    return
  }
  input.textContent = value
}

async function submitLine(target: ReplTarget, session: ReplSessionState, inputEl: HTMLElement): Promise<void> {
  const expression = getInputValue(inputEl).trim()
  if (expression === '' || session.status === 'loading') return
  setInputValue(inputEl, '')
  shouldFocusInputOnRender = true
  session.inputHistory = [expression, ...session.inputHistory.filter(entry => entry !== expression)].slice(0, MAX_INPUT_HISTORY)
  session.historyIndex = -1
  session.draftInput = ''
  session.outputs.push({ kind: 'input', text: expression })
  renderReplForActiveFile()

  const outcome = await executeReplLine({
    expression,
    scope: session.scope,
    repl: session.repl,
    run: (nextExpression, nextScope) =>
      runPlaygroundReplCode({
        expression: nextExpression,
        scope: nextScope,
        runLocation: target.kind === 'file' ? getReplRunLocation(target.file) : { fileResolverBaseDir: '' },
        addOutput: entry => session.outputs.push(entry),
      }),
  })

  if (!outcome.ok) {
    const message = outcome.repl.error ?? (outcome.error instanceof Error ? outcome.error.message : String(outcome.error))
    session.scope = outcome.scope
    session.repl = outcome.repl
    session.outputs.push({ kind: 'error', text: message })
    persistSessions()
    shouldFocusInputOnRender = true
    renderReplForActiveFile()
    return
  }

  session.scope = outcome.scope
  session.repl = outcome.repl
  if (outcome.runResult.type === 'suspended') {
    saveAndOpenSnapshotTab(outcome.runResult.snapshot, 'halted')
    session.outputs.push({
      kind: 'comment',
      text: 'Suspended evaluation',
      snapshotId: outcome.runResult.snapshot.id,
    })
  } else if (outcome.runResult.type === 'halted') {
    session.outputs.push({ kind: 'comment', text: 'Evaluation halted' })
  } else {
    session.outputs.push({ kind: 'result', text: stringifyValue(outcome.value, false) })
  }
  persistSessions()
  shouldFocusInputOnRender = true
  renderReplForActiveFile()
}

function renderOutput(entry: ReplOutputEntry, promptText: string): HTMLElement {
  const row = document.createElement('div')
  row.className = `repl-panel__row repl-panel__row--${entry.kind}`
  if (entry.kind === 'input') {
    const prompt = renderPrompt(promptText)
    const content = document.createElement('div')
    content.className = 'repl-panel__row-content'
    content.textContent = entry.text
    row.append(prompt, content)
  } else {
    const content = document.createElement('div')
    content.className = 'repl-panel__row-content'
    content.textContent = entry.text
    row.appendChild(content)
  }
  if (entry.snapshotId) {
    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'repl-panel__snapshot-link'
    link.textContent = 'Open snapshot'
    link.addEventListener('click', () => openOrFocusSnapshotTab(entry.snapshotId!))
    const content = row.querySelector('.repl-panel__row-content')
    if (content) {
      content.appendChild(document.createTextNode(' '))
      content.appendChild(link)
    }
  }
  return row
}

function renderPrompt(promptText: string): HTMLElement {
  const prompt = document.createElement('span')
  prompt.className = 'repl-panel__row-prompt'
  prompt.textContent = promptText
  return prompt
}

function renderContextMenu(session: ReplSessionState): HTMLElement {
  const menu = document.createElement('details')
  menu.className = 'repl-panel__context-menu'
  let openController: AbortController | null = null

  const summary = document.createElement('summary')
  summary.className = 'button button--small repl-panel__context-button'
  summary.textContent = 'Context'
  menu.appendChild(summary)

  const popup = document.createElement('div')
  popup.className = 'repl-panel__context-popup fancy-scroll'

  function positionPopup(): void {
    const rect = summary.getBoundingClientRect()
    const viewportPadding = 12
    const preferredWidth = 320
    const maxWidth = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2)
    const left = Math.min(
      rect.left,
      Math.max(viewportPadding, window.innerWidth - viewportPadding - maxWidth),
    )
    popup.style.left = `${Math.max(viewportPadding, left)}px`
    popup.style.top = `${rect.bottom + 6}px`
    popup.style.width = `${maxWidth}px`
    popup.style.maxWidth = `${maxWidth}px`
    popup.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - viewportPadding - 6)}px`
  }

  menu.addEventListener('toggle', () => {
    openController?.abort()
    openController = null
    if (!menu.open) return

    positionPopup()
    openController = new AbortController()
    const { signal } = openController

    window.addEventListener('resize', positionPopup, { signal })
    window.addEventListener('scroll', positionPopup, { signal, capture: true })

    document.addEventListener(
      'pointerdown',
      event => {
        const target = event.target
        if (!(target instanceof Node)) return
        if (menu.contains(target)) return
        menu.open = false
      },
      { capture: true, signal },
    )

    document.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Escape') menu.open = false
      },
      { signal },
    )
  })

  const bindings = Object.entries(session.scope)
    .filter(([name]) => shouldShowReplContextBinding(name))
    .sort(([left], [right]) => left.localeCompare(right))
  if (bindings.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'repl-panel__context-empty'
    empty.textContent = 'Context is empty'
    popup.appendChild(empty)
  } else {
    const list = document.createElement('ul')
    list.className = 'repl-panel__context-list'
    bindings.forEach(([name, value]) => {
      const item = document.createElement('li')
      item.className = 'repl-panel__context-item'

      const key = document.createElement('span')
      key.className = 'repl-panel__context-key'
      key.textContent = name

      const separator = document.createElement('span')
      separator.className = 'repl-panel__context-separator'
      separator.textContent = '='

      const renderedValue = document.createElement('span')
      renderedValue.className = 'repl-panel__context-value'
      renderedValue.textContent = stringifyValue(toJS(value as never), false)
      renderedValue.title = renderedValue.textContent

      item.append(key, separator, renderedValue)
      list.appendChild(item)
    })
    popup.appendChild(list)
  }

  menu.appendChild(popup)
  return menu
}

function isReplTabActive(): boolean {
  return getRightPanel().getActiveTabId() === 'repl' && !getRightPanel().isCollapsed()
}

function focusReplInput(input: HTMLElement): void {
  input.focus()
  if (input instanceof HTMLInputElement) {
    const cursor = input.value.length
    input.setSelectionRange(cursor, cursor)
    input.scrollIntoView({ block: 'nearest' })
    return
  }
  const selection = window.getSelection()
  if (selection) {
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  input.scrollIntoView({ block: 'nearest' })
}

function scrollReplToBottom(): void {
  const liveMain = getRightPanel().getTabBody('repl').querySelector<HTMLElement>('.repl-panel__main')
  if (liveMain) liveMain.scrollTop = liveMain.scrollHeight
}

function handleHistoryNavigation(
  event: KeyboardEvent,
  session: ReplSessionState,
  input: HTMLElement,
): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  const currentInput = getInputValue(input)
  const next = moveReplHistoryCursor({
    direction: event.key === 'ArrowUp' ? 'up' : 'down',
    inputHistory: session.inputHistory,
    historyIndex: session.historyIndex,
    draftInput: session.draftInput,
    currentInput,
  })
  if (next.value === currentInput && next.historyIndex === session.historyIndex) return
  event.preventDefault()
  session.historyIndex = next.historyIndex
  session.draftInput = next.draftInput
  setInputValue(input, next.value)
  focusReplInput(input)
}

function renderReplForActiveFile(): void {
  const target = getActiveReplTarget()
  if (!target) return
  const session = getOrCreateSession(target.sessionKey)
  const promptText = getReplPromptText(target.promptSource)
  const promptWidth = getReplPromptWidth(promptText)
  const panel = document.createElement('div')
  panel.className = 'repl-panel'
  panel.style.setProperty('--repl-prompt-width', promptWidth)

  const liveFileSource = target.kind === 'file' ? target.fileSource : target.snapshot.id
  const liveHandlersSource = target.kind === 'file' ? target.handlersSource : ''
  const stale =
    target.kind === 'file' && session.status !== 'idle' && isReplSessionStale(session, liveFileSource, liveHandlersSource)

  const header = document.createElement('div')
  header.className = 'repl-panel__header'
  header.innerHTML = `<div class="repl-panel__status">${session.status === 'loading' ? 'Loading REPL context…' : session.status === 'error' ? 'Load failed' : stale ? 'Stale context' : 'Ready'}</div>`

  const actions = document.createElement('div')
  actions.className = 'repl-panel__actions'
  const reloadBtn = document.createElement('button')
  reloadBtn.type = 'button'
  reloadBtn.className = 'button button--small'
  reloadBtn.textContent = 'Reload'
  reloadBtn.disabled = session.status === 'loading'
  reloadBtn.hidden = !shouldShowReloadButton(session.status, stale)
  reloadBtn.addEventListener('click', () => {
    void loadBaseline(target, session)
  })
  actions.append(renderContextMenu(session), reloadBtn)
  header.appendChild(actions)
  panel.appendChild(header)

  const main = document.createElement('div')
  main.className = 'repl-panel__main fancy-scroll'

  const output = document.createElement('div')
  output.className = 'repl-panel__output'
  if (session.outputs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'repl-panel__empty'
    empty.textContent = target.kind === 'file' ? 'Load a file to start a REPL session.' : 'Load a snapshot to start a REPL session.'
    output.appendChild(empty)
  } else {
    session.outputs.forEach(entry => {
      output.appendChild(renderOutput(entry, promptText))
    })
  }
  main.appendChild(output)

  const inputRow = document.createElement('div')
  inputRow.className = 'repl-panel__row repl-panel__row--input repl-panel__row--active'
  const prompt = renderPrompt(promptText)
  const input = document.createElement('input')
  input.className = 'repl-panel__input repl-panel__row-content'
  input.type = 'text'
  input.disabled = session.status !== 'ready'
  input.setAttribute('aria-label', 'REPL input')
  input.autocomplete = 'off'
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('autocorrect', 'off')
  input.spellcheck = false
  input.value = session.historyIndex === -1 ? session.draftInput : ''
  input.addEventListener('input', () => {
    if (session.historyIndex === -1) session.draftInput = input.value
  })
  input.addEventListener('keydown', event => {
    handleHistoryNavigation(event, session, input)
    if (event.key === 'Enter') {
      event.preventDefault()
      void submitLine(target, session, input)
    }
  })
  main.addEventListener('click', event => {
    if (session.status !== 'ready') return
    const target = event.target
    const targetEl =
      target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null
    if (!targetEl) return
    if (targetEl.closest('button, input, a, summary, details')) return
    focusReplInput(input)
  })
  inputRow.append(prompt, input)
  main.appendChild(inputRow)
  panel.appendChild(main)

  getRightPanel().setTabBody('repl', panel)
  queueMicrotask(() => {
    scrollReplToBottom()
    if (shouldFocusInputOnRender && session.status === 'ready' && isReplTabActive()) {
      shouldFocusInputOnRender = false
      const liveInput = getRightPanel().getTabBody('repl').querySelector<HTMLElement>('.repl-panel__input')
      if (liveInput) focusReplInput(liveInput)
    }
  })
}

export function refreshReplInRightPanel(): void {
  const target = getActiveReplTarget()
  if (!target) return
  shouldFocusInputOnRender = true
  const session = getOrCreateSession(target.sessionKey)
  if (session.status === 'idle') {
    void loadBaseline(target, session)
    return
  }
  renderReplForActiveFile()
}