/* eslint-disable no-console */
import { stringifyValue } from '../../common/utils'
import type { Example } from '../../reference/examples'
import type { Any, UnknownRecord } from '../../src/interface'
import { createDvala } from '../../src/createDvala'
import type { EffectContext, EffectHandler } from '../../src/evaluator/effectTypes'
import { allBuiltinModules } from '../../src/allModules'
import '../../src/initReferenceData'
import { asUnknownRecord } from '../../src/typeGuards'
import type { AutoCompleter } from '../../src/AutoCompleter/AutoCompleter'
import { getAutoCompleter, getUndefinedSymbols, parseTokenStream, tokenizeSource } from '../../src/tooling'
import { Search } from './Search'
import {
  applyEncodedState,
  clearAllStates,
  clearState,
  encodeState,
  getState,
  redoContext,
  redoDvalaCode,
  saveState,
  setContextHistoryListener,
  setDvalaCodeHistoryListener,
  undoContext,
  undoDvalaCode,
  updateState,
} from './state'
import { SyntaxOverlay } from './SyntaxOverlay'
import { isMac, throttle } from './utils'

const dvalaDebug = createDvala({ debug: true, modules: allBuiltinModules })
const dvalaNoDebug = createDvala({ debug: false, modules: allBuiltinModules })
const getDvala = (forceDebug?: 'debug') => forceDebug || getState('debug') ? dvalaDebug : dvalaNoDebug

const elements = {
  wrapper: document.getElementById('wrapper') as HTMLElement,
  playground: document.getElementById('playground') as HTMLElement,
  sidebar: document.getElementById('sidebar') as HTMLElement,
  mainPanel: document.getElementById('main-panel') as HTMLElement,
  contextPanel: document.getElementById('context-panel') as HTMLElement,
  dvalaPanel: document.getElementById('dvala-panel') as HTMLElement,
  outputPanel: document.getElementById('output-panel') as HTMLElement,
  moreMenu: document.getElementById('more-menu') as HTMLElement,
  addContextMenu: document.getElementById('add-context-menu') as HTMLElement,
  newContextName: document.getElementById('new-context-name') as HTMLInputElement,
  newContextValue: document.getElementById('new-context-value') as HTMLTextAreaElement,
  newContextError: document.getElementById('new-context-error') as HTMLSpanElement,
  contextTextArea: document.getElementById('context-textarea') as HTMLTextAreaElement,
  outputResult: document.getElementById('output-result') as HTMLElement,
  dvalaTextArea: document.getElementById('dvala-textarea') as HTMLTextAreaElement,
  resizePlayground: document.getElementById('resize-playground') as HTMLElement,
  resizeDevider1: document.getElementById('resize-divider-1') as HTMLElement,
  resizeDevider2: document.getElementById('resize-divider-2') as HTMLElement,
  resizeSidebar: document.getElementById('resize-sidebar') as HTMLElement,
  toggleDebugMenuLabel: document.getElementById('toggle-debug-menu-label') as HTMLSpanElement,
  dvalaPanelDebugInfo: document.getElementById('dvala-panel-debug-info') as HTMLDivElement,
  contextUndoButton: document.getElementById('context-undo-button') as HTMLAnchorElement,
  contextRedoButton: document.getElementById('context-redo-button') as HTMLAnchorElement,
  dvalaCodeUndoButton: document.getElementById('dvala-code-undo-button') as HTMLAnchorElement,
  dvalaCodeRedoButton: document.getElementById('dvala-code-redo-button') as HTMLAnchorElement,
  contextTitle: document.getElementById('context-title') as HTMLDivElement,
  dvalaCodeTitle: document.getElementById('dvala-code-title') as HTMLDivElement,
  dvalaCodeTitleString: document.getElementById('dvala-code-title-string') as HTMLDivElement,
  effectModal: document.getElementById('effect-modal') as HTMLDivElement,
  effectModalName: document.getElementById('effect-modal-name') as HTMLElement,
  effectModalArgs: document.getElementById('effect-modal-args') as HTMLDivElement,
  effectModalMainButtons: document.getElementById('effect-modal-main-buttons') as HTMLDivElement,
  effectModalInputSection: document.getElementById('effect-modal-input-section') as HTMLDivElement,
  effectModalInputLabel: document.getElementById('effect-modal-input-label') as HTMLSpanElement,
  effectModalValue: document.getElementById('effect-modal-value') as HTMLTextAreaElement,
  effectModalError: document.getElementById('effect-modal-error') as HTMLSpanElement,
}

type MoveParams = {
  id: 'playground'
  startMoveY: number
  heightBeforeMove: number
} | {
  id: 'resize-divider-1' | 'resize-divider-2'
  startMoveX: number
  percentBeforeMove: number
} | {
  id: 'resize-sidebar'
  startMoveX: number
  widthBeforeMove: number
}

type OutputType =
  | 'error'
  | 'output'
  | 'result'
  | 'analyze'
  | 'tokenize'
  | 'parse'
  | 'comment'
  | 'warn'

let moveParams: MoveParams | null = null

let syntaxOverlay: SyntaxOverlay
let autoCompleter: AutoCompleter | null = null
let ignoreSelectionChange = false
let pendingEffectCtx: EffectContext | null = null
let pendingEffectResolve: (() => void) | null = null
let pendingEffectAction: 'resume' | 'fail' | 'suspend' | null = null

function calculateDimensions() {
  return {
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
  }
}

export function openMoreMenu() {
  elements.moreMenu.style.display = 'block'
}

export function closeMoreMenu() {
  elements.moreMenu.style.display = 'none'
}

const expandedApiSections = new Set<string>()

const chevronRight = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M10 6L8.59 7.41L13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'
const chevronDown = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6z"/></svg>'

function expandCollapsible(el: HTMLElement, animate = true) {
  if (!animate)
    el.style.transition = 'none'
  el.classList.add('expanded')
  el.style.maxHeight = `${el.scrollHeight}px`
  if (!animate) {
    void el.offsetHeight
    el.style.transition = ''
  }
}

function collapseCollapsible(el: HTMLElement, animate = true) {
  if (!animate)
    el.style.transition = 'none'
  // Set max-height to current scrollHeight so the transition starts from actual height
  el.style.maxHeight = `${el.scrollHeight}px`
  // Force reflow, then collapse
  void el.offsetHeight
  el.classList.remove('expanded')
  el.style.maxHeight = '0'
  if (!animate) {
    void el.offsetHeight
    el.style.transition = ''
  }
}

export function showTutorialsPage() {
  showPage('tutorials-page', 'smooth')
}

export function toggleApiSection(sectionId: string, animate = true) {
  const chevron = document.getElementById(`api-chevron-${sectionId}`)
  const content = document.getElementById(`api-content-${sectionId}`)

  if (!chevron || !content)
    return

  const isExpanded = expandedApiSections.has(sectionId)

  // Collapse all expanded API sections
  for (const id of [...expandedApiSections]) {
    const c = document.getElementById(`api-content-${id}`)
    const ch = document.getElementById(`api-chevron-${id}`)
    if (c)
      collapseCollapsible(c, animate)
    if (ch)
      ch.innerHTML = chevronRight
    expandedApiSections.delete(id)
  }

  if (!isExpanded) {
    expandedApiSections.add(sectionId)
    expandCollapsible(content, animate)
    chevron.innerHTML = chevronDown
  }
}

const expandedModules = new Set<string>()

export function toggleModuleCategory(categoryKey: string, animate = true) {
  const sanitizedKey = categoryKey.replace(/\s+/g, '-')
  const chevron = document.getElementById(`ns-chevron-${sanitizedKey}`)
  const content = document.getElementById(`ns-content-${sanitizedKey}`)

  if (!chevron || !content)
    return

  const isExpanded = expandedModules.has(categoryKey)

  // Collapse all expanded module categories
  for (const key of [...expandedModules]) {
    const sk = key.replace(/\s+/g, '-')
    const c = document.getElementById(`ns-content-${sk}`)
    const ch = document.getElementById(`ns-chevron-${sk}`)
    if (c)
      collapseCollapsible(c, animate)
    if (ch)
      ch.innerHTML = chevronRight
    expandedModules.delete(key)
  }

  if (!isExpanded) {
    expandedModules.add(categoryKey)
    expandCollapsible(content, animate)
    chevron.innerHTML = chevronDown
  }
}

export function openAddContextMenu() {
  elements.newContextName.value = getState('new-context-name')
  elements.newContextValue.value = getState('new-context-value')
  elements.addContextMenu.style.display = 'block'
  elements.newContextName.focus()
}

export function closeAddContextMenu() {
  elements.addContextMenu.style.display = 'none'
  elements.newContextError.style.display = 'none'
  elements.newContextError.textContent = ''
  elements.newContextName.value = ''
  elements.newContextValue.value = ''
}

export function share() {
  addOutputSeparator()
  appendOutput('Sharable link:', 'comment')
  const href = `${location.origin}${location.pathname}?state=${encodeState()}`
  const a = document.createElement('a')
  a.textContent = href
  a.className = 'share-link'
  a.href = href
  addOutputElement(a)
}

function onDocumentClick(event: Event) {
  const target = event.target as HTMLInputElement | undefined

  if (!target?.closest('#more-menu') && elements.moreMenu.style.display === 'block')
    closeMoreMenu()

  if (!target?.closest('#add-context-menu') && elements.addContextMenu.style.display === 'block')
    closeAddContextMenu()
}

function applyLayout() {
  const { windowWidth, windowHeight } = calculateDimensions()

  const playgroundHeight = Math.min(getState('playground-height'), windowHeight)
  const sidebarWidth = getState('sidebar-width')

  const contextPanelWidth = (windowWidth * getState('resize-divider-1-percent')) / 100
  const outputPanelWidth = (windowWidth * (100 - getState('resize-divider-2-percent'))) / 100
  const dvalaPanelWidth = windowWidth - contextPanelWidth - outputPanelWidth

  elements.playground.style.height = `${playgroundHeight}px`
  elements.contextPanel.style.width = `${contextPanelWidth}px`
  elements.dvalaPanel.style.width = `${dvalaPanelWidth}px`
  elements.outputPanel.style.width = `${outputPanelWidth}px`
  elements.sidebar.style.width = `${sidebarWidth}px`
  elements.sidebar.style.bottom = `${playgroundHeight}px`
  elements.mainPanel.style.left = `${sidebarWidth + 5}px`
  elements.mainPanel.style.bottom = `${playgroundHeight}px`
  elements.resizeSidebar.style.left = `${sidebarWidth}px`
  elements.resizeSidebar.style.bottom = `${playgroundHeight}px`
  elements.wrapper.style.display = 'block'
}

const layout = throttle(applyLayout)

export const undoContextHistory = throttle(() => {
  ignoreSelectionChange = true
  if (undoContext()) {
    applyState()
    focusContext()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export const redoContextHistory = throttle(() => {
  ignoreSelectionChange = true
  if (redoContext()) {
    applyState()
    focusContext()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export const undoDvalaCodeHistory = throttle(() => {
  ignoreSelectionChange = true
  if (undoDvalaCode()) {
    applyState()
    focusDvalaCode()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export const redoDvalaCodeHistory = throttle(() => {
  ignoreSelectionChange = true
  if (redoDvalaCode()) {
    applyState()
    focusDvalaCode()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export function resetPlayground() {
  clearAllStates()

  resetContext()
  resetDvalaCode()
  resetOutput()
  Search.closeSearch()
  Search.clearSearch()

  layout()
  updateCSS()
}

export function resetContext() {
  elements.contextTextArea.value = ''
  clearState('context', 'context-scroll-top', 'context-selection-start', 'context-selection-end')
  focusContext()
}

function setContext(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom') {
  elements.contextTextArea.value = value

  if (pushToHistory) {
    saveState({
      'context': value,
      'context-selection-start': elements.contextTextArea.selectionStart,
      'context-selection-end': elements.contextTextArea.selectionEnd,
    }, true)
  }
  else {
    saveState({ context: value }, false)
  }

  if (scroll === 'top')
    elements.contextTextArea.scrollTo(0, 0)
  else if (scroll === 'bottom')
    elements.contextTextArea.scrollTo({ top: elements.contextTextArea.scrollHeight, behavior: 'smooth' })
}

function getParsedContext(): Record<string, unknown> {
  try {
    return asUnknownRecord(JSON.parse(getState('context')))
  }
  catch (e) {
    return {}
  }
}

export function addContextEntry() {
  const name = elements.newContextName.value
  if (name === '') {
    elements.newContextError.textContent = 'Name is required'
    elements.newContextError.style.display = 'block'
    elements.newContextName.focus()
    return
  }

  const value = elements.newContextValue.value

  try {
    const parsedValue = JSON.parse(value) as unknown
    const context = getParsedContext()
    const bindings: UnknownRecord = Object.assign({}, context.bindings)
    bindings[name] = parsedValue
    context.bindings = bindings
    setContext(JSON.stringify(context, null, 2), true)

    closeAddContextMenu()
  }
  catch (e) {
    elements.newContextError.textContent = 'Invalid JSON'
    elements.newContextError.style.display = 'block'
    elements.newContextValue.focus()
  }

  clearState('new-context-name')
  clearState('new-context-value')
}

function formatContextJson(context: Record<string, unknown>): string {
  const parts: string[] = ['{']
  const entries = Object.entries(context)
  entries.forEach(([key, value], i) => {
    const record = value as Record<string, unknown>
    const subEntries = Object.entries(record)
    parts.push(`  ${JSON.stringify(key)}: {`)
    subEntries.forEach(([subKey, subValue], j) => {
      const comma = j < subEntries.length - 1 ? ',' : ''
      parts.push(`    ${JSON.stringify(subKey)}: ${JSON.stringify(subValue)}${comma}`)
    })
    const comma = i < entries.length - 1 ? ',' : ''
    parts.push(`  }${comma}`)
  })
  parts.push('}')
  return parts.join('\n')
}

export function addSampleContext() {
  const context = getParsedContext()
  const sampleBindings = {
    'a-number': 42,
    'a-string': 'foo bar',
    'an-array': ['foo', 'bar', 1, 2, true, false, null],
    'an-object': {
      name: 'John Doe',
      age: 42,
      married: true,
      children: ['Alice', 'Bob'],
      address: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
      },
    },
    'matrix-a': [
      [1, 2, 3],
      [4, 5, 6],
    ],
    'matrix-b': [
      [7, 8],
      [9, 10],
      [11, 12],
    ],
    'matrix-c': [
      [3, 0, 2],
      [2, 0, -2],
      [0, 1, 1],
    ],
  }

  context.bindings = Object.assign(sampleBindings, context.bindings)

  const sampleEffectHandlers: Record<string, string> = {
    // eslint-disable-next-line no-template-curly-in-string
    'host.greet': 'async ({ args: [name], resume }) => { resume(`Hello, ${name}!`) }',
    'host.add': 'async ({ args: [a, b], resume }) => { resume(a + b) }',
    'host.delay': `async ({ args: [ms], resume }) => {
  await new Promise(resolve => setTimeout(resolve, ms));
  resume(ms);
}`,
  }

  context.effectHandlers = Object.assign(sampleEffectHandlers, context.effectHandlers as Record<string, string> | undefined)

  setContext(formatContextJson(context), true)
}

export function resetDvalaCode() {
  elements.dvalaTextArea.value = ''
  syntaxOverlay.update()
  clearState('dvala-code', 'dvala-code-scroll-top', 'dvala-code-selection-start', 'dvala-code-selection-end')
  focusDvalaCode()
}

function setDvalaCode(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom') {
  elements.dvalaTextArea.value = value
  syntaxOverlay.update()

  if (pushToHistory) {
    saveState({
      'dvala-code': value,
      'dvala-code-selection-start': elements.dvalaTextArea.selectionStart,
      'dvala-code-selection-end': elements.dvalaTextArea.selectionEnd,
    }, true)
  }
  else {
    saveState({ 'dvala-code': value }, false)
  }

  if (scroll === 'top')
    elements.dvalaTextArea.scrollTo(0, 0)
  else if (scroll === 'bottom')
    elements.dvalaTextArea.scrollTo({ top: elements.dvalaTextArea.scrollHeight, behavior: 'smooth' })
}

export function resetOutput() {
  elements.outputResult.innerHTML = ''
  clearState('output')
}

function hasOutput() {
  return getState('output').trim() !== ''
}

function setOutput(value: string, pushToHistory: boolean) {
  elements.outputResult.innerHTML = value
  saveState({ output: value }, pushToHistory)
}

function appendOutput(output: unknown, className: OutputType) {
  const outputElement = document.createElement('span')
  outputElement.className = className
  outputElement.textContent = `${output}`
  addOutputElement(outputElement)
}

function addOutputSeparator() {
  if (hasOutput()) {
    const separator = document.createElement('div')
    separator.className = 'separator'
    addOutputElement(separator)
  }
}

function addOutputElement(element: HTMLElement) {
  elements.outputResult.appendChild(element)
  elements.outputResult.scrollTop = elements.outputResult.scrollHeight

  saveState({ output: elements.outputResult.innerHTML })
}

window.onload = function () {
  syntaxOverlay = new SyntaxOverlay('dvala-textarea')

  elements.contextUndoButton.classList.add('disabled')
  elements.contextRedoButton.classList.add('disabled')
  elements.dvalaCodeUndoButton.classList.add('disabled')
  elements.dvalaCodeRedoButton.classList.add('disabled')
  setContextHistoryListener((status) => {
    if (status.canUndo) {
      elements.contextUndoButton.classList.remove('disabled')
    }
    else {
      elements.contextUndoButton.classList.add('disabled')
    }

    if (status.canRedo) {
      elements.contextRedoButton.classList.remove('disabled')
    }
    else {
      elements.contextRedoButton.classList.add('disabled')
    }
  })

  setDvalaCodeHistoryListener((status) => {
    if (status.canUndo) {
      elements.dvalaCodeUndoButton.classList.remove('disabled')
    }
    else {
      elements.dvalaCodeUndoButton.classList.add('disabled')
    }

    if (status.canRedo) {
      elements.dvalaCodeRedoButton.classList.remove('disabled')
    }
    else {
      elements.dvalaCodeRedoButton.classList.add('disabled')
    }
  })

  document.addEventListener('click', onDocumentClick, true)

  elements.resizePlayground.onmousedown = (event) => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'playground',
      startMoveY: event.clientY,
      heightBeforeMove: getState('playground-height'),
    }
  }

  elements.resizeDevider1.onmousedown = (event) => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'resize-divider-1',
      startMoveX: event.clientX,
      percentBeforeMove: getState('resize-divider-1-percent'),
    }
  }

  elements.resizeDevider2.onmousedown = (event) => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'resize-divider-2',
      startMoveX: event.clientX,
      percentBeforeMove: getState('resize-divider-2-percent'),
    }
  }

  elements.resizeSidebar.onmousedown = (event) => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'resize-sidebar',
      startMoveX: event.clientX,
      widthBeforeMove: getState('sidebar-width'),
    }
  }

  window.onresize = layout
  window.onmouseup = () => {
    document.body.classList.remove('no-select')
    if (moveParams !== null) {
      if (moveParams.id === 'playground')
        saveState({ 'playground-height': getState('playground-height') }, false)
      else if (moveParams.id === 'resize-divider-1')
        saveState({ 'resize-divider-1-percent': getState('resize-divider-1-percent') }, false)
      else if (moveParams.id === 'resize-divider-2')
        saveState({ 'resize-divider-2-percent': getState('resize-divider-2-percent') }, false)
      else if (moveParams.id === 'resize-sidebar')
        saveState({ 'sidebar-width': getState('sidebar-width') }, false)
    }
    moveParams = null
  }

  window.onmousemove = (event: MouseEvent) => {
    const { windowHeight, windowWidth } = calculateDimensions()
    if (moveParams === null)
      return

    if (moveParams.id === 'playground') {
      let playgroundHeight = moveParams.heightBeforeMove + moveParams.startMoveY - event.clientY
      if (playgroundHeight < 30)
        playgroundHeight = 30

      if (playgroundHeight > windowHeight)
        playgroundHeight = windowHeight

      updateState({ 'playground-height': playgroundHeight })
      applyLayout()
    }
    else if (moveParams.id === 'resize-divider-1') {
      let resizeDivider1XPercent
        = moveParams.percentBeforeMove + ((event.clientX - moveParams.startMoveX) / windowWidth) * 100
      if (resizeDivider1XPercent < 10)
        resizeDivider1XPercent = 10

      if (resizeDivider1XPercent > getState('resize-divider-2-percent') - 10)
        resizeDivider1XPercent = getState('resize-divider-2-percent') - 10

      updateState({ 'resize-divider-1-percent': resizeDivider1XPercent })
      applyLayout()
    }
    else if (moveParams.id === 'resize-divider-2') {
      let resizeDivider2XPercent
        = moveParams.percentBeforeMove + ((event.clientX - moveParams.startMoveX) / windowWidth) * 100
      if (resizeDivider2XPercent < getState('resize-divider-1-percent') + 10)
        resizeDivider2XPercent = getState('resize-divider-1-percent') + 10

      if (resizeDivider2XPercent > 90)
        resizeDivider2XPercent = 90

      updateState({ 'resize-divider-2-percent': resizeDivider2XPercent })
      applyLayout()
    }
    else if (moveParams.id === 'resize-sidebar') {
      let sidebarWidth = moveParams.widthBeforeMove + (event.clientX - moveParams.startMoveX)
      if (sidebarWidth < 150)
        sidebarWidth = 150

      if (sidebarWidth > windowWidth * 0.5)
        sidebarWidth = windowWidth * 0.5

      updateState({ 'sidebar-width': sidebarWidth })
      applyLayout()
    }
  }

  window.addEventListener('keydown', (evt) => {
    if (Search.handleKeyDown(evt))
      return

    if (evt.ctrlKey) {
      switch (evt.key) {
        case 'r':
          evt.preventDefault()
          void run()
          break
        case 'a':
          evt.preventDefault()
          analyze()
          break
        case 't':
          evt.preventDefault()
          tokenize()
          break
        case 'p':
          evt.preventDefault()
          parse()
          break
        case 'f':
          evt.preventDefault()
          format()
          break
        case 'd':
          evt.preventDefault()
          toggleDebug()
          break
        case '1':
          evt.preventDefault()
          focusContext()
          break
        case '2':
          evt.preventDefault()
          focusDvalaCode()
          break
      }
    }
    if (evt.key === 'Escape') {
      closeMoreMenu()
      closeAddContextMenu()
      if (pendingEffectAction)
        cancelEffectAction()
      else if (pendingEffectCtx)
        selectEffectAction('ignore')
      evt.preventDefault()
    }
    if (evt.key === 'Enter' && pendingEffectCtx && !pendingEffectAction) {
      evt.preventDefault()
      selectEffectAction('resume')
    }
    if (((isMac() && evt.metaKey) || (!isMac && evt.ctrlKey)) && !evt.shiftKey && evt.key === 'z') {
      evt.preventDefault()
      if (document.activeElement === elements.contextTextArea)
        undoContextHistory()
      else if (document.activeElement === elements.dvalaTextArea)
        undoDvalaCodeHistory()
    }
    if (((isMac() && evt.metaKey) || (!isMac && evt.ctrlKey)) && evt.shiftKey && evt.key === 'z') {
      evt.preventDefault()
      if (document.activeElement === elements.contextTextArea)
        redoContextHistory()
      else if (document.activeElement === elements.dvalaTextArea)
        redoDvalaCodeHistory()
    }
  })
  elements.contextTextArea.addEventListener('keydown', (evt) => {
    keydownHandler(evt, () => setContext(elements.contextTextArea.value, true))
  })
  elements.contextTextArea.addEventListener('input', () => {
    setContext(elements.contextTextArea.value, true)
  })
  elements.contextTextArea.addEventListener('scroll', () => {
    saveState({ 'context-scroll-top': elements.contextTextArea.scrollTop })
  })
  elements.contextTextArea.addEventListener('selectionchange', () => {
    if (!ignoreSelectionChange) {
      saveState({
        'context-selection-start': elements.contextTextArea.selectionStart,
        'context-selection-end': elements.contextTextArea.selectionEnd,
      })
    }
  })
  elements.contextTextArea.addEventListener('focusin', () => {
    saveState({ 'focused-panel': 'context' })
    updateCSS()
  })
  elements.contextTextArea.addEventListener('focusout', () => {
    saveState({ 'focused-panel': null })
    updateCSS()
  })

  elements.dvalaTextArea.addEventListener('keydown', (evt) => {
    keydownHandler(evt, () => setDvalaCode(elements.dvalaTextArea.value, true))
  })
  elements.dvalaTextArea.addEventListener('input', () => {
    setDvalaCode(elements.dvalaTextArea.value, true)
    syntaxOverlay.update()
  })
  elements.dvalaTextArea.addEventListener('scroll', () => {
    saveState({ 'dvala-code-scroll-top': elements.dvalaTextArea.scrollTop })
    syntaxOverlay.syncScroll()
  })
  elements.dvalaTextArea.addEventListener('selectionchange', () => {
    if (!ignoreSelectionChange) {
      saveState({
        'dvala-code-selection-start': elements.dvalaTextArea.selectionStart,
        'dvala-code-selection-end': elements.dvalaTextArea.selectionEnd,
      })
    }
  })
  elements.dvalaTextArea.addEventListener('focusin', () => {
    saveState({ 'focused-panel': 'dvala-code' })
    updateCSS()
  })
  elements.dvalaTextArea.addEventListener('focusout', () => {
    saveState({ 'focused-panel': null })
    updateCSS()
  })

  elements.outputResult.addEventListener('scroll', () => {
    saveState({ 'output-scroll-top': elements.outputResult.scrollTop })
  })

  elements.newContextName.addEventListener('input', () => {
    saveState({ 'new-context-name': elements.newContextName.value })
  })
  elements.newContextValue.addEventListener('input', () => {
    saveState({ 'new-context-value': elements.newContextValue.value })
  })

  applyState(true)

  const id = location.hash.substring(1) || 'index'
  showPage(id, 'instant', 'replace')

  Search.onClose(() => {
    applyState()
  })
}

function getDataFromUrl() {
  const urlParams = new URLSearchParams(window.location.search)
  const urlState = urlParams.get('state')
  if (urlState) {
    addOutputSeparator()
    if (applyEncodedState(urlState))
      appendOutput(`Data parsed from url parameter state: ${urlState}`, 'comment')
    else
      appendOutput(`Invalid url parameter state: ${urlState}`, 'error')

    urlParams.delete('state')
    history.replaceState(null, '', `${location.pathname}${urlParams.toString() ? '?' : ''}${urlParams.toString()}`)
  }
}

function keydownHandler(evt: KeyboardEvent, onChange: () => void): void {
  const target = evt.target as HTMLTextAreaElement
  const start = target.selectionStart
  const end = target.selectionEnd
  const indexOfReturn = target.value.lastIndexOf('\n', start - 1)
  const rowLength = start - indexOfReturn - 1
  const onTabStop = rowLength % 2 === 0

  if (
    (!['Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(evt.key) && evt.code !== 'Space')
    || (evt.code === 'Space' && !evt.altKey)
  ) {
    autoCompleter = null
  }

  if (evt.code === 'Space' && evt.altKey) {
    evt.preventDefault()
    if (!autoCompleter) {
      autoCompleter = getAutoCompleter(target.value, start, { bindings: getDvalaParamsFromContext().bindings })
    }
    const suggestion = evt.shiftKey ? autoCompleter.getPreviousSuggestion() : autoCompleter.getNextSuggestion()
    if (suggestion) {
      target.value = suggestion.program
      target.selectionStart = target.selectionEnd = suggestion.position
      onChange()
    }
    return
  }

  switch (evt.code) {
    case 'Tab':
      evt.preventDefault()
      if (!evt.shiftKey) {
        target.value = target.value.substring(0, start) + (onTabStop ? '  ' : ' ') + target.value.substring(end)
        target.selectionStart = target.selectionEnd = start + (onTabStop ? 2 : 1)
        onChange()
      }
      break
    case 'Escape':
      evt.preventDefault()
      if (autoCompleter) {
        target.value = autoCompleter.originalProgram
        target.selectionStart = target.selectionEnd = autoCompleter.originalPosition
        autoCompleter = null
        onChange()
      }
      break
    case 'Backspace':
      if (onTabStop && start === end && target.value.substring(start - 2, start + 2) === '  ') {
        evt.preventDefault()
        target.value = target.value.substring(0, start - 2) + target.value.substring(end)
        target.selectionStart = target.selectionEnd = start - 2
        onChange()
      }
      break
    case 'Enter': {
      evt.preventDefault()
      // eslint-disable-next-line regexp/optimal-quantifier-concatenation
      const spaceCount = target.value.substring(indexOfReturn + 1, start).replace(/^( *).*/, '$1').length
      target.value = `${target.value.substring(0, start)}\n${' '.repeat(spaceCount)}${target.value.substring(end)}`
      target.selectionStart = target.selectionEnd = start + 1 + spaceCount
      onChange()
      break
    }

    case 'Delete':
      if (onTabStop && start === end && target.value.substring(start, start + 2) === '  ') {
        evt.preventDefault()
        target.value = target.value.substring(0, start) + target.value.substring(end + 2)
        target.selectionStart = target.selectionEnd = start
        onChange()
      }
      break
  }
}

window.addEventListener('popstate', () => {
  const id = location.hash.substring(1) || 'index'
  showPage(id, 'instant', 'none')
})

function truncateCode(code: string) {
  const oneLiner = tokenizeSource(code).tokens.map(t => t[0] === 'Whitespace' ? ' ' : t[1]).join('').trim()
  const count = 100
  if (oneLiner.length <= count)
    return oneLiner
  else
    return `${oneLiner.substring(0, count - 3)}...`
}
export async function run() {
  addOutputSeparator()
  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Run selection' : 'Run'

  appendOutput(`${title}: ${truncateCode(code)}`, 'comment')

  const dvalaParams = getDvalaParamsFromContext()

  const hijacker = hijackConsole()
  try {
    const runResult = await getDvala().runAsync(code, { bindings: dvalaParams.bindings, effectHandlers: dvalaParams.effectHandlers })
    if (runResult.type === 'error')
      throw runResult.error
    const result = runResult.type === 'completed' ? runResult.value : null
    const content = stringifyValue(result, false)
    appendOutput(content, 'result')
  }
  catch (error) {
    appendOutput(error, 'error')
  }
  finally {
    hijacker.releaseConsole()
    focusDvalaCode()
  }
}

export function analyze() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Analyze selection' : 'Analyze'

  appendOutput(`${title}: ${truncateCode(code)}`, 'comment')

  const dvalaParams = getDvalaParamsFromContext()
  const hijacker = hijackConsole()
  try {
    const result = getUndefinedSymbols(code, { bindings: dvalaParams.bindings })
    const unresolvedSymbols = Array.from(result).join(', ')
    const unresolvedSymbolsOutput = `Unresolved symbols: ${unresolvedSymbols || '-'}`

    appendOutput(`${unresolvedSymbolsOutput}`, 'analyze')
  }
  catch (error) {
    appendOutput(error, 'error')
  }
  finally {
    hijacker.releaseConsole()
    focusDvalaCode()
  }
}

export function parse() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Parse selection' : 'Parse'

  appendOutput(`${title}${getState('debug') ? ' (debug):' : ':'} ${truncateCode(code)}`, 'comment')

  const hijacker = hijackConsole()
  try {
    const tokens = tokenizeSource(code, getState('debug'))
    const result = parseTokenStream(tokens)
    const content = JSON.stringify(result, null, 2)
    appendOutput(content, 'parse')
    hijacker.releaseConsole()
    console.log(result)
  }
  catch (error) {
    appendOutput(error, 'error')
    hijacker.releaseConsole()
  }
  finally {
    focusDvalaCode()
  }
}

export function tokenize() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Tokenize selection' : 'Tokenize'

  appendOutput(`${title}${getState('debug') ? ' (debug):' : ':'} ${truncateCode(code)}`, 'comment')

  const hijacker = hijackConsole()
  try {
    const result = tokenizeSource(code, getState('debug'))
    const content = JSON.stringify(result, null, 2)
    appendOutput(content, 'tokenize')
    hijacker.releaseConsole()
    console.log(result)
  }
  catch (error) {
    appendOutput(error, 'error')
    hijacker.releaseConsole()
    return
  }
  finally {
    focusDvalaCode()
  }
}

export function format() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Format selection' : 'Format'

  appendOutput(`${title}: ${truncateCode(code)}`, 'comment')

  setDvalaCode(code, true)

  if (selectedCode.code) {
    saveState({
      'focused-panel': 'dvala-code',
      'dvala-code-selection-start': selectedCode.selectionStart,
      'dvala-code-selection-end': selectedCode.selectionStart + code.length,
    })
  }
  else {
    saveState({
      'focused-panel': 'dvala-code',
      'dvala-code-selection-start': selectedCode.selectionStart,
      'dvala-code-selection-end': selectedCode.selectionEnd,
    })
  }
  applyState()
}

export function toggleDebug() {
  const debug = !getState('debug')
  saveState({ debug })
  updateCSS()
  addOutputSeparator()
  appendOutput(`Debug mode toggled ${debug ? 'ON' : 'OFF'}`, 'comment')
  focusDvalaCode()
}

export function focusContext() {
  elements.contextTextArea.focus()
}

export function focusDvalaCode() {
  elements.dvalaTextArea.focus()
}

async function defaultEffectHandler(ctx: EffectContext): Promise<void> {
  pendingEffectCtx = ctx
  elements.effectModalName.textContent = ctx.effectName
  elements.effectModalArgs.innerHTML = ''
  if (ctx.args.length === 0) {
    const empty = document.createElement('span')
    empty.textContent = '(no arguments)'
    empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
    elements.effectModalArgs.appendChild(empty)
  }
  else {
    ctx.args.forEach((arg) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex; flex-direction:column; gap:1px; border-left: 2px solid rgb(82 82 82); padding-left: 6px;'
      const code = document.createElement('code')
      code.textContent = JSON.stringify(arg, null, 2)
      code.style.cssText = 'white-space:pre; font-size:0.75rem; color: rgb(212 212 212);'
      row.appendChild(code)
      elements.effectModalArgs.appendChild(row)
    })
  }
  elements.effectModalInputSection.style.display = 'none'
  elements.effectModalMainButtons.style.opacity = '1'
  elements.effectModalMainButtons.style.pointerEvents = 'auto'
  elements.effectModal.style.display = 'flex'
  return new Promise((resolve) => {
    pendingEffectResolve = resolve
  })
}

function closeEffectModal() {
  elements.effectModal.style.display = 'none'
  pendingEffectCtx = null
  pendingEffectResolve = null
  pendingEffectAction = null
}

export function selectEffectAction(action: 'resume' | 'fail' | 'suspend' | 'ignore') {
  if (!pendingEffectCtx || !pendingEffectResolve)
    return

  if (action === 'ignore') {
    const resolve = pendingEffectResolve
    pendingEffectCtx.next()
    closeEffectModal()
    resolve()
    return
  }

  pendingEffectAction = action
  const labels: Record<typeof action, string> = {
    resume: 'Resume value (JSON)',
    fail: 'Error message (optional)',
    suspend: 'Meta (JSON, optional)',
  }
  elements.effectModalInputLabel.textContent = labels[action]
  elements.effectModalValue.value = action === 'resume' ? 'null' : ''
  elements.effectModalError.style.display = 'none'
  elements.effectModalMainButtons.style.opacity = '0.4'
  elements.effectModalMainButtons.style.pointerEvents = 'none'
  elements.effectModalInputSection.style.display = 'flex'
  elements.effectModalValue.focus()
}

export function cancelEffectAction() {
  pendingEffectAction = null
  elements.effectModalInputSection.style.display = 'none'
  elements.effectModalMainButtons.style.opacity = '1'
  elements.effectModalMainButtons.style.pointerEvents = 'auto'
}

export function confirmEffectAction() {
  if (!pendingEffectCtx || !pendingEffectResolve || !pendingEffectAction)
    return

  const valueStr = elements.effectModalValue.value.trim()
  const resolve = pendingEffectResolve

  if (pendingEffectAction === 'resume') {
    try {
      const value = JSON.parse(valueStr) as Any
      pendingEffectCtx.resume(value)
      closeEffectModal()
      resolve()
    }
    catch {
      elements.effectModalError.textContent = 'Invalid JSON'
      elements.effectModalError.style.display = 'block'
      elements.effectModalValue.focus()
    }
  }
  else if (pendingEffectAction === 'fail') {
    pendingEffectCtx.fail(valueStr || undefined)
    closeEffectModal()
    resolve()
  }
  else if (pendingEffectAction === 'suspend') {
    let meta: Any | undefined
    if (valueStr) {
      try {
        meta = JSON.parse(valueStr) as Any
      }
      catch {
        elements.effectModalError.textContent = 'Invalid JSON'
        elements.effectModalError.style.display = 'block'
        elements.effectModalValue.focus()
        return
      }
    }
    pendingEffectCtx.suspend(meta)
    closeEffectModal()
    resolve()
  }
}

function getDvalaParamsFromContext(): { bindings: Record<string, unknown>, effectHandlers: Record<string, EffectHandler> } {
  const contextString = getState('context')
  try {
    const parsedContext
      = contextString.trim().length > 0
        ? JSON.parse(contextString) as UnknownRecord
        : {}

    const parsedHandlers = asUnknownRecord(parsedContext.effectHandlers ?? {})
    const bindings = asUnknownRecord(parsedContext.bindings ?? {})

    const effectHandlers: Record<string, EffectHandler> = Object.entries(parsedHandlers).reduce((acc: Record<string, EffectHandler>, [key, value]) => {
      if (typeof value !== 'string') {
        console.log(key, value)
        throw new TypeError(`Invalid handler value. "${key}" should be a javascript function string`)
      }

      // eslint-disable-next-line no-eval
      const fn = eval(value) as EffectHandler

      if (typeof fn !== 'function') {
        throw new TypeError(`Invalid handler value. "${key}" should be a javascript function`)
      }

      acc[key] = fn
      return acc
    }, {})

    if (!effectHandlers['*'])
      effectHandlers['*'] = defaultEffectHandler

    return {
      bindings,
      effectHandlers,
    }
  }
  catch (err) {
    appendOutput(`Error: ${(err as Error).message}\nCould not parse context:\n${contextString}`, 'error')
    return { bindings: {}, effectHandlers: { '*': defaultEffectHandler } }
  }
}
function getSelectedDvalaCode(): {
  code: string
  leadingCode: string
  trailingCode: string
  selectionStart: number
  selectionEnd: number
} {
  const selectionStart = getState('dvala-code-selection-start')
  const selectionEnd = getState('dvala-code-selection-end')

  return {
    leadingCode: elements.dvalaTextArea.value.substring(0, selectionStart),
    trailingCode: elements.dvalaTextArea.value.substring(selectionEnd),
    code: elements.dvalaTextArea.value.substring(selectionStart, selectionEnd),
    selectionStart,
    selectionEnd,
  }
}

function applyState(scrollToTop = false) {
  const contextTextAreaSelectionStart = getState('context-selection-start')
  const contextTextAreaSelectionEnd = getState('context-selection-end')
  const dvalaTextAreaSelectionStart = getState('dvala-code-selection-start')
  const dvalaTextAreaSelectionEnd = getState('dvala-code-selection-end')

  setOutput(getState('output'), false)
  getDataFromUrl()

  setContext(getState('context'), false)
  elements.contextTextArea.selectionStart = contextTextAreaSelectionStart
  elements.contextTextArea.selectionEnd = contextTextAreaSelectionEnd

  setDvalaCode(getState('dvala-code'), false, scrollToTop ? 'top' : undefined)
  elements.dvalaTextArea.selectionStart = dvalaTextAreaSelectionStart
  elements.dvalaTextArea.selectionEnd = dvalaTextAreaSelectionEnd

  updateCSS()
  layout()

  setTimeout(() => {
    if (getState('focused-panel') === 'context')
      focusContext()
    else if (getState('focused-panel') === 'dvala-code')
      focusDvalaCode()

    elements.contextTextArea.scrollTop = getState('context-scroll-top')
    elements.dvalaTextArea.scrollTop = getState('dvala-code-scroll-top')
    elements.outputResult.scrollTop = getState('output-scroll-top')
  }, 0)
}

function updateCSS() {
  const debug = getState('debug')
  elements.toggleDebugMenuLabel.textContent = debug ? 'Debug: ON' : 'Debug: OFF'
  elements.dvalaPanelDebugInfo.style.display = debug ? 'flex' : 'none'

  elements.dvalaCodeTitle.style.color = (getState('focused-panel') === 'dvala-code') ? 'white' : ''
  elements.dvalaCodeTitleString.textContent = 'Dvala Code'
  elements.contextTitle.style.color = (getState('focused-panel') === 'context') ? 'white' : ''
}

export function showPage(id: string, scroll: 'smooth' | 'instant' | 'none', historyEvent: 'replace' | 'push' | 'none' = 'push') {
  setTimeout(() => {
    inactivateAll()

    Search.closeSearch()
    const page = document.getElementById(id)
    const linkElementId = `${(!id || id === 'index') ? 'home-page' : id}_link`
    const link = document.getElementById(linkElementId)

    elements.mainPanel.scrollTo({ top: 0 })

    if (!page) {
      showPage('index', scroll, 'replace')
      return
    }

    page.classList.add('active-content')
    if (link) {
      link.classList.add('active-sidebar-entry')

      // If the link is inside a collapsed API section, expand it first
      const apiContent = link.closest('[id^="api-content-"]')
      if (apiContent && apiContent instanceof HTMLElement && !apiContent.classList.contains('expanded')) {
        const sectionId = apiContent.id.replace('api-content-', '')
        toggleApiSection(sectionId, false)
      }

      // If the link is inside a collapsed module section, expand it first
      const nsContent = link.closest('[id^="ns-content-"]')
      if (nsContent && nsContent instanceof HTMLElement && !nsContent.classList.contains('expanded')) {
        const categoryKey = nsContent.id.replace('ns-content-', '').replace(/-/g, ' ')
        toggleModuleCategory(categoryKey, false)
        // Also expand the parent 'modules' API section if collapsed
        const modulesContent = document.getElementById('api-content-modules')
        if (modulesContent && !modulesContent.classList.contains('expanded')) {
          toggleApiSection('modules', false)
        }
      }

      if (scroll !== 'none')
        link.scrollIntoView({ block: 'center', behavior: scroll })
    }

    if (id === 'index')
      history.replaceState(null, 'Dvala', window.location.pathname + window.location.search)

    else if (historyEvent === 'replace')
      history.replaceState(null, '', `#${id}`)

    else if (historyEvent !== 'none')
      history.pushState(null, '', `#${id}`)
  }, 0)
}

function inactivateAll() {
  let els = document.getElementsByClassName('active-content')
  while (els[0])
    els[0].classList.remove('active-content')

  els = document.getElementsByClassName('active-sidebar-entry')
  while (els[0])
    els[0].classList.remove('active-sidebar-entry')
}

export function addToPlayground(name: string, encodedExample: string) {
  const example = decodeURIComponent(atob(encodedExample))
  setDvalaCode(`// ${name}\n\n${example}\n`, true, 'top')
  addOutputSeparator()
  appendOutput('Example loaded in editor', 'comment')
  saveState({ 'focused-panel': 'dvala-code' })
  applyState()
}

export function copyExample(encodedExample: string) {
  const code = decodeURIComponent(atob(encodedExample))
  void navigator.clipboard.writeText(code)
  addOutputSeparator()
  appendOutput('Example copied to clipboard', 'comment')
}

export function copyCode(encodedCode: string) {
  const code = decodeURIComponent(atob(encodedCode))
  void navigator.clipboard.writeText(code)
  addOutputSeparator()
  appendOutput('Code copied to clipboard', 'comment')
}

export function setPlayground(name: string, encodedExample: string) {
  const example = JSON.parse(decodeURIComponent(atob(encodedExample))) as Example

  const context = example.context
    ? formatContextJson(example.context as Record<string, unknown>)
    : ''

  setContext(context, true, 'top')

  const code = example.code ? example.code : ''
  const size = Math.max(name.length + 10, 40)
  const paddingLeft = Math.floor((size - name.length) / 2)
  const paddingRight = Math.ceil((size - name.length) / 2)
  setDvalaCode(`
${`/*${'*'.repeat(size)}**`}
${` *${' '.repeat(paddingLeft)}${name}${' '.repeat(paddingRight)} *`}
${` *${'*'.repeat(size)}**/`}

${code}
`.trimStart(), true, 'top')
  saveState({ 'focused-panel': 'dvala-code' })
  applyState()
  addOutputSeparator()
  appendOutput(`Example loaded: ${name}`, 'comment')
}

function hijackConsole() {
  const oldLog = console.log
  console.log = function (...args: unknown[]) {
    const logRow = args.map(arg => stringifyValue(arg, false)).join(' ')
    appendOutput(logRow, 'output')
  }
  const oldWarn = console.warn
  console.warn = function (...args: unknown[]) {
    oldWarn.apply(console, args)
    appendOutput(args[0], 'warn')
  }
  const oldError = console.error
  console.warn = function (...args: unknown[]) {
    oldError.apply(console, args)
    appendOutput(args[0], 'error')
  }
  return {
    releaseConsole: () => {
      console.log = oldLog
      console.warn = oldWarn
    },
  }
}
