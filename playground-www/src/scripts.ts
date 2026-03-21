/* eslint-disable no-console */
import { stringifyValue } from '../../common/utils'
import type { Example } from '../../reference/examples'
import { getLinkName, makeLinkName } from '../../reference'
import type { Any, UnknownRecord } from '../../src/interface'
import { createDvala } from '../../src/createDvala'
import type { EffectContext, EffectHandler, HandlerRegistration, Snapshot } from '../../src/evaluator/effectTypes'
import { extractCheckpointSnapshots } from '../../src/evaluator/suspension'
import { allBuiltinModules } from '../../src/allModules'
import '../../src/initReferenceData'
import { retrigger } from '../../src/retrigger'
import { resume } from '../../src/resume'
import { asUnknownRecord } from '../../src/typeGuards'
import type { AutoCompleter } from '../../src/AutoCompleter/AutoCompleter'
import { getAutoCompleter, getUndefinedSymbols, parseTokenStream, tokenizeSource, untokenize } from '../../src/tooling'
import type { DvalaErrorJSON } from '../../src/errors'
import { closeSearch, handleSearchKeyDown, initSearchDialog, onSearchClose } from './components/searchDialog'
import { copyIcon, hamburgerIcon } from './icons'
import { renderShell } from './shell'
import * as router from './router'
import { renderDocPage } from './components/docPage'
import { renderCorePage } from './components/corePage'
import { renderModulesPage } from './components/modulesPage'
import { renderExamplePage } from './components/examplePage'
import { renderAboutPage } from './components/aboutPage'
import { renderStartPage } from './components/startPage'
import { renderTutorialsIndexPage, renderTutorialPage, allTutorials } from './components/tutorialPage'
import { playgroundEffectReference } from './playgroundEffects'
import {
  clearAll as clearAllSnapshots,
  getSavedSnapshots,
  getTerminalSnapshots,
  init as initSnapshotStorage,
  setSavedSnapshots,
  setTerminalSnapshots,
} from './snapshotStorage'
import type { SavedSnapshot, TerminalSnapshotEntry } from './snapshotStorage'
import {
  clearAllPrograms,
  getSavedPrograms,
  initPrograms,
  setSavedPrograms,
} from './programStorage'
import type { SavedProgram } from './programStorage'
import {
  applyEncodedState,
  clearAllStates,
  clearState,
  defaultState,
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
import { decodeSnapshot, encodeSnapshot } from './snapshotUtils'
import { SyntaxOverlay } from './SyntaxOverlay'
import { isMac, throttle } from './utils'
import { createPlaygroundAPI } from './playgroundAPI'
import { createEffectHandlers } from './createEffectHandlers'

const dvalaDebug = createDvala({ debug: true, modules: allBuiltinModules })
const dvalaNoDebug = createDvala({ debug: false, modules: allBuiltinModules })
const getDvala = (forceDebug?: 'debug') => forceDebug || getState('debug') ? dvalaDebug : dvalaNoDebug

// ---------------------------------------------------------------------------
// Playground effect handlers (playground.*)
// ---------------------------------------------------------------------------
let _playgroundHandlers: HandlerRegistration[] | null = null

function getPlaygroundEffectHandlers(): HandlerRegistration[] {
  if (!_playgroundHandlers) {
    const api = createPlaygroundAPI({
      showToast: (msg, opts) => showToast(msg, opts),
      isEditorReadOnly: () => elements.dvalaTextArea.readOnly,
      getEditorContent: () => elements.dvalaTextArea.value,
      setEditorContent: code => {
        elements.dvalaTextArea.value = code
        syntaxOverlay.update()
        saveState({ 'dvala-code': code }, false)
      },
      insertEditorText: (text, position) => {
        const ta = elements.dvalaTextArea
        const pos = position ?? ta.selectionStart
        ta.setRangeText(text, pos, pos, 'end')
        syntaxOverlay.update()
        saveState({ 'dvala-code': ta.value }, false)
      },
      getEditorSelection: () => {
        const ta = elements.dvalaTextArea
        return ta.value.slice(ta.selectionStart, ta.selectionEnd)
      },
      setEditorSelection: (start, end) => {
        const ta = elements.dvalaTextArea
        ta.selectionStart = start
        ta.selectionEnd = end
        ta.focus()
      },
      getEditorCursor: () => elements.dvalaTextArea.selectionStart,
      setEditorCursor: position => {
        const ta = elements.dvalaTextArea
        ta.selectionStart = ta.selectionEnd = position
        ta.focus()
      },
      getContextContent: () => elements.contextTextArea.value,
      setContextContent: json => {
        elements.contextTextArea.value = json
        saveState({ context: json }, false)
      },
      getSavedPrograms: () => getSavedPrograms(),
      saveProgram: (name, code) => {
        const programs = getSavedPrograms()
        const existing = programs.find(p => p.name === name)
        const now = Date.now()
        if (existing) {
          existing.code = code
          existing.updatedAt = now
          setSavedPrograms([...programs])
        } else {
          const newProgram: SavedProgram = {
            id: crypto.randomUUID(),
            name,
            code,
            context: '',
            createdAt: now,
            updatedAt: now,
            locked: false,
          }
          setSavedPrograms([newProgram, ...programs])
        }
      },
      runCode: async code => {
        const result = await getDvala().runAsync(code, { bindings: {}, effectHandlers: [], pure: false })
        if (result.type === 'error') throw result.error
        if (result.type === 'suspended') throw new Error('Program suspended')
        return result.value
      },
      navigateTo: route => {
        router.navigate(route.startsWith('/') ? route : `/${route}`)
      },
      navigateBack: () => {
        history.back()
      },
    })
    _playgroundHandlers = createEffectHandlers(api)
  }
  return _playgroundHandlers
}

// Inject CSS for list animations
const animationStyles = document.createElement('style')
animationStyles.textContent = `
  @keyframes snapshotSlideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes snapshotSlideOut {
    from {
      opacity: 1;
      max-height: 100px;
      margin-bottom: 0.5rem;
    }
    to {
      opacity: 0;
      max-height: 0;
      margin-bottom: 0;
      padding-top: 0;
      padding-bottom: 0;
    }
  }
  .snapshot-card.animate-in {
    animation: snapshotSlideIn 0.25s ease-out;
  }
  .snapshot-card.removing {
    animation: snapshotSlideOut 0.2s ease-out forwards;
    overflow: hidden;
  }
`
document.head.appendChild(animationStyles)

const elements = {
  get wrapper() { return document.getElementById('wrapper') as HTMLElement },
  get playground() { return document.getElementById('playground') as HTMLElement },
  get sidebar() { return document.getElementById('sidebar') as HTMLElement },
  get mainPanel() { return document.getElementById('main-panel') as HTMLElement },
  get contextPanel() { return document.getElementById('context-panel') as HTMLElement },
  get dvalaPanel() { return document.getElementById('dvala-panel') as HTMLElement },
  get outputPanel() { return document.getElementById('output-panel') as HTMLElement },
  get moreMenu() { return document.getElementById('more-menu') as HTMLElement },
  get addContextMenu() { return document.getElementById('add-context-menu') as HTMLElement },
  get newContextName() { return document.getElementById('new-context-name') as HTMLInputElement },
  get newContextValue() { return document.getElementById('new-context-value') as HTMLTextAreaElement },
  get newContextError() { return document.getElementById('new-context-error') as HTMLSpanElement },
  get contextTextArea() { return document.getElementById('context-textarea') as HTMLTextAreaElement },
  get outputResult() { return document.getElementById('output-result') as HTMLElement },
  get dvalaTextArea() { return document.getElementById('dvala-textarea') as HTMLTextAreaElement },
  get resizePlayground() { return document.getElementById('resize-playground') as HTMLElement },
  get resizeDevider1() { return document.getElementById('resize-divider-1') as HTMLElement },
  get resizeDevider2() { return document.getElementById('resize-divider-2') as HTMLElement },
  get resizeSidebar() { return document.getElementById('resize-sidebar') as HTMLElement },
  get dvalaPanelDebugInfo() { return document.getElementById('dvala-panel-debug-info') as HTMLDivElement },
  get contextUndoButton() { return document.getElementById('context-undo-button') as HTMLAnchorElement },
  get contextRedoButton() { return document.getElementById('context-redo-button') as HTMLAnchorElement },
  get dvalaCodeUndoButton() { return document.getElementById('dvala-code-undo-button') as HTMLAnchorElement },
  get dvalaCodeRedoButton() { return document.getElementById('dvala-code-redo-button') as HTMLAnchorElement },
  get contextTitle() { return document.getElementById('context-title') as HTMLDivElement },
  get dvalaCodeTitle() { return document.getElementById('dvala-code-title') as HTMLDivElement },
  get dvalaCodeTitleString() { return document.getElementById('dvala-code-title-string') as HTMLSpanElement },
  get dvalaCodeTitleInput() { return document.getElementById('dvala-code-title-input') as HTMLInputElement },
  get dvalaCodePendingIndicator() { return document.getElementById('dvala-code-pending-indicator') as HTMLSpanElement },
  get dvalaCodeLockedIndicator() { return document.getElementById('dvala-code-locked-indicator') as HTMLSpanElement },
  get snapshotModal() { return document.getElementById('snapshot-modal') as HTMLDivElement },
  get snapshotPanelContainer() { return document.getElementById('snapshot-panel-container') as HTMLDivElement },
  get snapshotPanelTemplate() { return document.getElementById('snapshot-panel-template') as HTMLTemplateElement },
  get importOptionsModal() { return document.getElementById('import-options-modal') as HTMLDivElement },
  get importOptCode() { return document.getElementById('import-opt-code') as HTMLInputElement },
  get importOptCodeLabel() { return document.getElementById('import-opt-code-label') as HTMLLabelElement },
  get importOptContext() { return document.getElementById('import-opt-context') as HTMLInputElement },
  get importOptContextLabel() { return document.getElementById('import-opt-context-label') as HTMLLabelElement },
  get importOptSettings() { return document.getElementById('import-opt-settings') as HTMLInputElement },
  get importOptSettingsLabel() { return document.getElementById('import-opt-settings-label') as HTMLLabelElement },
  get importOptSavedSnapshots() { return document.getElementById('import-opt-saved-snapshots') as HTMLInputElement },
  get importOptSavedSnapshotsLabel() { return document.getElementById('import-opt-saved-snapshots-label') as HTMLLabelElement },
  get importOptRecentSnapshots() { return document.getElementById('import-opt-recent-snapshots') as HTMLInputElement },
  get importOptRecentSnapshotsLabel() { return document.getElementById('import-opt-recent-snapshots-label') as HTMLLabelElement },
  get importOptLayout() { return document.getElementById('import-opt-layout') as HTMLInputElement },
  get importOptLayoutLabel() { return document.getElementById('import-opt-layout-label') as HTMLLabelElement },
  get importOptSavedPrograms() { return document.getElementById('import-opt-saved-programs') as HTMLInputElement },
  get importOptSavedProgramsLabel() { return document.getElementById('import-opt-saved-programs-label') as HTMLLabelElement },
  get importResultModal() { return document.getElementById('import-result-modal') as HTMLDivElement },
  get importResultContent() { return document.getElementById('import-result-content') as HTMLDivElement },
  get exportModal() { return document.getElementById('export-modal') as HTMLDivElement },
  get exportOptCode() { return document.getElementById('export-opt-code') as HTMLInputElement },
  get exportOptContext() { return document.getElementById('export-opt-context') as HTMLInputElement },
  get exportOptSettings() { return document.getElementById('export-opt-settings') as HTMLInputElement },
  get exportOptSavedSnapshots() { return document.getElementById('export-opt-saved-snapshots') as HTMLInputElement },
  get exportOptRecentSnapshots() { return document.getElementById('export-opt-recent-snapshots') as HTMLInputElement },
  get exportOptLayout() { return document.getElementById('export-opt-layout') as HTMLInputElement },
  get exportOptSavedPrograms() { return document.getElementById('export-opt-saved-programs') as HTMLInputElement },
  get toastContainer() { return document.getElementById('toast-container') as HTMLDivElement },
  get executionControlBar() { return document.getElementById('execution-control-bar') as HTMLDivElement },
  get executionStatus() { return document.getElementById('execution-status') as HTMLSpanElement },
  get execPlayBtn() { return document.getElementById('exec-play-btn') as HTMLButtonElement },
  get execPauseBtn() { return document.getElementById('exec-pause-btn') as HTMLButtonElement },
  get execStopBtn() { return document.getElementById('exec-stop-btn') as HTMLButtonElement },
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
interface PendingEffect {
  ctx: EffectContext
  title: string
  renderBody: (el: HTMLElement) => void
  renderFooter: (el: HTMLElement) => void
  onKeyDown?: (evt: KeyboardEvent) => boolean
  resolve: () => void
}
let pendingEffects: PendingEffect[] = []
let currentEffectIndex = 0
let effectBatchScheduled = false
// Refs valid while the unified effect panel is open
let effectPanelBodyEl: HTMLElement | null = null
let effectPanelFooterEl: HTMLElement | null = null
let effectNavEl: HTMLElement | null = null
let effectNavCounterEl: HTMLSpanElement | null = null
let currentSnapshot: Snapshot | null = null
const modalStack: { panel: HTMLElement; label: string; snapshot: Snapshot | null; isEffect?: boolean }[] = []
let overlayCloseAnimation: Animation | null = null

// Toast hint for effect modals that can't be dismissed with Escape
const EFFECT_MODAL_ESCAPE_HINT = 'Escape not supported here'

function calculateDimensions() {
  return {
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
  }
}

export function openMoreMenu(triggerEl?: HTMLElement) {
  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect()
    elements.moreMenu.style.position = 'fixed'
    elements.moreMenu.style.top = `${rect.bottom}px`
    elements.moreMenu.style.right = `${window.innerWidth - rect.right}px`
    elements.moreMenu.style.left = 'auto'
  }
  elements.moreMenu.style.display = 'block'
}

export function closeMoreMenu() {
  elements.moreMenu.style.display = 'none'
}

const expandedApiSections = new Set<string>()

const chevronRight = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M10 6L8.59 7.41L13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'
const chevronDown = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6z"/></svg>'

function expandCollapsible(el: HTMLElement, animate = true) {
  if (!animate) {
    el.style.transition = 'none'
    el.classList.add('expanded')
    el.style.maxHeight = 'none'
    void el.offsetHeight
    el.style.transition = ''
    return
  }
  el.classList.add('expanded')
  el.style.maxHeight = `${el.scrollHeight}px`
  el.addEventListener('transitionend', () => {
    if (el.classList.contains('expanded'))
      el.style.maxHeight = 'none'
  }, { once: true })
}

function collapseCollapsible(el: HTMLElement, animate = true) {
  if (!animate) {
    el.style.transition = 'none'
    el.classList.remove('expanded')
    el.style.maxHeight = '0'
    void el.offsetHeight
    el.style.transition = ''
    return
  }
  // Pin current rendered height so the transition starts from actual height
  el.style.maxHeight = `${el.getBoundingClientRect().height}px`
  void el.offsetHeight
  el.classList.remove('expanded')
  el.style.maxHeight = '0'
}

export function showTutorialsPage() {
  router.navigate('/tutorials')
}

export function showSettingsTab(id: string) {
  document.querySelectorAll('.settings-tab-btn').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'))
  document.getElementById(`settings-tab-btn-${id}`)?.classList.add('active')
  document.getElementById(`settings-tab-${id}`)?.classList.add('active')
  const targetPath = `/settings/${id}`
  if (router.currentPath() !== targetPath)
    router.navigate(targetPath, true)
  if (id === 'actions')
    updateStorageUsage()
  if (id === 'developer')
    renderColorPalette()
}

function renderColorPalette(): void {
  const container = document.getElementById('settings-color-palette')
  if (!container) return

  const root = getComputedStyle(document.documentElement)
  const groups: { title: string; prefix: string; type: 'swatch' | 'text' }[] = [
    { title: 'Surfaces & Backgrounds', prefix: '--color-surface,--color-bg,--color-code-bg', type: 'swatch' },
    { title: 'Text', prefix: '--color-text', type: 'text' },
    { title: 'Accent & Semantic', prefix: '--color-primary,--color-accent,--color-error,--color-success,--color-purple,--color-terminal,--color-toggle-on', type: 'swatch' },
    { title: 'Borders', prefix: '--color-border', type: 'swatch' },
    { title: 'Scrollbar', prefix: '--color-scrollbar', type: 'swatch' },
    { title: 'Overlays & Shadows', prefix: '--color-overlay,--color-shadow,--color-selection', type: 'swatch' },
    { title: 'Syntax Highlighting', prefix: '--syntax-', type: 'swatch' },
  ]

  // Collect all CSS custom properties from the stylesheet
  const allVars: { name: string; value: string }[] = []
  for (let s = 0; s < document.styleSheets.length; s++) {
    try {
      const rules = document.styleSheets[s]!.cssRules
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r]!
        if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
          for (let i = 0; i < rule.style.length; i++) {
            const name = rule.style[i]!
            if (name.startsWith('--color-') || name.startsWith('--syntax-')) {
              allVars.push({ name, value: root.getPropertyValue(name).trim() })
            }
          }
        }
      }
    } catch { /* cross-origin sheets */ }
  }

  let html = ''
  for (const group of groups) {
    const prefixes = group.prefix.split(',')
    const vars = allVars.filter(v => prefixes.some(p => v.name.startsWith(p)))
    if (vars.length === 0) continue

    html += `<div class="color-palette__group-title">${escapeHtml(group.title)}</div>`
    html += '<div class="color-palette__group">'
    for (const v of vars) {
      const shortName = v.name.replace(/^--(color-|syntax-)/, '')
      if (group.type === 'text') {
        html += `<div class="color-palette__text-preview">
          <span class="color-palette__text-sample" style="color:var(${v.name})">${escapeHtml(shortName)}</span>
          <span class="color-palette__hex">${escapeHtml(v.value)}</span>
        </div>`
      } else {
        const hasAlpha = v.value.length === 9 || v.value.includes('rgba')
        html += `<div class="color-palette__swatch">
          <div class="color-palette__color${hasAlpha ? ' color-palette__color--alpha' : ''}">${hasAlpha ? `<span style="background:var(${v.name})"></span>` : `<span style="background:var(${v.name})"></span>`}</div>
          <div class="color-palette__name">${escapeHtml(shortName)}</div>
          <div class="color-palette__hex">${escapeHtml(v.value)}</div>
        </div>`
      }
    }
    html += '</div>'
  }
  container.innerHTML = html
}

export function showSnapshotsPage() {
  populateSnapshotsList()
  showPage('snapshots-page', 'smooth')
}

export function showSavedProgramsPage() {
  populateSavedProgramsList()
  showPage('saved-programs-page', 'smooth')
}

function notifyProgramAdded() {
  const programsPage = document.getElementById('saved-programs-page')
  if (programsPage?.classList.contains('active-content')) return
  const indicator = document.getElementById('programs-nav-indicator')
  if (indicator) indicator.style.display = 'inline-block'
  const navLink = document.getElementById('saved-programs-page_link')
  if (navLink) navLink.style.color = 'var(--color-text-bright)'
}

function notifySnapshotAdded() {
  const snapshotsPage = document.getElementById('snapshots-page')
  if (snapshotsPage?.classList.contains('active-content')) return
  const indicator = document.getElementById('snapshots-nav-indicator')
  if (indicator) indicator.style.display = 'inline-block'
  const navLink = document.getElementById('snapshots-page_link')
  if (navLink) navLink.style.color = 'var(--color-text-bright)'
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const ICONS = {
  play: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 4v16l14-8z"/></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="M216 48h-36V36a28 28 0 0 0-28-28h-48a28 28 0 0 0-28 28v12H40a12 12 0 0 0 0 24h4v136a20 20 0 0 0 20 20h128a20 20 0 0 0 20-20V72h4a12 12 0 0 0 0-24M100 36a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v12h-56Zm88 168H68V72h120Zm-72-100v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0m48 0v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0"/></svg>',
  menu: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2s.9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2s2-.9 2-2s-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2s2-.9 2-2s-.9-2-2-2"/></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm3-2V7a4 4 0 1 1 8 0v4m-4 4v2"/></svg>',
  unlock: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm3-2V7a4 4 0 0 1 7.917-.768M12 17v2"/></svg>',
  eye: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 12s4-8 11-8s11 8 11 8s-4 8-11 8s-11-8-11-8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5l5-5m-5 5V3"/></svg>',
  save: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2M17 21v-8H7v8M7 3v5h8"/></svg>',
  duplicate: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.242a2 2 0 0 0-.602-1.43L16.083 2.57A2 2 0 0 0 14.685 2H10a2 2 0 0 0-2 2M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/></svg>',
}

interface ContextMenuItem {
  label: string
  icon: string
  action: string
}

function renderContextMenu(items: ContextMenuItem[], menuId: string): string {
  const menuItems = items.map(item => `
    <button onclick="event.stopPropagation(); Playground.closeContextMenu(); ${item.action}" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; background: none; border: none; color: var(--color-text); font-size: 0.875rem; cursor: pointer; text-align: left;" onmouseover="this.style.background='var(--color-border-dim)'" onmouseout="this.style.background='none'">
      <span style="display: flex; align-items: center;">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
    </button>
  `).join('')

  return `
    <div style="position: relative;">
      <button class="snapshot-btn" onclick="event.stopPropagation(); Playground.toggleContextMenu('${menuId}', this)" style="background: none; border: none; padding: 2px; font-size: 1.1em; cursor: pointer; display: flex; align-items: center; border-radius: 4px; color: var(--color-text-secondary);" title="More actions">${ICONS.menu}</button>
      <div id="${menuId}" class="snapshot-context-menu" style="display: none; position: fixed; min-width: 150px; background: var(--color-surface-dim); border: 1px solid var(--color-border-dim); border-radius: 6px; box-shadow: 0 4px 12px var(--color-shadow-deep); z-index: 1000; overflow: hidden;">
        ${menuItems}
      </div>
    </div>
  `
}

export function toggleContextMenu(menuId: string, triggerEl?: HTMLElement): void {
  const menu = document.getElementById(menuId)
  if (!menu) return

  // Close all other context menus first
  document.querySelectorAll('.snapshot-context-menu').forEach(m => {
    if (m.id !== menuId) (m as HTMLElement).style.display = 'none'
  })

  if (menu.style.display === 'block') {
    menu.style.display = 'none'
    return
  }

  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect()
    menu.style.top = `${rect.bottom}px`
    menu.style.right = `${window.innerWidth - rect.right}px`
    menu.style.left = 'auto'
  }
  menu.style.display = 'block'
}

export function closeContextMenu(): void {
  document.querySelectorAll('.snapshot-context-menu').forEach(m => {
    (m as HTMLElement).style.display = 'none'
  })
}

function isAnyContextMenuOpen(): boolean {
  return Array.from(document.querySelectorAll('.snapshot-context-menu')).some(
    m => (m as HTMLElement).style.display !== 'none',
  )
}

// Prevent all href="#" anchors from scrolling to top / navigating.
// Uses capture phase so it fires before onclick handlers and before
// the browser processes the default action.
document.addEventListener('click', e => {
  const anchor = e.composedPath().find(el => el instanceof HTMLAnchorElement)
  if (anchor?.getAttribute('href') === '#')
    e.preventDefault()
}, true)

// Close context menu when clicking outside
document.addEventListener('click', e => {
  const target = e.target as HTMLElement
  if (!target.closest('.snapshot-context-menu') && !target.closest('[onclick*="toggleContextMenu"]')) {
    if (isAnyContextMenuOpen()) {
      closeContextMenu()
      e.stopPropagation()
      e.preventDefault()
    }
  }
}, true)

function buildTerminalDetailLine(snapshot: Snapshot): string {
  const meta = snapshot.meta as { result?: unknown; error?: { message?: string } } | undefined
  if (meta?.error?.message) {
    return `<div style="font-size: 0.8rem; color: var(--color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><span style="color: var(--color-text-dim);">error:</span> ${escapeHtml(String(meta.error.message))}</div>`
  }
  if (meta?.result !== undefined) {
    return `<div style="font-size: 0.8rem; color: var(--color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><span style="color: var(--color-text-dim);">result:</span> ${escapeHtml(String(meta.result))}</div>`
  }
  return ''
}

function getSnapshotDisplayMessage(snapshot: Snapshot): string {
  return snapshot.message || (snapshot.effectName ? `Effect: ${snapshot.effectName}` : 'Checkpoint')
}

function renderSnapshotCard(entry: TerminalSnapshotEntry | SavedSnapshot, index: number, animateIn = false): string {
  const { snapshot, savedAt } = entry
  const animateClass = animateIn ? 'animate-in' : ''
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  const sizeStr = snapshotBytes >= 1024 * 1024 ? `${(snapshotBytes / (1024 * 1024)).toFixed(1)} MB` : `${(snapshotBytes / 1024).toFixed(1)} KB`
  const timestamp = `<div style="font-size: 0.75rem; color: var(--color-text-dim); display: flex; gap: 0.75rem;">${formatTime(new Date(savedAt))}<span>${sizeStr}</span></div>`

  let type: 'terminal' | 'saved'
  let title: string
  let titlePrefix: string
  let message: string
  let detailLine: string
  let borderColor: string
  let menuItems: ContextMenuItem[]
  let actionButtons: string
  let onclick: string

  if (entry.kind === 'terminal') {
    const ordinals = ['Last', '2nd Last', '3rd Last']
    type = 'terminal'
    title = `${ordinals[index] ?? `${index + 1}th Last`} Run`
    titlePrefix = ''
    message = snapshot.message
    detailLine = `${buildTerminalDetailLine(snapshot)}${timestamp}`
    borderColor = entry.resultType === 'error' ? 'var(--color-error)' : entry.resultType === 'halted' ? 'var(--color-primary)' : 'var(--color-success)'
    menuItems = [
      { label: 'Open', icon: ICONS.eye, action: `Playground.openTerminalSnapshot(${index})` },
      { label: 'Save', icon: ICONS.save, action: `Playground.saveTerminalSnapshotToSaved(${index})` },
      { label: 'Download', icon: ICONS.download, action: `Playground.downloadTerminalSnapshotByIndex(${index})` },
      { label: 'Delete', icon: ICONS.trash, action: `Playground.clearTerminalSnapshot(${index})` },
    ]
    actionButtons = ''
    onclick = `Playground.openTerminalSnapshot(${index})`
  } else {
    const isCompleted = snapshot.terminal === true
    const meta = snapshot.meta as { error?: unknown; halted?: boolean } | undefined
    type = 'saved'
    title = entry.name || `Snapshot #${index + 1}`
    titlePrefix = entry.locked ? `<span style="color: var(--color-primary); display: flex; align-items: center;" title="Locked">${ICONS.lock}</span>` : ''
    message = getSnapshotDisplayMessage(snapshot)
    detailLine = `${isCompleted ? buildTerminalDetailLine(snapshot) : ''}${timestamp}`
    borderColor = isCompleted ? (meta?.error ? 'var(--color-error)' : meta?.halted ? 'var(--color-primary)' : 'var(--color-success)') : 'var(--color-border)'
    menuItems = [
      { label: 'Open', icon: ICONS.eye, action: `Playground.openSavedSnapshot(${index})` },
      { label: entry.locked ? 'Unlock' : 'Lock', icon: entry.locked ? ICONS.lock : ICONS.unlock, action: `Playground.toggleSnapshotLock(${index})` },
      { label: 'Download', icon: ICONS.download, action: `Playground.downloadSavedSnapshotByIndex(${index})` },
      { label: 'Delete', icon: ICONS.trash, action: `Playground.deleteSavedSnapshot(${index})` },
    ]
    actionButtons = isCompleted ? '' : `<button class="snapshot-btn" onclick="event.stopPropagation(); Playground.runSavedSnapshot(${index})" style="background: none; border: none; padding: 2px; font-size: 1.1em; cursor: pointer; display: flex; align-items: center; border-radius: 4px; color: var(--color-text-secondary);" title="Run snapshot">${ICONS.play}</button>`
    onclick = `Playground.openSavedSnapshot(${index})`
  }

  return `
    <div class="snapshot-card ${animateClass}" data-type="${type}" data-index="${index}" onclick="${onclick}" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem; background: var(--color-surface); border-radius: 8px; border-left: 3px solid ${borderColor}; cursor: pointer;" onmouseover="this.style.background='var(--color-surface-hover)'" onmouseout="this.style.background='var(--color-surface)'">
      <div style="display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0;">
        <div style="font-size: 1rem; color: var(--color-text); display: flex; align-items: center; gap: 0.5rem;">${titlePrefix}${escapeHtml(title)}${entry.kind === 'saved' && snapshot.terminal !== true ? '<span style="font-size: 0.65rem; color: var(--color-text-dim); font-family: sans-serif; font-weight: bold; letter-spacing: 0.05em;">SUSPENDED</span>' : ''}</div>
        <div style="font-size: 0.8rem; color: var(--color-text-dim);">${escapeHtml(message)}</div>
        ${detailLine}
      </div>
      <div style="display: flex; gap: 2px; align-items: flex-start;" onclick="event.stopPropagation()">
        ${actionButtons}
        ${renderContextMenu(menuItems, `${type}-menu-${index}`)}
      </div>
    </div>
  `
}

function renderGroupLabel(label: string): string {
  return `<div class="list-group-label" style="font-size: 0.75rem; font-weight: 600; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0;">${escapeHtml(label)}</div>`
}

function animateCardRemoval(type: 'terminal' | 'saved', index: number): Promise<void> {
  const card = document.querySelector(`.snapshot-card[data-type="${type}"][data-index="${index}"]`)
  if (!card) return Promise.resolve()

  return new Promise(resolve => {
    card.classList.add('removing')
    card.addEventListener('animationend', () => resolve(), { once: true })
    // Fallback in case animation doesn't fire
    setTimeout(resolve, 300)
  })
}

function populateSnapshotsList(options: { animateNewTerminal?: boolean; animateNewSaved?: boolean } = {}) {
  const { animateNewTerminal = false, animateNewSaved = false } = options
  const list = document.getElementById('snapshots-list')
  const empty = document.getElementById('snapshots-empty')
  const clearBtn = document.getElementById('snapshots-clear-all')
  if (!list || !empty) return

  const terminalEntries = getTerminalSnapshots()
  const savedEntries = getSavedSnapshots()
  const hasContent = terminalEntries.length > 0 || savedEntries.length > 0

  if (!hasContent) {
    list.innerHTML = ''
    empty.style.display = 'block'
    if (clearBtn) clearBtn.style.visibility = 'hidden'
    return
  }

  empty.style.display = 'none'
  if (clearBtn) clearBtn.style.visibility = terminalEntries.length > 0 || savedEntries.some(e => !e.locked) ? 'visible' : 'hidden'

  const cards: string[] = []

  // Terminal snapshots with group label
  if (terminalEntries.length > 0) {
    cards.push(renderGroupLabel('Completed Programs'))
    // Always render first N cards normally
    for (let i = 0; i < Math.min(VISIBLE_TERMINAL_SNAPSHOTS, terminalEntries.length); i++) {
      cards.push(renderSnapshotCard(terminalEntries[i]!, i, animateNewTerminal && i === 0))
    }
    const hiddenCount = terminalEntries.length - VISIBLE_TERMINAL_SNAPSHOTS
    if (hiddenCount > 0) {
      // Wrap extra cards in collapsible container
      const displayStyle = showAllTerminalSnapshots ? 'display: contents;' : 'display: none;'
      cards.push(`<div id="terminal-snapshots-overflow" style="${displayStyle}">`)
      for (let i = VISIBLE_TERMINAL_SNAPSHOTS; i < terminalEntries.length; i++) {
        cards.push(renderSnapshotCard(terminalEntries[i]!, i, false))
      }
      cards.push('</div>')
      const toggleStyle = 'background: none; border: none; color: var(--color-text-dim); font-size: 0.75rem; cursor: pointer; padding: 0.5rem 0; text-align: center; width: 100%;'
      if (showAllTerminalSnapshots) {
        cards.push(`<button style="${toggleStyle}" onclick="Playground.toggleShowAllTerminalSnapshots()">Show less</button>`)
      } else {
        cards.push(`<button style="${toggleStyle}" onclick="Playground.toggleShowAllTerminalSnapshots()">Show all (${terminalEntries.length})</button>`)
      }
    }
  }

  // Saved snapshots with group label
  if (savedEntries.length > 0) {
    cards.push(renderGroupLabel('Saved Snapshots'))
    savedEntries.forEach((entry, index) => {
      // Only animate the first (newest) saved entry if animateNewSaved is true
      cards.push(renderSnapshotCard(entry, index, animateNewSaved && index === 0))
    })
  }

  list.innerHTML = cards.join('')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Saved Programs ───────────────────────────────────────────────────────────

function animateProgramCardRemoval(id: string): Promise<void> {
  const card = document.querySelector(`.snapshot-card[data-program-id="${id}"]`)
  if (!card) return Promise.resolve()
  return new Promise(resolve => {
    card.classList.add('removing')
    card.addEventListener('animationend', () => resolve(), { once: true })
    setTimeout(resolve, 300)
  })
}

function populateSavedProgramsList(options: { animateNewId?: string } = {}) {
  const { animateNewId } = options
  const list = document.getElementById('saved-programs-list')
  const empty = document.getElementById('saved-programs-empty')
  const clearBtn = document.getElementById('saved-programs-clear-all')
  if (!list || !empty) return

  const programs = getSavedPrograms()
  if (clearBtn)
    clearBtn.style.visibility = programs.some(p => !p.locked) ? 'visible' : 'hidden'

  if (programs.length === 0) {
    list.innerHTML = ''
    empty.style.display = 'block'
    return
  }

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const todayMs = startOfToday.getTime()
  const weekMs = todayMs - 6 * 24 * 60 * 60 * 1000
  const monthMs = todayMs - 29 * 24 * 60 * 60 * 1000

  const groups: { label: string; programs: SavedProgram[] }[] = [
    { label: 'Today', programs: [] },
    { label: 'Last Week', programs: [] },
    { label: 'Last Month', programs: [] },
    { label: 'Older', programs: [] },
  ]

  for (const p of programs) {
    if (p.updatedAt >= todayMs) groups[0]!.programs.push(p)
    else if (p.updatedAt >= weekMs) groups[1]!.programs.push(p)
    else if (p.updatedAt >= monthMs) groups[2]!.programs.push(p)
    else groups[3]!.programs.push(p)
  }

  empty.style.display = 'none'
  list.innerHTML = groups
    .filter(g => g.programs.length > 0)
    .flatMap(g => [renderGroupLabel(g.label), ...g.programs.map(p => renderProgramCard(p, p.id === animateNewId))])
    .join('')
}

function renderProgramCard(program: SavedProgram, animateIn = false): string {
  const tokenStream = tokenizeSource(program.code)
  const meaningfulTokens = tokenStream.tokens
  let firstMeaningful = 0
  while (firstMeaningful < meaningfulTokens.length) {
    const type = meaningfulTokens[firstMeaningful]![0]
    if (type !== 'Whitespace' && type !== 'SingleLineComment' && type !== 'MultiLineComment') break
    firstMeaningful++
  }
  const trimmedCode = untokenize({ ...tokenStream, tokens: meaningfulTokens.slice(firstMeaningful) })
  const displaySnippet = trimmedCode.split('\n').slice(0, 3).join('\n')
  const isActive = getState('current-program-id') === program.id
  const borderColor = 'var(--color-scrollbar-track)'
  const animateClass = animateIn ? 'animate-in' : ''
  const lockIcon = program.locked
    ? `<span style="color:var(--color-primary); display:flex; align-items:center;" title="Locked">${ICONS.lock}</span>`
    : ''
  const menuId = `program-menu-${program.id}`
  const menuItems: ContextMenuItem[] = [
    { label: program.locked ? 'Unlock' : 'Lock', icon: program.locked ? ICONS.unlock : ICONS.lock, action: `Playground.toggleProgramLock('${program.id}')` },
    { label: 'Create copy', icon: ICONS.duplicate, action: `Playground.duplicateProgram('${program.id}')` },
    { label: 'Download', icon: ICONS.download, action: `Playground.downloadProgram('${program.id}')` },
    { label: 'Delete', icon: ICONS.trash, action: `Playground.deleteSavedProgram('${program.id}')` },
  ]
  return `
    <div class="snapshot-card ${animateClass}" data-program-id="${program.id}" onclick="Playground.loadSavedProgram('${program.id}')" style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; padding:1rem; background:var(--color-surface); border-radius:8px; border-left:3px solid ${borderColor}; cursor:pointer;" onmouseover="this.style.background='var(--color-surface-hover)'" onmouseout="this.style.background='var(--color-surface)'">
      <div style="display:flex; flex-direction:column; gap:0.25rem; flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${lockIcon}
          <span style="font-size:1rem; color:var(--color-text);">${escapeHtml(program.name)}</span>
          ${isActive ? '<span style="font-size:0.65rem; font-weight:600; letter-spacing:0.05em; color:var(--color-primary); border:1px solid var(--color-primary); border-radius:3px; padding:1px 5px;">ACTIVE</span>' : ''}
        </div>
        ${program.code.trim() ? `<div style="font-size:0.8rem; color:var(--color-text-dim); font-family:monospace; white-space:pre; overflow:hidden; line-height:1.4; max-height:calc(1.4em * 3);">${escapeHtml(displaySnippet)}</div>` : '<span style="font-size:0.65rem; font-weight:600; letter-spacing:0.05em; color:var(--color-text-dim); padding:1px 0;">EMPTY PROGRAM</span>'}
        <div style="font-size:0.75rem; color:var(--color-text-dim);">${formatTime(new Date(program.updatedAt))}</div>
      </div>
      <div onclick="event.stopPropagation()">
        ${renderContextMenu(menuItems, menuId)}
      </div>
    </div>
  `
}

export function loadSavedProgram(id: string) {
  const program = getSavedPrograms().find(p => p.id === id)
  if (!program) return
  if (getState('current-program-id') === id) return
  guardCodeReplacement(() => {
    saveState({ 'dvala-code': program.code, 'context': program.context, 'current-program-id': program.id, 'dvala-code-edited': false })
    elements.dvalaTextArea.value = program.code
    elements.contextTextArea.value = program.context
    syntaxOverlay.update()
    syntaxOverlay.scrollContainer.scrollTo(0, 0)
    updateCSS()
    populateSavedProgramsList()
  })
}

export function deleteSavedProgram(id: string) {
  const program = getSavedPrograms().find(p => p.id === id)
  if (!program) return
  const doDelete = async () => {
    await animateProgramCardRemoval(id)
    const updated = getSavedPrograms().filter(p => p.id !== id)
    setSavedPrograms(updated)
    if (getState('current-program-id') === id) {
      saveState({ 'current-program-id': null })
      updateCSS()
    }
    populateSavedProgramsList()
  }
  if (program.locked) {
    void showInfoModal('Delete program', 'This program is locked. Are you sure you want to permanently delete it?', doDelete)
  } else {
    void doDelete()
  }
}

export function downloadProgram(id: string) {
  const program = getSavedPrograms().find(p => p.id === id)
  if (!program) return
  const filename = `${program.name.replace(/[^a-z0-9_-]/gi, '_')}.json`
  const { id: _id, ...exportData } = program
  void saveFile(JSON.stringify(exportData, null, 2), filename)
}

export function toggleProgramLock(id: string) {
  const programs = getSavedPrograms()
  const updated = programs.map(p => p.id === id ? { ...p, locked: !p.locked } : p)
  setSavedPrograms(updated)
  populateSavedProgramsList()
  if (id === getState('current-program-id')) updateCSS()
}

export function clearAllSavedPrograms() {
  clearAllPrograms()
  saveState({ 'current-program-id': null })
  populateSavedProgramsList()
  updateCSS()
}

export function clearUnlockedPrograms() {
  void showInfoModal('Remove unlocked programs', 'This will delete all unlocked programs. Locked programs will be kept.', async () => {
    const unlocked = getSavedPrograms().filter(p => !p.locked)
    await Promise.all(unlocked.map(p => animateProgramCardRemoval(p.id)))
    const kept = getSavedPrograms().filter(p => p.locked)
    setSavedPrograms(kept)
    if (!kept.find(p => p.id === getState('current-program-id'))) {
      saveState({ 'current-program-id': null })
      updateCSS()
    }
    populateSavedProgramsList()
    showToast('Unlocked programs cleared')
  })
}

export function openImportProgramModal() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(reader.result as string)
      } catch {
        void showInfoModal('Import failed', 'Invalid JSON — could not parse the file.')
        return
      }
      if (typeof parsed !== 'object' || parsed === null || !('name' in parsed) || !('code' in parsed)) {
        void showInfoModal('Import failed', 'Not a valid program object (requires at least "name" and "code").')
        return
      }
      const raw = parsed as Record<string, unknown>
      const now = Date.now()
      const existing = getSavedPrograms()
      const existingNames = new Set(existing.map(p => p.name))
      const rawName = typeof raw['name'] === 'string' ? raw['name'] : 'Imported Program'
      const uniqueName = (base: string) => {
        if (!existingNames.has(base)) return base
        let i = 1
        while (existingNames.has(`${base} (${i})`)) i++
        return `${base} (${i})`
      }
      const imported: SavedProgram = {
        id: crypto.randomUUID(),
        name: uniqueName(rawName),
        code: typeof raw['code'] === 'string' ? raw['code'] : '',
        context: typeof raw['context'] === 'string' ? raw['context'] : '',
        createdAt: typeof raw['createdAt'] === 'number' ? raw['createdAt'] : now,
        updatedAt: typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : now,
        locked: typeof raw['locked'] === 'boolean' ? raw['locked'] : false,
      }
      setSavedPrograms([imported, ...existing])
      notifyProgramAdded()
      populateSavedProgramsList({ animateNewId: imported.id })
      showToast(`Imported "${imported.name}"`)
    }
    reader.readAsText(file)
  }
  input.click()
}

export function duplicateProgram(id: string) {
  const program = getSavedPrograms().find(p => p.id === id)
  if (!program) return
  const now = Date.now()
  const copy: SavedProgram = {
    id: crypto.randomUUID(),
    name: `Copy of ${program.name}`,
    code: program.code,
    context: program.context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setSavedPrograms([copy, ...getSavedPrograms()])
  saveState({ 'dvala-code': copy.code, 'context': copy.context, 'current-program-id': copy.id })
  elements.dvalaTextArea.value = copy.code
  elements.contextTextArea.value = copy.context
  syntaxOverlay.update()
  notifyProgramAdded()
  updateCSS()
  populateSavedProgramsList({ animateNewId: copy.id })
  showToast(`Created "${copy.name}"`)
}

export function saveAs() {
  const currentId = getState('current-program-id')
  const currentProgram = currentId ? getSavedPrograms().find(p => p.id === currentId) : null
  const defaultName = currentProgram ? `Copy of ${currentProgram.name}` : ''
  showNameInputModal('Save as', defaultName, name => {
    const programs = getSavedPrograms()
    const duplicate = programs.find(p => p.name === name)
    const doSave = () => {
      const filtered = duplicate ? programs.filter(p => p.id !== duplicate.id) : programs
      const now = Date.now()
      const newProgram: SavedProgram = {
        id: crypto.randomUUID(),
        name,
        code: getState('dvala-code'),
        context: getState('context'),
        createdAt: now,
        updatedAt: now,
        locked: false,
      }
      setSavedPrograms([newProgram, ...filtered])
      saveState({ 'current-program-id': newProgram.id })
      notifyProgramAdded()
      updateCSS()
      populateSavedProgramsList({ animateNewId: newProgram.id })
      showToast(`Saved as "${name}"`)
    }
    if (duplicate) {
      void showInfoModal('Replace existing program?', `"${name}" already exists. Replace it?`, doSave)
    } else {
      doSave()
    }
  })
}

function showNameInputModal(title: string, defaultValue: string, onConfirm: (name: string) => void) {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed; inset:0; background:var(--color-overlay); z-index:200; display:flex; align-items:center; justify-content:center;'

  const dialog = document.createElement('div')
  dialog.style.cssText = 'background:var(--color-surface); border-radius:8px; padding:1.5rem; display:flex; flex-direction:column; gap:1rem; min-width:20rem; max-width:90vw;'

  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = 'font-size:1rem; color:var(--color-text); font-weight:600;'

  const input = document.createElement('input')
  input.type = 'text'
  input.value = defaultValue
  input.spellcheck = false
  input.style.cssText = 'background:var(--color-surface-dim); border:1px solid var(--color-scrollbar-track); border-radius:4px; padding:0.4rem 0.6rem; color:var(--color-text); font-size:0.9rem; outline:none; width:100%; box-sizing:border-box;'

  const buttons = document.createElement('div')
  buttons.style.cssText = 'display:flex; justify-content:flex-end; gap:0.5rem;'

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'Cancel'
  cancelBtn.className = 'toolbar-btn'
  cancelBtn.onclick = () => overlay.remove()

  const okBtn = document.createElement('button')
  okBtn.textContent = 'Save'
  okBtn.className = 'toolbar-btn'
  okBtn.onclick = () => {
    const name = input.value.trim()
    if (!name) return
    overlay.remove()
    onConfirm(name)
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') okBtn.click()
    else if (e.key === 'Escape') overlay.remove()
  })

  buttons.append(cancelBtn, okBtn)
  dialog.append(titleEl, input, buttons)
  overlay.append(dialog)
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
  setTimeout(() => { input.focus(); input.select() }, 0)
}

// ─── Program title editing ────────────────────────────────────────────────────

export function onProgramTitleClick(event: MouseEvent) {
  event.stopPropagation()
  const currentId = getState('current-program-id')
  if (currentId && getSavedPrograms().find(p => p.id === currentId)?.locked) return
  const input = elements.dvalaCodeTitleInput
  const span = elements.dvalaCodeTitleString
  input.value = currentId ? elements.dvalaCodeTitleString.textContent ?? '' : ''
  span.style.display = 'none'
  input.style.display = ''
  input.focus()
  input.select()
}

export function onProgramTitleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    elements.dvalaCodeTitleInput.blur()
  } else if (event.key === 'Escape') {
    elements.dvalaCodeTitleInput.style.display = 'none'
    elements.dvalaCodeTitleString.style.display = ''
  }
}

export function onProgramTitleBlur() {
  const input = elements.dvalaCodeTitleInput
  const name = input.value.trim()
  input.style.display = 'none'
  elements.dvalaCodeTitleString.style.display = ''
  if (!name) return
  commitProgramName(name)
}

function commitProgramName(name: string) {
  const programs = getSavedPrograms()
  const currentId = getState('current-program-id')
  const duplicate = programs.find(p => p.name === name && p.id !== currentId)

  if (duplicate) {
    void showInfoModal('Replace existing program?', `"${name}" already exists. Replace it with the current code and context?`, () => {
      const without = programs.filter(p => p.id !== duplicate.id)
      saveOrRenameProgram(name, without, currentId)
    })
  } else {
    saveOrRenameProgram(name, programs, currentId)
  }
}

function saveOrRenameProgram(name: string, programs: SavedProgram[], currentId: string | null) {
  const now = Date.now()
  if (currentId) {
    const updated = programs.map(p =>
      p.id === currentId
        ? { ...p, name, code: getState('dvala-code'), context: getState('context'), updatedAt: now }
        : p,
    )
    setSavedPrograms(updated)
  } else {
    const newProgram: SavedProgram = {
      id: crypto.randomUUID(),
      name,
      code: getState('dvala-code'),
      context: getState('context'),
      createdAt: now,
      updatedAt: now,
      locked: false,
    }
    setSavedPrograms([newProgram, ...programs])
    saveState({ 'current-program-id': newProgram.id })
    notifyProgramAdded()
    updateCSS()
    populateSavedProgramsList({ animateNewId: newProgram.id })
    return
  }
  updateCSS()
  populateSavedProgramsList()
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function flushPendingAutoSave() {
  if (!autoSaveTimer) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
  const id = getState('current-program-id')
  if (id) {
    const updated = getSavedPrograms().map(p =>
      p.id === id
        ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() }
        : p,
    )
    setSavedPrograms(updated)
  }
}

/**
 * Guards a code-replacing action.
 * - If a saved program is active, flush any pending auto-save and proceed immediately.
 * - If the editor has unsaved edits (no program ID), show a confirmation modal first.
 */
function guardCodeReplacement(proceed: () => void) {
  if (getState('current-program-id') !== null) {
    flushPendingAutoSave()
    updateCSS()
    proceed()
    return
  }
  if (getState('dvala-code-edited')) {
    void showInfoModal(
      'Unsaved program',
      'The current program is not saved. Proceeding will discard it.',
      proceed,
    )
    return
  }
  proceed()
}

function scheduleAutoSave() {
  const currentId = getState('current-program-id')
  if (!currentId) return
  if (getSavedPrograms().find(p => p.id === currentId)?.locked) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    const id = getState('current-program-id')
    if (!id) return
    const updated = getSavedPrograms().map(p =>
      p.id === id
        ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() }
        : p,
    )
    setSavedPrograms(updated)
    populateSavedProgramsList()
    updateCSS()
  }, 3000)
  updateCSS()
}

export function openSavedSnapshot(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return
  void openSnapshotModal(entry.snapshot)
}

export function openTerminalSnapshot(index: number) {
  const entries = getTerminalSnapshots()
  const entry = entries[index]
  if (!entry) return
  void openSnapshotModal(entry.snapshot)
}

export function runSavedSnapshot(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return
  currentSnapshot = entry.snapshot
  void resumeSnapshot()
}

export function saveTerminalSnapshotToSaved(index: number) {
  const entries = getTerminalSnapshots()
  const entry = entries[index]
  if (!entry) return
  promptSnapshotName(async name => {
    const savedEntries = getSavedSnapshots()
    const deduped = savedEntries.filter(e => e.snapshot.id !== entry.snapshot.id)
    deduped.unshift({ kind: 'saved', snapshot: entry.snapshot, savedAt: Date.now(), locked: false, name: name || undefined })
    setSavedSnapshots(deduped)
    notifySnapshotAdded()
    // Animate removal from terminal snapshots
    await animateCardRemoval('terminal', index)
    entries.splice(index, 1)
    setTerminalSnapshots(entries)
    populateSnapshotsList({ animateNewSaved: true })
    showToast('Snapshot saved')
  })
}

function downloadSnapshotJson(snapshot: Snapshot, filename: string) {
  void saveFile(JSON.stringify(snapshot, null, 2), filename)
}

export function downloadTerminalSnapshotByIndex(index: number) {
  const entries = getTerminalSnapshots()
  const entry = entries[index]
  if (!entry) return
  downloadSnapshotJson(entry.snapshot, `snapshot-terminal-${index}.json`)
}

export function downloadSavedSnapshotByIndex(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return
  downloadSnapshotJson(entry.snapshot, `snapshot-${entry.snapshot.index}.json`)
}

export async function deleteSavedSnapshot(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return

  const doDelete = async () => {
    await animateCardRemoval('saved', index)
    entries.splice(index, 1)
    setSavedSnapshots(entries)
    populateSnapshotsList()
    showToast('Snapshot deleted')
  }

  if (entry.locked) {
    void showInfoModal('Delete locked snapshot', 'This snapshot is locked. Are you sure you want to delete it?', doDelete)
  } else {
    await doDelete()
  }
}

export function toggleSnapshotLock(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return
  entry.locked = !entry.locked
  setSavedSnapshots(entries)
  populateSnapshotsList()
}

export function clearUnlockedSnapshots() {
  void showInfoModal('Remove unlocked snapshots', 'This will delete all unlocked snapshots. Locked snapshots will be kept.', async () => {
    const terminalEntries = getTerminalSnapshots()
    const savedEntries = getSavedSnapshots()
    const unlockedSavedIndices = savedEntries.map((e, i) => e.locked ? -1 : i).filter(i => i >= 0)
    // Animate all unlocked cards simultaneously
    await Promise.all([
      ...terminalEntries.map((_, i) => animateCardRemoval('terminal', i)),
      ...unlockedSavedIndices.map(i => animateCardRemoval('saved', i)),
    ])
    setTerminalSnapshots([])
    setSavedSnapshots(savedEntries.filter(e => e.locked))
    populateSnapshotsList()
    showToast('Unlocked snapshots cleared')
  })
}

export function toggleApiSection(sectionId: string, animate = true) {
  const chevron = document.getElementById(`api-chevron-${sectionId}`)
  const content = document.getElementById(`api-content-${sectionId}`)

  if (!content)
    return

  const isExpanded = expandedApiSections.has(sectionId)

  // Collapse all expanded API sections
  for (const id of Array.from(expandedApiSections)) {
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
    if (chevron)
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
  for (const key of Array.from(expandedModules)) {
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

const expandedStandardEffectGroups = new Set<string>()

export function toggleStandardEffectGroup(groupKey: string, animate = true) {
  const sanitizedKey = groupKey.replace(/\s+/g, '-')
  const chevron = document.getElementById(`se-chevron-${sanitizedKey}`)
  const content = document.getElementById(`se-content-${sanitizedKey}`)

  if (!chevron || !content)
    return

  const isExpanded = expandedStandardEffectGroups.has(groupKey)

  // Collapse all expanded standard effect groups
  for (const key of Array.from(expandedStandardEffectGroups)) {
    const sk = key.replace(/\s+/g, '-')
    const c = document.getElementById(`se-content-${sk}`)
    const ch = document.getElementById(`se-chevron-${sk}`)
    if (c)
      collapseCollapsible(c, animate)
    if (ch)
      ch.innerHTML = chevronRight
    expandedStandardEffectGroups.delete(key)
  }

  if (!isExpanded) {
    expandedStandardEffectGroups.add(groupKey)
    expandCollapsible(content, animate)
    chevron.innerHTML = chevronDown
  }
}

const expandedPlaygroundEffectGroups = new Set<string>()

export function togglePlaygroundEffectGroup(groupKey: string, animate = true) {
  const sanitizedKey = groupKey.replace(/\s+/g, '-')
  const chevron = document.getElementById(`pe-chevron-${sanitizedKey}`)
  const content = document.getElementById(`pe-content-${sanitizedKey}`)

  if (!chevron || !content)
    return

  const isExpanded = expandedPlaygroundEffectGroups.has(groupKey)

  // Collapse all expanded playground effect groups
  for (const key of Array.from(expandedPlaygroundEffectGroups)) {
    const sk = key.replace(/\s+/g, '-')
    const c = document.getElementById(`pe-content-${sk}`)
    const ch = document.getElementById(`pe-chevron-${sk}`)
    if (c)
      collapseCollapsible(c, animate)
    if (ch)
      ch.innerHTML = chevronRight
    expandedPlaygroundEffectGroups.delete(key)
  }

  if (!isExpanded) {
    expandedPlaygroundEffectGroups.add(groupKey)
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
  const base = document.querySelector('base')?.href ?? `${location.origin}/`
  const href = `${base}?state=${encodeState()}`
  if (href.length > MAX_URL_LENGTH) {
    showToast('Content is too large to share as a URL. Try reducing the code or context size.', { severity: 'error' })
    return
  }
  addOutputSeparator()
  appendOutput('Shareable link:', 'comment')
  const a = document.createElement('a')
  a.textContent = href
  a.className = 'share-link'
  a.href = href
  addOutputElement(a)
  void navigator.clipboard.writeText(href).then(() => {
    showToast('Link copied to clipboard')
  })
}

/** Inject playground effects into window.referenceData search entries at runtime. */
function injectPlaygroundEffects(): void {
  const data = window.referenceData
  if (!data) return
  const shortDescRegExp = /(.*?) {2}\n|\n\n|$/
  for (const ref of Object.values(playgroundEffectReference)) {
    const match = shortDescRegExp.exec(ref.description)
    const description = (match?.[1] ?? ref.description)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
    data.searchEntries.push({
      title: ref.title,
      search: `${ref.title} ${ref.category}`,
      description,
      category: ref.category,
      linkName: getLinkName(ref),
    })
  }
}

function populateSidebarVersion(): void {
  const data = window.referenceData
  const el = document.getElementById('sidebar-version')
  if (!data || !el) return
  el.textContent = `v${data.version}`
}

function populateSidebarApiSections(): void {
  const data = window.referenceData
  const container = document.getElementById('api-ref-sections')
  if (!data || !container) return

  let html = '<div class="sidebar-section-label">API Reference</div>\n'

  // Group core API entries by category
  const byCategory: Record<string, { title: string; linkName: string }[]> = {}
  for (const [key, r] of Object.entries(data.api)) {
    const cat = r.category
    if (!byCategory[cat]) byCategory[cat] = []
    const linkName = makeLinkName(cat, key)
    byCategory[cat].push({ title: r.title, linkName })
  }

  const makeLink = (linkName: string, title: string) =>
    `<a id="${linkName}_link" href="${router.href(`/ref/${linkName}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${linkName}')">${escapeHtml(title)}</a>`

  const makeSection = (id: string, label: string, links: string[]) =>
    `<div class="sidebar-collapsible-header" onclick="Playground.toggleApiSection('${id}')">
  <span>${label}</span><span id="api-chevron-${id}">${chevronRight}</span>
</div>
<div id="api-content-${id}" class="sidebar-collapsible-content">
  ${links.join('\n  ')}
</div>\n`

  // Special expressions
  const specialLinks = (byCategory['special-expression'] ?? []).sort((a, b) => a.title.localeCompare(b.title)).map(e => makeLink(e.linkName, e.title))
  if (specialLinks.length > 0)
    html += makeSection('special-expressions', 'Special expressions', specialLinks)

  // Core functions — everything except special-expression, shorthand, datatype
  const coreCats = data.coreCategories.filter(c => c !== 'special-expression' && c !== 'shorthand' && c !== 'datatype')
  const coreFnEntries: { title: string; linkName: string }[] = []
  for (const cat of coreCats) {
    coreFnEntries.push(...(byCategory[cat] ?? []))
  }
  coreFnEntries.sort((a, b) => a.title.localeCompare(b.title))
  const coreFnLinks = coreFnEntries.map(e => makeLink(e.linkName, e.title))
  if (coreFnLinks.length > 0)
    html += makeSection('core-functions', 'Core functions', coreFnLinks)

  // Standard effects — grouped by sub-namespace (io, random, time, etc.)
  if (Object.keys(data.effects).length > 0) {
    const seByGroup: Record<string, { key: string; shortName: string; title: string }[]> = {}
    for (const [key, r] of Object.entries(data.effects)) {
      // title is e.g. "dvala.io.print" → group "io", shortName "print"
      // title is e.g. "dvala.sleep" → group "other", shortName "sleep"
      const parts = r.title.split('.')
      const hasSubGroup = parts.length > 2
      const group = hasSubGroup ? parts[1]! : 'other'
      const shortName = hasSubGroup ? parts.slice(2).join('.') : parts.slice(1).join('.')
      if (!seByGroup[group]) seByGroup[group] = []
      seByGroup[group].push({ key, shortName, title: r.title })
    }

    const seGroupOrder = ['io', 'random', 'time', 'other']
    const seGroupLabels: Record<string, string> = {
      io: 'IO',
      random: 'Random',
      time: 'Time',
      other: 'Other',
    }

    let seHtml = `<div class="sidebar-collapsible-header" onclick="Playground.toggleApiSection('effects')">
  <span>Standard effects</span><span id="api-chevron-effects">${chevronRight}</span>
</div>
<div id="api-content-effects" class="sidebar-collapsible-content">`

    for (const group of seGroupOrder) {
      const entries = seByGroup[group]
      if (!entries || entries.length === 0) continue
      entries.sort((a, b) => a.shortName.localeCompare(b.shortName))
      const label = seGroupLabels[group] ?? group
      const fnLinks = entries.map(e => {
        const linkName = makeLinkName('effect', e.key)
        return makeLink(linkName, `@${e.title}`)
      }).join('\n    ')
      seHtml += `
  <div class="sidebar-collapsible-header" onclick="Playground.toggleStandardEffectGroup('${escapeHtml(group)}')">
    <span>${escapeHtml(label)}</span><span id="se-chevron-${group}">${chevronRight}</span>
  </div>
  <div id="se-content-${group}" class="sidebar-collapsible-content">
    ${fnLinks}
  </div>`
    }

    seHtml += '\n</div>'
    html += seHtml
  }

  // Shorthands
  const shorthandLinks = (byCategory['shorthand'] ?? []).sort((a, b) => a.title.localeCompare(b.title)).map(e => makeLink(e.linkName, e.title))
  if (shorthandLinks.length > 0)
    html += makeSection('shorthands', 'Shorthands', shorthandLinks)

  // Datatypes
  const datatypeLinks = (byCategory['datatype'] ?? []).sort((a, b) => a.title.localeCompare(b.title)).map(e => makeLink(e.linkName, e.title))
  if (datatypeLinks.length > 0)
    html += makeSection('datatypes', 'Datatypes', datatypeLinks)

  // Render modules section with sub-sections per module
  const byModule: Record<string, { key: string; fnName: string }[]> = {}
  for (const key of Object.keys(data.modules)) {
    const dotIdx = key.indexOf('.')
    if (dotIdx === -1) continue
    const moduleName = key.slice(0, dotIdx)
    if (!byModule[moduleName]) byModule[moduleName] = []
    byModule[moduleName].push({ key, fnName: key.slice(dotIdx + 1) })
  }

  let modulesHtml = `<div class="sidebar-collapsible-header" onclick="Playground.toggleApiSection('modules')">
  <span>Modules</span><span id="api-chevron-modules">${chevronRight}</span>
</div>
<div id="api-content-modules" class="sidebar-collapsible-content">`

  for (const moduleName of data.moduleCategories) {
    const fns = byModule[moduleName]
    if (!fns || fns.length === 0) continue
    const sanitized = moduleName.replace(/\s+/g, '-')
    const fnLinks = fns.map(e => {
      const encodedKey = encodeURIComponent(e.key)
      return `<a id="${encodedKey}_link" href="${router.href(`/ref/${encodedKey}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${encodedKey}')">${escapeHtml(e.fnName)}</a>`
    }).join('\n    ')
    modulesHtml += `
  <div class="sidebar-collapsible-header" onclick="Playground.toggleModuleCategory('${escapeHtml(moduleName)}')">
    <span>${escapeHtml(moduleName)}</span><span id="ns-chevron-${sanitized}">${chevronRight}</span>
  </div>
  <div id="ns-content-${sanitized}" class="sidebar-collapsible-content">
    ${fnLinks}
  </div>`
  }

  modulesHtml += '\n</div>'
  html += modulesHtml

  // Playground Reference — separate section for playground-only effects
  if (Object.keys(playgroundEffectReference).length > 0) {
    html += '<div class="sidebar-spacer"></div>\n'
    html += '<div class="sidebar-section-label">Playground Reference</div>\n'

    const byGroup: Record<string, { key: string; shortName: string; title: string }[]> = {}
    for (const [key, r] of Object.entries(playgroundEffectReference)) {
      const parts = r.title.split('.')
      const group = parts[1] ?? 'other'
      const shortName = parts.slice(2).join('.')
      if (!byGroup[group]) byGroup[group] = []
      byGroup[group].push({ key, shortName, title: r.title })
    }

    const groupOrder = ['ui', 'editor', 'context', 'exec', 'programs', 'router']
    const groupLabels: Record<string, string> = {
      ui: 'UI',
      editor: 'Editor',
      context: 'Context',
      exec: 'Execution',
      programs: 'Programs',
      router: 'Router',
    }

    let peHtml = `<div class="sidebar-collapsible-header" onclick="Playground.toggleApiSection('playground-effects')">
  <span>Playground effects</span><span id="api-chevron-playground-effects">${chevronRight}</span>
</div>
<div id="api-content-playground-effects" class="sidebar-collapsible-content">`

    for (const group of groupOrder) {
      const entries = byGroup[group]
      if (!entries || entries.length === 0) continue
      entries.sort((a, b) => a.shortName.localeCompare(b.shortName))
      const label = groupLabels[group] ?? group
      const fnLinks = entries.map(e => {
        const linkName = makeLinkName('playground-effect', e.key)
        return makeLink(linkName, `@${e.title}`)
      }).join('\n    ')
      peHtml += `
  <div class="sidebar-collapsible-header" onclick="Playground.togglePlaygroundEffectGroup('${escapeHtml(group)}')">
    <span>${escapeHtml(label)}</span><span id="pe-chevron-${group}">${chevronRight}</span>
  </div>
  <div id="pe-content-${group}" class="sidebar-collapsible-content">
    ${fnLinks}
  </div>`
    }

    peHtml += '\n</div>'
    html += peHtml
  }

  container.innerHTML = html
}

function onDocumentClick(event: Event) {
  const target = event.target as HTMLInputElement | undefined

  if (!target?.closest('#more-menu') && elements.moreMenu.style.display === 'block')
    closeMoreMenu()

  if (!target?.closest('#add-context-menu') && elements.addContextMenu.style.display === 'block')
    closeAddContextMenu()

  // Close modal more-menus when clicking outside
  if (!target?.closest('.modal-more-menu') && !target?.closest('.modal-header__more-btn')) {
    document.querySelectorAll('.modal-more-menu').forEach(menu => {
      (menu as HTMLElement).style.display = 'none'
    })
    closeEffectHandlerMenus()
  }
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
  if (elements.dvalaTextArea.readOnly) return
  ignoreSelectionChange = true
  if (undoDvalaCode()) {
    applyState()
    focusDvalaCode()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export const redoDvalaCodeHistory = throttle(() => {
  if (elements.dvalaTextArea.readOnly) return
  ignoreSelectionChange = true
  if (redoDvalaCode()) {
    applyState()
    focusDvalaCode()
  }
  setTimeout(() => ignoreSelectionChange = false)
})

function formatStorageSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${(bytes / 1024).toFixed(2)} KB`
}

function updateStorageUsage() {
  const localEl = document.getElementById('settings-storage-local')
  const idbEl = document.getElementById('settings-storage-idb')
  if (localEl) {
    const bytes = new TextEncoder().encode(JSON.stringify(localStorage)).length
    localEl.textContent = formatStorageSize(bytes)
  }
  if (idbEl) {
    const bytes = new TextEncoder().encode(JSON.stringify({ saved: getSavedSnapshots(), terminal: getTerminalSnapshots() })).length
    idbEl.textContent = formatStorageSize(bytes)
  }
}

export function clearLocalStorageData() {
  void showInfoModal('Clear Local Storage', 'This will clear code, context, settings, and layout preferences.', () => {
    clearAllStates()
    applyState(true)
    updateStorageUsage()
  })
}

export function clearIndexedDbData() {
  void showInfoModal('Clear IndexedDB', 'This will delete all saved snapshots, recent snapshots, and saved programs.', () => {
    clearAllSnapshots()
    clearAllPrograms()
    saveState({ 'current-program-id': null })
    populateSnapshotsList()
    populateSavedProgramsList()
    updateCSS()
    updateStorageUsage()
  })
}

function setContext(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom') {
  elements.contextTextArea.value = value

  if (pushToHistory) {
    saveState({
      'context': value,
      'context-selection-start': elements.contextTextArea.selectionStart,
      'context-selection-end': elements.contextTextArea.selectionEnd,
    }, true)
    scheduleAutoSave()
  } else {
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
  } catch (_e) {
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
  } catch (_e) {
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
    const comma = i < entries.length - 1 ? ',' : ''
    if (Array.isArray(value)) {
      const items = value as Record<string, unknown>[]
      if (items.length === 0) {
        parts.push(`  ${JSON.stringify(key)}: []${comma}`)
      } else {
        parts.push(`  ${JSON.stringify(key)}: [`)
        items.forEach((item, j) => {
          const itemComma = j < items.length - 1 ? ',' : ''
          const itemEntries = Object.entries(item)
          parts.push('    {')
          itemEntries.forEach(([itemKey, itemValue], k) => {
            const fieldComma = k < itemEntries.length - 1 ? ',' : ''
            parts.push(`      ${JSON.stringify(itemKey)}: ${JSON.stringify(itemValue)}${fieldComma}`)
          })
          parts.push(`    }${itemComma}`)
        })
        parts.push(`  ]${comma}`)
      }
    } else {
      const record = value as Record<string, unknown>
      const subEntries = Object.entries(record)
      parts.push(`  ${JSON.stringify(key)}: {`)
      subEntries.forEach(([subKey, subValue], j) => {
        const subComma = j < subEntries.length - 1 ? ',' : ''
        parts.push(`    ${JSON.stringify(subKey)}: ${JSON.stringify(subValue)}${subComma}`)
      })
      parts.push(`  }${comma}`)
    }
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

  const sampleEffectHandlers: { pattern: string; handler: string }[] = [
    { pattern: 'host.greet', handler: 'async ({ args: [name], resume }) => { resume(`Hello, ${name}!`) }' },
    { pattern: 'host.add', handler: 'async ({ args: [a, b], resume }) => { resume(a + b) }' },
    { pattern: 'host.delay', handler: `async ({ args: [ms], resume }) => {
  await new Promise(resolve => setTimeout(resolve, ms));
  resume(ms);
}` },
  ]

  const existing = (context.effectHandlers ?? []) as { pattern: string; handler: string }[]
  const existingPatterns = new Set(existing.map(h => h.pattern))
  context.effectHandlers = [...existing, ...sampleEffectHandlers.filter(h => !existingPatterns.has(h.pattern))]

  setContext(formatContextJson(context), true)
}

export function newFile() {
  guardCodeReplacement(() => {
    flushPendingAutoSave()
    saveState({ 'dvala-code': '', 'current-program-id': null, 'dvala-code-edited': false }, true)
    elements.dvalaTextArea.value = ''
    syntaxOverlay.update()
    updateCSS()
    populateSavedProgramsList()
    focusDvalaCode()
  })
}

/**
 * Sets the code in the editor.
 * When `onProceed` is provided the entire operation (code change + callback) is
 * run inside `guardCodeReplacement`, so callers never need to add the guard manually.
 */
function setDvalaCode(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom', onProceed?: () => void) {
  if (onProceed !== undefined) {
    guardCodeReplacement(() => {
      saveState({ 'current-program-id': null, 'dvala-code-edited': false })
      setDvalaCode(value, pushToHistory, scroll)
      onProceed()
    })
    return
  }

  elements.dvalaTextArea.value = value
  syntaxOverlay.update()

  if (pushToHistory) {
    saveState({
      'dvala-code': value,
      'dvala-code-selection-start': elements.dvalaTextArea.selectionStart,
      'dvala-code-selection-end': elements.dvalaTextArea.selectionEnd,
    }, true)
    scheduleAutoSave()
  } else {
    saveState({ 'dvala-code': value }, false)
  }

  if (scroll === 'top')
    syntaxOverlay.scrollContainer.scrollTo(0, 0)
  else if (scroll === 'bottom')
    syntaxOverlay.scrollContainer.scrollTo({ top: syntaxOverlay.scrollContainer.scrollHeight, behavior: 'smooth' })
}

export function resetOutput() {
  elements.outputResult.innerHTML = ''
  clearState('output')
}

export function resetPlayground() {
  flushPendingAutoSave()
  saveState({ 'current-program-id': null, 'dvala-code-edited': false })
  setDvalaCode('', true)
  setContext('', true)
  resetOutput()
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

window.onload = async function () {
  renderShell()
  applyLayout()
  injectPlaygroundEffects()
  populateSidebarApiSections()
  populateSidebarVersion()
  await initSnapshotStorage()
  await initPrograms()
  initExecutionControlBar()
  syntaxOverlay = new SyntaxOverlay('dvala-textarea')

  elements.contextUndoButton.classList.add('disabled')
  elements.contextRedoButton.classList.add('disabled')
  elements.dvalaCodeUndoButton.classList.add('disabled')
  elements.dvalaCodeRedoButton.classList.add('disabled')
  setContextHistoryListener(status => {
    if (status.canUndo) {
      elements.contextUndoButton.classList.remove('disabled')
    } else {
      elements.contextUndoButton.classList.add('disabled')
    }

    if (status.canRedo) {
      elements.contextRedoButton.classList.remove('disabled')
    } else {
      elements.contextRedoButton.classList.add('disabled')
    }
  })

  setDvalaCodeHistoryListener(status => {
    if (status.canUndo) {
      elements.dvalaCodeUndoButton.classList.remove('disabled')
    } else {
      elements.dvalaCodeUndoButton.classList.add('disabled')
    }

    if (status.canRedo) {
      elements.dvalaCodeRedoButton.classList.remove('disabled')
    } else {
      elements.dvalaCodeRedoButton.classList.add('disabled')
    }
  })

  document.addEventListener('click', onDocumentClick, true)

  elements.mainPanel.addEventListener('scroll', () => {
    closeContextMenu()
  })

  window.addEventListener('resize', () => {
    closeMoreMenu()
    closeContextMenu()
  })

  elements.resizePlayground.onmousedown = event => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'playground',
      startMoveY: event.clientY,
      heightBeforeMove: getState('playground-height'),
    }
  }

  elements.resizeDevider1.onmousedown = event => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'resize-divider-1',
      startMoveX: event.clientX,
      percentBeforeMove: getState('resize-divider-1-percent'),
    }
  }

  elements.resizeDevider2.onmousedown = event => {
    event.preventDefault()
    document.body.classList.add('no-select')
    moveParams = {
      id: 'resize-divider-2',
      startMoveX: event.clientX,
      percentBeforeMove: getState('resize-divider-2-percent'),
    }
  }

  elements.resizeSidebar.onmousedown = event => {
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
    } else if (moveParams.id === 'resize-divider-1') {
      let resizeDivider1XPercent
        = moveParams.percentBeforeMove + ((event.clientX - moveParams.startMoveX) / windowWidth) * 100
      if (resizeDivider1XPercent < 10)
        resizeDivider1XPercent = 10

      if (resizeDivider1XPercent > getState('resize-divider-2-percent') - 10)
        resizeDivider1XPercent = getState('resize-divider-2-percent') - 10

      updateState({ 'resize-divider-1-percent': resizeDivider1XPercent })
      applyLayout()
    } else if (moveParams.id === 'resize-divider-2') {
      let resizeDivider2XPercent
        = moveParams.percentBeforeMove + ((event.clientX - moveParams.startMoveX) / windowWidth) * 100
      if (resizeDivider2XPercent < getState('resize-divider-1-percent') + 10)
        resizeDivider2XPercent = getState('resize-divider-1-percent') + 10

      if (resizeDivider2XPercent > 90)
        resizeDivider2XPercent = 90

      updateState({ 'resize-divider-2-percent': resizeDivider2XPercent })
      applyLayout()
    } else if (moveParams.id === 'resize-sidebar') {
      let sidebarWidth = moveParams.widthBeforeMove + (event.clientX - moveParams.startMoveX)
      if (sidebarWidth < 150)
        sidebarWidth = 150

      if (sidebarWidth > windowWidth * 0.5)
        sidebarWidth = windowWidth * 0.5

      updateState({ 'sidebar-width': sidebarWidth })
      applyLayout()
    }
  }

  window.addEventListener('keydown', evt => {
    if (handleSearchKeyDown(evt))
      return

    // Unified effect panel: delegate key events to the current effect's handler first
    if (pendingEffects.length > 0) {
      const entry = pendingEffects[currentEffectIndex]
      if (entry?.onKeyDown?.(evt))
        return
    }

    if (evt.ctrlKey) {
      switch (evt.key) {
        case 'r':
          evt.preventDefault()
          if (evt.shiftKey)
            void runSync()
          else
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
      if (resolveInfoModal) {
        dismissInfoModal()
      } else if (pendingEffects.length > 0) {
        // Effect panel has no close button — Escape can't dismiss it
        closeEffectHandlerMenus()
        showToast(EFFECT_MODAL_ESCAPE_HINT, { severity: 'error' })
      } else if (modalStack.length > 0) {
        if (modalStack.length > 1) {
          slideBackSnapshotModal()
        } else {
          closeAllModals()
        }
      }
      evt.preventDefault()
    }
    if (evt.key === 'Enter' && resolveInfoModal) {
      evt.preventDefault()
      closeInfoModal()
    }
    if (evt.key === 'Enter' && currentSnapshot) {
      evt.preventDefault()
      void resumeSnapshot()
    }
    if (((isMac() && evt.metaKey) || (!isMac && evt.ctrlKey)) && !evt.shiftKey && evt.key === 'z') {
      evt.preventDefault()
      if (document.activeElement === elements.contextTextArea)
        undoContextHistory()
      else if (document.activeElement === elements.dvalaTextArea && !elements.dvalaTextArea.readOnly)
        undoDvalaCodeHistory()
    }
    if (((isMac() && evt.metaKey) || (!isMac && evt.ctrlKey)) && evt.shiftKey && evt.key === 'z') {
      evt.preventDefault()
      if (document.activeElement === elements.contextTextArea)
        redoContextHistory()
      else if (document.activeElement === elements.dvalaTextArea && !elements.dvalaTextArea.readOnly)
        redoDvalaCodeHistory()
    }
  })
  elements.contextTextArea.addEventListener('keydown', evt => {
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

  elements.dvalaTextArea.addEventListener('keydown', evt => {
    keydownHandler(evt, () => {
      setDvalaCode(elements.dvalaTextArea.value, true)
      saveState({ 'dvala-code-edited': true })
      updateCSS()
    })
  })
  elements.dvalaTextArea.addEventListener('input', () => {
    setDvalaCode(elements.dvalaTextArea.value, true)
    saveState({ 'dvala-code-edited': true })
    updateCSS()
    syntaxOverlay.update()
  })
  syntaxOverlay.scrollContainer.addEventListener('scroll', () => {
    saveState({ 'dvala-code-scroll-top': syntaxOverlay.scrollContainer.scrollTop })
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
  populateSnapshotsList()
  populateSavedProgramsList()

  router.init(appPath => {
    routeToPath(appPath)
  })

  onSearchClose(() => {
    applyState()
  })
  initSearchDialog()
}

function getDataFromUrl() {
  const urlParams = new URLSearchParams(window.location.search)

  const urlState = urlParams.get('state')
  if (urlState) {
    if (applyEncodedState(urlState))
      showToast('State loaded from URL')
    else
      showToast('Invalid state URL parameter', { severity: 'error' })

    urlParams.delete('state')
    history.replaceState(null, '', `${location.pathname}${urlParams.toString() ? '?' : ''}${urlParams.toString()}`)
  }

  const urlSnapshot = urlParams.get('snapshot')
  if (urlSnapshot) {
    const snapshot = decodeSnapshot(urlSnapshot)
    urlParams.delete('snapshot')
    history.replaceState(null, '', `${location.pathname}${urlParams.toString() ? '?' : ''}${urlParams.toString()}`)
    if (snapshot) {
      showToast('Snapshot loaded from link')
      void openSnapshotModal(snapshot)
    } else {
      showToast('Invalid snapshot link', { severity: 'error' })
    }
  }
}

function keydownHandler(evt: KeyboardEvent, onChange: () => void): void {
  if (pendingEffects.length > 0) {
    // An effect panel is open - prevent the code textarea from handling these keys
    if (['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evt.key)) {
      evt.preventDefault()
    }
    return
  }
  const target = evt.target as HTMLTextAreaElement
  const start = target.selectionStart
  const end = target.selectionEnd
  const indexOfReturn = target.value.lastIndexOf('\n', start - 1)
  const rowLength = start - indexOfReturn - 1
  const onTabStop = rowLength % 2 === 0

  if (
    (!['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'Tab'].includes(evt.key) && evt.code !== 'Space')
    || (evt.code === 'Space' && !evt.altKey)
  ) {
    autoCompleter = null
  }

  if (evt.code === 'Space' && evt.altKey) {
    evt.preventDefault()
    if (!autoCompleter) {
      autoCompleter = getAutoCompleter(target.value, start, { bindings: getDvalaParamsFromContext().bindings, effectNames: getPlaygroundEffectHandlers().map(h => h.pattern) })
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
    case 'Tab': {
      evt.preventDefault()
      if (autoCompleter) {
        // Cycle through suggestions with Tab / Shift+Tab
        const suggestion = evt.shiftKey ? autoCompleter.getPreviousSuggestion() : autoCompleter.getNextSuggestion()
        if (suggestion) {
          target.value = suggestion.program
          target.selectionStart = target.selectionEnd = suggestion.position
          onChange()
        }
      } else if (!evt.shiftKey) {
        // If cursor is directly after non-whitespace, try autocomplete first
        const charBefore = start > 0 ? target.value[start - 1] : ''
        if (charBefore && !/\s/.test(charBefore)) {
          const completer = getAutoCompleter(target.value, start, { bindings: getDvalaParamsFromContext().bindings, effectNames: getPlaygroundEffectHandlers().map(h => h.pattern) })
          if (completer.getSuggestions().length > 0) {
            autoCompleter = completer
            const suggestion = autoCompleter.getNextSuggestion()
            if (suggestion) {
              target.value = suggestion.program
              target.selectionStart = target.selectionEnd = suggestion.position
              onChange()
            }
            break
          }
        }
        // Fall back to indentation
        target.value = target.value.substring(0, start) + (onTabStop ? '  ' : ' ') + target.value.substring(end)
        target.selectionStart = target.selectionEnd = start + (onTabStop ? 2 : 1)
        onChange()
      }
      break
    }
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

function pageIdToAppPath(pageId: string): string {
  if (!pageId || pageId === 'index') return '/'
  // tutorial pages
  if (pageId.startsWith('tutorial-')) return `/tutorials/${pageId.slice(9)}`
  // special static pages — map to router paths expected by routeToPath
  if (pageId === 'settings-page') return '/settings'
  if (pageId === 'saved-programs-page') return '/saved'
  if (pageId === 'snapshots-page') return '/snapshots'
  // reference pages: pageId is the linkName like 'collection-map'
  return `/ref/${pageId}`
}

/** Static page IDs that live as real DOM elements (show/hide via active-content). */
const STATIC_PAGES = new Set(['settings-page', 'saved-programs-page', 'snapshots-page'])

/**
 * Route to the given app-relative path.
 * Dynamic content pages render HTML into #dynamic-page.
 * Static pages (settings, saved-programs, snapshots) use the old show/hide mechanism.
 */
function routeToPath(appPath: string): void {
  const path = appPath.replace(/^\//, '')

  // Determine if this is a static page that already exists in the DOM
  let staticPageId: string | null = null
  if (path === 'settings' || path.startsWith('settings/')) staticPageId = 'settings-page'
  else if (path === 'saved') staticPageId = 'saved-programs-page'
  else if (path === 'snapshots') staticPageId = 'snapshots-page'

  if (staticPageId && STATIC_PAGES.has(staticPageId)) {
    // Clear any dynamic page content, then show the static page
    const dynPage = document.getElementById('dynamic-page')
    if (dynPage) dynPage.innerHTML = ''
    const tab = path.startsWith('settings/') ? path.slice(9) : undefined
    showPage(staticPageId, 'instant', 'none', tab)
    document.title = 'Settings | Dvala'
    return
  }

  // For all other paths, render dynamically into #dynamic-page
  inactivateAll()
  closeSearch()
  elements.mainPanel.scrollTo({ top: 0 })

  const dynPage = document.getElementById('dynamic-page')
  if (!dynPage) return

  // Determine which sidebar link to highlight
  let sidebarLinkId: string | null = null
  let pageTitle = 'Dvala'

  if (!path || path === '/') {
    dynPage.innerHTML = renderStartPage()
    sidebarLinkId = 'home-page_link'
    pageTitle = 'Dvala - Suspendable Functional Language for JavaScript'
  } else if (path === 'core') {
    dynPage.innerHTML = renderCorePage()
    pageTitle = 'Core API | Dvala'
  } else if (path === 'modules') {
    dynPage.innerHTML = renderModulesPage()
    pageTitle = 'Modules | Dvala'
  } else if (path === 'examples') {
    dynPage.innerHTML = renderExamplePage()
    sidebarLinkId = 'example-page_link'
    pageTitle = 'Examples | Dvala'
  } else if (path === 'tutorials') {
    dynPage.innerHTML = renderTutorialsIndexPage()
    sidebarLinkId = 'tutorials-page_link'
    pageTitle = 'Tutorials | Dvala'
  } else if (path.startsWith('tutorials/')) {
    const tutId = path.slice('tutorials/'.length)
    dynPage.innerHTML = renderTutorialPage(tutId)
    sidebarLinkId = 'tutorials-page_link'
    const tut = allTutorials.find(t => t.id === tutId)
    pageTitle = tut ? `${tut.title} | Dvala Tutorials` : 'Tutorial | Dvala'
  } else if (path.startsWith('ref/')) {
    const linkName = path.slice('ref/'.length)
    dynPage.innerHTML = renderDocPage(linkName)
    const data = window.referenceData
    if (data) {
      const entry = data.searchEntries.find(e => e.linkName === linkName)
      pageTitle = entry ? `${entry.title} | Dvala Reference` : 'Reference | Dvala'
    }
  } else if (path === 'about') {
    dynPage.innerHTML = renderAboutPage()
    sidebarLinkId = 'about-page_link'
    pageTitle = 'About | Dvala'
  } else {
    dynPage.innerHTML = renderStartPage()
    sidebarLinkId = 'home-page_link'
    pageTitle = 'Dvala - Suspendable Functional Language for JavaScript'
  }

  document.title = pageTitle

  // Highlight the sidebar link
  if (sidebarLinkId) {
    const link = document.getElementById(sidebarLinkId)
    if (link) link.classList.add('active-sidebar-entry')
  }
}

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

  // Snapshot UI state that playground effects may modify
  const ta = elements.dvalaTextArea
  const uiSnapshot = {
    dvalaCode: getState('dvala-code'),
    context: getState('context'),
    scrollTop: syntaxOverlay.scrollContainer.scrollTop,
    scrollLeft: syntaxOverlay.scrollContainer.scrollLeft,
    selectionStart: ta.selectionStart,
    selectionEnd: ta.selectionEnd,
    route: location.pathname,
  }

  const hijacker = hijackConsole()
  try {
    const pure = getState('pure')
    const disableAutoCheckpoint = getState('disable-auto-checkpoint')
    const runResult = await getDvala().runAsync(code, pure
      ? { bindings: dvalaParams.bindings, pure: true, disableAutoCheckpoint, terminalSnapshot: true }
      : { bindings: dvalaParams.bindings, effectHandlers: dvalaParams.effectHandlers, disableAutoCheckpoint, terminalSnapshot: true },
    )
    if (runResult.type === 'error') {
      if (runResult.snapshot) {
        saveTerminalSnapshot(runResult.snapshot, 'error')
      }
      throw runResult.error
    }
    if (runResult.type === 'suspended') {
      appendOutput('Program suspended', 'comment')
      void openSnapshotModal(runResult.snapshot)
      return
    }
    if (runResult.type === 'halted') {
      appendOutput('Program halted', 'comment')
      if (runResult.snapshot) {
        saveTerminalSnapshot(runResult.snapshot, 'halted')
      }
      return
    }
    const content = stringifyValue(runResult.value, false)
    if (runResult.snapshot) {
      saveTerminalSnapshot(runResult.snapshot, 'completed', content)
    }
    appendOutput(content, 'result')
  } catch (error) {
    appendOutput(error, 'error')
  } finally {
    // Restore UI state modified by playground effects
    if (getState('dvala-code') !== uiSnapshot.dvalaCode) {
      elements.dvalaTextArea.value = uiSnapshot.dvalaCode
      syntaxOverlay.update()
      saveState({ 'dvala-code': uiSnapshot.dvalaCode }, false)
    }
    if (getState('context') !== uiSnapshot.context) {
      elements.contextTextArea.value = uiSnapshot.context
      saveState({ context: uiSnapshot.context }, false)
    }
    syntaxOverlay.scrollContainer.scrollTop = uiSnapshot.scrollTop
    syntaxOverlay.scrollContainer.scrollLeft = uiSnapshot.scrollLeft
    if (location.pathname !== uiSnapshot.route) {
      router.navigate(uiSnapshot.route)
    }
    hijacker.releaseConsole()
    focusDvalaCode()
    ta.setSelectionRange(uiSnapshot.selectionStart, uiSnapshot.selectionEnd)
    syntaxOverlay.scrollContainer.scrollTop = uiSnapshot.scrollTop
  }
}

export function runSync() {
  addOutputSeparator()
  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Run selection (sync)' : 'Run sync'

  appendOutput(`${title}: ${truncateCode(code)}`, 'comment')

  const dvalaParams = getDvalaParamsFromContext()

  const hijacker = hijackConsole()
  try {
    const pure = getState('pure')
    const result = getDvala().run(code, pure
      ? { bindings: dvalaParams.bindings, pure: true }
      : { bindings: dvalaParams.bindings, effectHandlers: getSyncEffectHandlers() },
    )
    const content = stringifyValue(result, false)
    appendOutput(content, 'result')
  } catch (error) {
    appendOutput(error, 'error')
  } finally {
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

    appendOutput(unresolvedSymbolsOutput, 'analyze')
  } catch (error) {
    appendOutput(error, 'error')
  } finally {
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
  } catch (error) {
    appendOutput(error, 'error')
    hijacker.releaseConsole()
  } finally {
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
  } catch (error) {
    appendOutput(error, 'error')
    hijacker.releaseConsole()
    return
  } finally {
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
  } else {
    saveState({
      'focused-panel': 'dvala-code',
      'dvala-code-selection-start': selectedCode.selectionStart,
      'dvala-code-selection-end': selectedCode.selectionEnd,
    })
  }
  applyState()
  showToast('Code formatted')
}

export function toggleDebug() {
  saveState({ debug: !getState('debug') })
  updateCSS()
}

export function togglePure() {
  saveState({ pure: !getState('pure') })
  updateCSS()
}

export function toggleInterceptEffects() {
  saveState({ 'intercept-effects': !getState('intercept-effects') })
  updateCSS()
}

export function toggleInterceptCheckpoint() {
  saveState({ 'intercept-checkpoint': !getState('intercept-checkpoint') })
  updateCSS()
}

export function toggleInterceptError() {
  saveState({ 'intercept-error': !getState('intercept-error') })
  updateCSS()
}

export function toggleInterceptUnhandled() {
  saveState({ 'intercept-unhandled': !getState('intercept-unhandled') })
  updateCSS()
}

export function toggleDisableStandardHandlers() {
  saveState({ 'disable-standard-handlers': !getState('disable-standard-handlers') })
  updateCSS()
}

export function toggleDisablePlaygroundEffects() {
  saveState({ 'disable-playground-effects': !getState('disable-playground-effects') })
  updateCSS()
}

export function toggleAutoCheckpoint() {
  saveState({ 'disable-auto-checkpoint': !getState('disable-auto-checkpoint') })
  updateCSS()
}

export function togglePlaygroundDeveloper() {
  saveState({ 'playground-developer': !getState('playground-developer') })
  updateCSS()
}

export function focusContext() {
  elements.contextTextArea.focus()
}

export function focusDvalaCode() {
  elements.dvalaTextArea.focus()
}

function makeArgRow(content: string, index?: number, copyContent?: string): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = `display:flex; flex-direction:row; gap:3px; align-items:center; min-width:0; padding-right:0.5rem;${index !== undefined ? ' height:1.4rem;' : ''}`
  if (index !== undefined) {
    const num = document.createElement('span')
    num.textContent = String(index + 1)
    num.style.cssText = 'font-size:0.65rem; color: var(--color-text-faintest); font-family:sans-serif; font-weight:bold; min-width:1rem; flex-shrink:0;'
    row.appendChild(num)
  }
  const code = document.createElement('code')
  code.textContent = content
  if (index !== undefined) {
    code.style.cssText = 'white-space:nowrap; font-size:0.75rem; color: var(--color-text); overflow:hidden; text-overflow:ellipsis; min-width:0; flex: 1 1 0;'

    const textToCopy = copyContent ?? content
    const copyBtn = document.createElement('span')
    copyBtn.innerHTML = copyIcon
    copyBtn.style.cssText = 'font-size:0.9rem; display:inline-flex; align-items:center; justify-content:center; height:1.4rem; overflow:hidden; color:var(--color-text-faintest); cursor:pointer; flex-shrink:0; margin-left:1rem; opacity:0; transition:opacity 0.15s ease;'
    copyBtn.addEventListener('click', e => {
      e.stopPropagation()
      void navigator.clipboard.writeText(textToCopy)
    })
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.color = 'var(--color-text)'
    })
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.color = 'var(--color-text-faintest)'
    })

    row.addEventListener('mouseenter', () => {
      copyBtn.style.opacity = '1'
    })
    row.addEventListener('mouseleave', () => {
      copyBtn.style.opacity = '0'
    })

    row.appendChild(code)
    row.appendChild(copyBtn)
  } else {
    code.style.cssText = 'white-space:pre; font-size:0.75rem; color: var(--color-text);'
    row.appendChild(code)
  }
  return row
}

function snapshotLabel(snapshot: Snapshot): string {
  return `Checkpoint #${snapshot.index} — ${snapshot.message}`
}

function buildBreadcrumbs(panel: HTMLElement) {
  const container = panel.querySelector('[data-ref="breadcrumbs"]') as HTMLElement
  container.innerHTML = ''
  container.style.display = ''

  modalStack.forEach((entry, i) => {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.className = 'breadcrumb-sep'
      sep.textContent = '›'
      container.appendChild(sep)
    }

    const isLast = i === modalStack.length - 1
    const span = document.createElement('span')
    span.textContent = entry.label
    span.className = isLast ? 'breadcrumb-item' : 'breadcrumb-item--clickable'
    if (!isLast) {
      const targetIndex = i
      span.addEventListener('click', () => popToLevel(targetIndex))
    }
    container.appendChild(span)
  })

}

function popToLevel(targetIndex: number) {
  // Remove all panels above target immediately (no animation), keep the top one for animation
  while (modalStack.length > targetIndex + 2) {
    const { panel } = modalStack.pop()!
    panel.remove()
  }
  // Animate the top panel out to the right
  if (modalStack.length > targetIndex + 1) {
    const { panel } = modalStack.pop()!
    panel.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
      { duration: 250, easing: 'ease' },
    ).onfinish = () => { panel.remove() }
  }
  currentSnapshot = modalStack[modalStack.length - 1]?.snapshot ?? null
  // Update control bar based on current snapshot state
  if (elements.executionControlBar.style.display === 'flex') {
    updateExecutionControlBarForSnapshot()
  }
}

const MAX_URL_LENGTH = 24 * 1024 // 24KB, arbitrary limit to avoid creating unshareable links

function populateSnapshotPanel(panel: HTMLElement, snapshot: Snapshot, error?: DvalaErrorJSON) {
  const ref = (name: string) => panel.querySelector(`[data-ref="${name}"]`) as HTMLElement

  // Error section - insert before the columns if there's an error
  if (error) {
    const columns = panel.querySelector('.snapshot-panel__columns') as HTMLElement
    const errorSection = document.createElement('div')
    errorSection.className = 'snapshot-panel__error'

    const errorLabel = document.createElement('span')
    errorLabel.textContent = 'ERROR'
    errorLabel.style.cssText = 'font-size: 0.75rem; font-weight: bold; color: var(--color-error); text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif;'
    errorSection.appendChild(errorLabel)

    const codeWrapper = document.createElement('div')
    codeWrapper.className = 'example-code'
    codeWrapper.style.cssText = 'position: relative; border-left-color: var(--color-error);'

    const errorPre = document.createElement('pre')
    errorPre.className = 'fancy-scroll'
    errorPre.textContent = error.message
    errorPre.style.cssText = 'background: var(--color-surface-dim); color: var(--color-text); padding: 0.5rem; font-size: 0.875rem; font-family: monospace; overflow: auto; max-height: 8rem; white-space: pre-wrap; word-break: break-word; margin: 0; border: none;'
    codeWrapper.appendChild(errorPre)

    const actionBar = document.createElement('div')
    actionBar.className = 'example-action-bar'
    actionBar.style.cssText = 'position: absolute; top: 0; right: 0; flex-direction: row; margin-top: 2px;'

    const copyBtn = document.createElement('div')
    copyBtn.className = 'example-action-btn'
    copyBtn.style.cssText = 'padding: 0.5rem; font-size: 1.125rem; cursor: pointer;'
    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/></svg>'
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(error.message)
    })
    actionBar.appendChild(copyBtn)
    codeWrapper.appendChild(actionBar)

    errorSection.appendChild(codeWrapper)
    columns.parentElement!.insertBefore(errorSection, columns)
  }

  // Suspended effect section - hide if no active effect (terminal snapshots)
  const suspendedEffectSection = ref('suspended-effect-section')
  if (snapshot.effectName) {
    suspendedEffectSection.style.display = 'flex'
    ref('effect-name').textContent = snapshot.effectName

    // Effect args
    const argsEl = ref('effect-args')
    argsEl.innerHTML = ''
    if (snapshot.effectArg === undefined) {
      const empty = document.createElement('span')
      empty.textContent = '(no arguments)'
      empty.style.cssText = 'font-size:0.75rem; color: var(--color-text-faintest); font-style: italic;'
      argsEl.appendChild(empty)
    } else {
      argsEl.appendChild(makeArgRow(JSON.stringify(snapshot.effectArg), 0, JSON.stringify(snapshot.effectArg, null, 2)))
    }
  } else {
    suspendedEffectSection.style.display = 'none'
  }

  // Show Run button for all snapshots; disable it for completed (terminal) ones
  const resumeBtn = ref('resume-btn') as HTMLButtonElement
  if (snapshot.terminal === true) {
    resumeBtn.disabled = true
    resumeBtn.title = 'This snapshot has already completed and cannot be resumed'
  } else {
    resumeBtn.disabled = false
    resumeBtn.title = ''
  }

  // Mark share menu item if snapshot URL would be too long
  const shareBtn = ref('share-btn')
  const encodedLength = `${location.origin}${location.pathname}?snapshot=${encodeSnapshot(snapshot)}`.length
  if (encodedLength > MAX_URL_LENGTH) {
    shareBtn.style.opacity = '0.4'
    shareBtn.textContent = 'Share ⚠'
    shareBtn.title = 'Snapshot is too large to share as a URL'
  }

  // Meta
  const metaContainer = ref('meta-container')
  if (snapshot.meta === undefined) {
    metaContainer.innerHTML = ''
    const empty = document.createElement('span')
    empty.textContent = '(no metadata)'
    empty.style.cssText = 'font-size:0.75rem; color: var(--color-text-faintest); font-style: italic;'
    metaContainer.appendChild(empty)
  } else {
    const metaJson = JSON.stringify(snapshot.meta, null, 2)
    ref('meta-json').textContent = metaJson
    ref('copy-meta-btn').addEventListener('click', () => {
      void navigator.clipboard.writeText(metaJson)
    })
  }

  // Technical info
  const techEl = ref('tech')
  techEl.innerHTML = ''
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  const techRows: [string, string][] = [
    ['ID', snapshot.id],
    ['Index', String(snapshot.index)],
    ['Run ID', snapshot.executionId],
    ['Timestamp', (() => {
      const d = new Date(snapshot.timestamp)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    })()],
    ['Size', snapshotBytes >= 1024 * 1024 ? `${(snapshotBytes / (1024 * 1024)).toFixed(2)} MB` : `${(snapshotBytes / 1024).toFixed(2)} KB`],
  ]
  techRows.forEach(([label, value]) => {
    const row = makeArgRow(value)
    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.cssText = 'font-size:0.7rem; color: var(--color-text-faintest); font-weight:bold; font-family:sans-serif;'
    row.insertBefore(labelEl, row.firstChild)
    techEl.appendChild(row)
  })

  // Checkpoints
  const checkpointsEl = ref('checkpoints')
  checkpointsEl.innerHTML = ''
  const cpSnapshots = extractCheckpointSnapshots(snapshot.continuation)
  ref('cp-count').textContent = String(cpSnapshots.length)
  if (cpSnapshots.length === 0) {
    const empty = document.createElement('span')
    empty.textContent = '(no checkpoints)'
    empty.style.cssText = 'font-size:0.75rem; color: var(--color-text-faintest); font-style: italic;'
    checkpointsEl.appendChild(empty)
  } else {
    cpSnapshots.forEach(cpSnapshot => {
      const card = document.createElement('div')
      card.style.cssText = 'display:flex; flex-direction:row; align-items:center; gap:0.5rem; padding:0.4rem 0.6rem; border:1px solid var(--color-scrollbar-track); cursor:pointer; transition:border-color 0.15s ease, background 0.15s ease;'
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--color-text-dim)'
        card.style.background = 'var(--color-surface-hover)'
      })
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--color-scrollbar-track)'
        card.style.background = 'transparent'
      })
      card.addEventListener('click', () => pushCheckpointPanel(cpSnapshot))

      const badge = document.createElement('span')
      badge.textContent = `#${cpSnapshot.index}`
      badge.style.cssText = 'font-size:0.7rem; font-weight:bold; font-family:sans-serif; color:var(--color-text-secondary); background:var(--color-surface); padding:0.1rem 0.35rem; flex-shrink:0;'
      card.appendChild(badge)

      const info = document.createElement('div')
      info.style.cssText = 'display:flex; flex-direction:column; gap:1px; overflow:hidden; min-width:0;'

      if (cpSnapshot.meta !== null && cpSnapshot.meta !== undefined) {
        const meta = document.createElement('code')
        meta.textContent = JSON.stringify(cpSnapshot.meta)
        meta.style.cssText = 'font-size:0.75rem; color:var(--color-text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'
        info.appendChild(meta)
      }

      const msg = document.createElement('span')
      msg.textContent = cpSnapshot.message
      msg.style.cssText = 'font-size:0.75rem; color:var(--color-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'
      info.appendChild(msg)

      const ts = document.createElement('span')
      const d = new Date(cpSnapshot.timestamp)
      const pad = (n: number) => String(n).padStart(2, '0')
      ts.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      ts.style.cssText = 'font-size:0.65rem; color:var(--color-text-faintest); font-family:sans-serif;'
      info.appendChild(ts)

      card.appendChild(info)

      const playIcon = document.createElement('span')
      playIcon.innerHTML = ICONS.play
      playIcon.style.cssText = 'margin-left:auto; flex-shrink:0; font-size:1.1rem; color:var(--color-text-secondary); transition:color 0.15s ease;'
      playIcon.addEventListener('mouseenter', () => { playIcon.style.color = 'var(--color-text-bright)' })
      playIcon.addEventListener('mouseleave', () => { playIcon.style.color = 'var(--color-text-secondary)' })
      playIcon.addEventListener('click', evt => {
        evt.stopPropagation()
        currentSnapshot = cpSnapshot
        void resumeSnapshot()
      })
      card.appendChild(playIcon)

      checkpointsEl.appendChild(card)
    })
  }

}

function createSnapshotPanel(snapshot: Snapshot, error?: DvalaErrorJSON): HTMLElement {
  const clone = elements.snapshotPanelTemplate.content.cloneNode(true) as DocumentFragment
  const panel = clone.firstElementChild as HTMLElement

  const q = (ref: string) => panel.querySelector(`[data-ref="${ref}"]`) as HTMLElement

  q('resume-btn').addEventListener('click', () => { void resumeSnapshot() })

  q('save-btn').addEventListener('click', () => {
    const snap = currentSnapshot
    if (!snap) return
    pushSavePanel((name: string) => {
      const existing = getSavedSnapshots().filter(s => s.snapshot.id !== snap.id)
      existing.unshift({ kind: 'saved', snapshot: snap, savedAt: Date.now(), locked: false, name: name || undefined })
      setSavedSnapshots(existing)
      notifySnapshotAdded()
      populateSnapshotsList({ animateNewSaved: true })
      showToast(`Snapshot saved (${existing.length} total)`)
    })
  })
  q('share-btn').addEventListener('click', () => { shareSnapshot() })
  q('download-btn').addEventListener('click', () => { downloadSnapshot() })
  q('copy-json-btn').addEventListener('click', () => {
    if (currentSnapshot) {
      void navigator.clipboard.writeText(JSON.stringify(currentSnapshot, null, 2))
      showToast('JSON copied to clipboard')
    }
  })

  populateSnapshotPanel(panel, snapshot, error)
  return panel
}

/** Push a panel onto the modal stack. Sub-panels slide in from the right. */
function pushPanel(panel: HTMLElement, label: string, snapshot?: Snapshot, isEffect?: boolean) {
  if (snapshot !== undefined) currentSnapshot = snapshot
  const isRoot = modalStack.length === 0

  // If a close animation is in progress, cancel it and do instant swap
  const isReplacement = isRoot && overlayCloseAnimation !== null
  if (isReplacement) {
    overlayCloseAnimation!.cancel()
    overlayCloseAnimation = null
    elements.snapshotPanelContainer.innerHTML = ''
    elements.snapshotPanelContainer.style.opacity = '1'
  }

  if (!isRoot) {
    panel.style.position = 'absolute'
    panel.style.top = '0'
    panel.style.left = '0'
    panel.style.right = '0'
    panel.style.minHeight = `${elements.snapshotPanelContainer.offsetHeight}px`
    panel.style.zIndex = String(modalStack.length + 1)
  }

  panel.style.display = 'flex'
  elements.snapshotPanelContainer.appendChild(panel)
  modalStack.push({ panel, label, snapshot: snapshot ?? (currentSnapshot ?? null), isEffect })
  buildBreadcrumbs(panel)

  if (!isRoot) {
    // Slide in from right
    panel.animate(
      [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      { duration: 250, easing: 'ease', fill: 'forwards' },
    )
  } else {
    elements.snapshotPanelContainer.style.maxWidth = isEffect ? '480px' : panel.classList.contains('modal-panel') ? '420px' : ''
    elements.snapshotModal.style.display = 'flex'
    // Fade in (unless replacing, then instant)
    if (!isReplacement) {
      const container = elements.snapshotPanelContainer
      container.style.opacity = '0'
      container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
        .onfinish = () => { container.style.opacity = '1' }
    }
  }
}

/** Build a standard modal panel: modal-header with breadcrumbs + optional hamburger, body div, footer div. */
function createModalPanel(options?: {
  hamburgerItems?: { label: string; action: () => void }[]
  noClose?: boolean
  onClose?: () => void
}): { panel: HTMLElement; body: HTMLElement; footer: HTMLElement } {
  const panel = document.createElement('div')
  panel.className = 'modal-panel'

  const header = document.createElement('div')
  header.className = 'modal-header'

  const crumbs = document.createElement('div')
  crumbs.setAttribute('data-ref', 'breadcrumbs')
  crumbs.className = 'snapshot-panel__breadcrumbs'
  header.appendChild(crumbs)

  if (options?.hamburgerItems?.length) {
    const moreWrap = document.createElement('div')
    moreWrap.className = 'modal-header__more'

    const moreBtn = document.createElement('a')
    moreBtn.className = 'modal-header__more-btn'
    moreBtn.innerHTML = hamburgerIcon

    const menu = document.createElement('div')
    menu.className = 'modal-more-menu'

    options.hamburgerItems.forEach(item => {
      const a = document.createElement('a')
      a.textContent = item.label
      a.addEventListener('click', () => {
        menu.style.display = 'none'
        item.action()
      })
      menu.appendChild(a)
    })

    moreBtn.addEventListener('click', () => {
      closeEffectHandlerMenus()
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex'
    })

    moreWrap.appendChild(moreBtn)
    moreWrap.appendChild(menu)
    header.appendChild(moreWrap)
  }

  if (!options?.noClose) {
    const closeBtn = document.createElement('a')
    closeBtn.className = 'modal-header__close-btn'
    closeBtn.textContent = '✕'
    closeBtn.title = 'Close'
    closeBtn.addEventListener('click', () => options?.onClose ? options.onClose() : popModal())
    header.appendChild(closeBtn)
  }

  panel.appendChild(header)

  const body = document.createElement('div')
  body.className = 'modal-panel__body'
  panel.appendChild(body)

  const footer = document.createElement('div')
  footer.className = 'modal-panel__footer'
  panel.appendChild(footer)

  return { panel, body, footer }
}

/** Slide in a "Save As" form panel within the snapshot modal. */
function pushSavePanel(onSave: (name: string) => void) {
  const panel = document.createElement('div')
  panel.className = 'snapshot-panel fancy-scroll'
  panel.innerHTML = `
    <div class="modal-header">
      <div data-ref="breadcrumbs" class="snapshot-panel__breadcrumbs"></div>
    </div>
    <div class="snapshot-panel__body" style="display:flex;flex-direction:column;gap:var(--space-2);">
      <label for="save-snapshot-name" class="snapshot-panel__section-label">Name (optional)</label>
      <input id="save-snapshot-name" type="text" class="readline-input" placeholder="My snapshot…" style="width:100%;box-sizing:border-box;">
    </div>
    <div class="snapshot-panel__buttons">
      <button class="button cancel-btn">Cancel</button>
      <button class="button button--primary save-btn" style="margin-left:auto;">Save</button>
    </div>
  `
  const input = panel.querySelector('input') as HTMLInputElement
  const doSave = () => { onSave(input.value.trim()); slideBackSnapshotModal() }
  panel.querySelector('.cancel-btn')!.addEventListener('click', () => slideBackSnapshotModal())
  panel.querySelector('.save-btn')!.addEventListener('click', doSave)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave()
    else if (e.key === 'Escape') slideBackSnapshotModal()
  })
  pushPanel(panel, 'Save As')
  setTimeout(() => input.focus(), 260)
}

function pushCheckpointPanel(snapshot: Snapshot) {
  const panel = createSnapshotPanel(snapshot)
  pushPanel(panel, snapshotLabel(snapshot), snapshot)
  // Update control bar label to show new snapshot index
  if (elements.executionControlBar.style.display === 'flex') {
    showExecutionControlBarPaused()
  }
}

function getSnapshotError(snapshot: Snapshot): DvalaErrorJSON | undefined {
  const meta = snapshot.meta as { error?: DvalaErrorJSON } | undefined
  return meta?.error
}

let resolveSnapshotModal: (() => void) | null = null

export function openSnapshotModal(snapshot: Snapshot): Promise<void> {
  const error = getSnapshotError(snapshot)
  const panel = createSnapshotPanel(snapshot, error)

  // If an effect panel is at the top of the stack, replace it with the snapshot panel.
  // Uses instant swap to avoid jarring transitions.
  const top = modalStack[modalStack.length - 1]
  if (top?.isEffect) {
    modalStack.pop()
    top.panel.remove()
  }

  pushPanel(panel, 'Snapshot', snapshot)

  // Show control bar for all snapshots
  if (snapshot.terminal === true) {
    showExecutionControlBarTerminal()
  } else {
    showExecutionControlBarPaused()
  }

  return new Promise<void>(resolve => {
    resolveSnapshotModal = resolve
  })
}

export function slideBackSnapshotModal() {
  if (modalStack.length <= 1) return
  popModal()
}

/** Pop the current panel. Last panel fades out; sub-panels slide out. */
export function popModal() {
  if (modalStack.length === 0) return

  if (modalStack.length === 1) {
    // Clear state immediately so follow-up effects see a clean stack
    const dyingPanel = modalStack[0]!.panel
    modalStack.length = 0
    currentSnapshot = null
    resolveSnapshotModal?.()
    resolveSnapshotModal = null
    hideExecutionControlBar()

    // Fade out, then hide overlay
    const container = elements.snapshotPanelContainer
    overlayCloseAnimation = container.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease' })
    overlayCloseAnimation.onfinish = () => {
      overlayCloseAnimation = null
      elements.snapshotModal.style.display = 'none'
      container.style.opacity = ''
      container.style.maxWidth = ''
      container.innerHTML = ''
      dyingPanel.remove()
    }
    return
  }

  // Slide out to the right
  const { panel } = modalStack.pop()!
  panel.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 250, easing: 'ease' })
    .onfinish = () => { panel.remove() }
  currentSnapshot = modalStack[modalStack.length - 1]?.snapshot ?? null
  // Update control bar based on current snapshot state
  if (elements.executionControlBar.style.display === 'flex') {
    updateExecutionControlBarForSnapshot()
  }
}

export function closeAllModals() {
  elements.snapshotModal.style.display = 'none'
  elements.snapshotPanelContainer.style.opacity = ''
  elements.snapshotPanelContainer.style.maxWidth = ''
  elements.snapshotPanelContainer.innerHTML = ''
  modalStack.length = 0
  currentSnapshot = null
  hideExecutionControlBar()
  resolveSnapshotModal?.()
  resolveSnapshotModal = null
}
export const closeSnapshotModal = closeAllModals

export function openImportSnapshotModal() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(reader.result as string)
      } catch {
        void showInfoModal('Import failed', 'Invalid JSON — could not parse the file.')
        return
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('id' in parsed) ||
        !('continuation' in parsed) ||
        !('timestamp' in parsed) ||
        !('index' in parsed) ||
        !('executionId' in parsed) ||
        !('message' in parsed)
      ) {
        void showInfoModal('Import failed', 'Not a valid snapshot object.')
        return
      }
      showToast('Snapshot imported')
      void openSnapshotModal(parsed as Snapshot)
    }
    reader.readAsText(file)
  }
  input.click()
}

const TOAST_DURATION = 4_000

export function showToast(message: string, options?: { severity?: 'info' | 'error' }) {
  const severity = options?.severity ?? 'info'
  const toast = document.createElement('div')
  toast.className = `toast toast-${severity}`

  const text = document.createElement('span')
  text.textContent = message
  toast.appendChild(text)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'toast-close'
  closeBtn.textContent = '\u00D7'
  closeBtn.addEventListener('click', () => dismissToast(toast))
  toast.appendChild(closeBtn)

  elements.toastContainer.prepend(toast)

  setTimeout(() => dismissToast(toast), TOAST_DURATION)
}

function dismissToast(toast: HTMLElement) {
  if (!toast.parentElement)
    return
  toast.style.animation = 'toast-out 0.2s ease forwards'
  toast.addEventListener('animationend', () => toast.remove())
}

let resolveInfoModal: (() => void) | null = null
let infoModalOnConfirm: (() => void | Promise<void>) | null = null

export function showInfoModal(
  title: string,
  message: string,
  onConfirm?: () => void | Promise<void>,
): Promise<void> {
  const { panel, body, footer } = createModalPanel()

  const messageEl = document.createElement('div')
  messageEl.className = 'modal-body-row'
  messageEl.textContent = message
  body.appendChild(messageEl)

  if (onConfirm) {
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'button'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', () => dismissInfoModal())
    footer.appendChild(cancelBtn)
  }

  const okBtn = document.createElement('button')
  okBtn.className = 'button button--primary'
  okBtn.textContent = 'OK'
  okBtn.addEventListener('click', () => closeInfoModal())
  footer.appendChild(okBtn)

  infoModalOnConfirm = onConfirm ?? null
  pushPanel(panel, title)

  return new Promise<void>(resolve => {
    resolveInfoModal = resolve
  })
}

export function closeInfoModal() {
  const onConfirm = infoModalOnConfirm
  resolveInfoModal?.()
  resolveInfoModal = null
  infoModalOnConfirm = null
  popModal()
  if (onConfirm) void onConfirm()
}

function dismissInfoModal() {
  resolveInfoModal?.()
  resolveInfoModal = null
  infoModalOnConfirm = null
  popModal()
}

export function exportPlayground() {
  elements.exportModal.style.display = 'flex'
}

export function closeExportModal() {
  elements.exportModal.style.display = 'none'
}

export function doExport() {
  const settingsKeys = [
    'debug', 'pure', 'intercept-effects', 'intercept-checkpoint', 'intercept-error', 'intercept-unhandled',
    'disable-standard-handlers', 'disable-playground-effects', 'disable-auto-checkpoint',
  ]
  const codeKeys = [
    'dvala-code', 'dvala-code-scroll-top', 'dvala-code-selection-start', 'dvala-code-selection-end',
  ]
  const contextKeys = [
    'context', 'context-scroll-top', 'context-selection-start', 'context-selection-end',
  ]
  const layoutKeys = [
    'sidebar-width', 'playground-height', 'resize-divider-1-percent', 'resize-divider-2-percent',
  ]

  const includeCode = elements.exportOptCode.checked
  const includeContext = elements.exportOptContext.checked
  const includeSettings = elements.exportOptSettings.checked
  const includeSaved = elements.exportOptSavedSnapshots.checked
  const includeRecent = elements.exportOptRecentSnapshots.checked
  const includeLayout = elements.exportOptLayout.checked
  const includePrograms = elements.exportOptSavedPrograms.checked

  const allowedKeys = new Set<string>([
    ...(includeCode ? codeKeys.map(k => `playground-${k}`) : []),
    ...(includeContext ? contextKeys.map(k => `playground-${k}`) : []),
    ...(includeSettings ? settingsKeys.map(k => `playground-${k}`) : []),
    ...(includeLayout ? layoutKeys.map(k => `playground-${k}`) : []),
  ])

  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (allowedKeys.has(key))
      data[key] = localStorage.getItem(key)!
  }
  for (const [flag, keys] of [[includeSettings, settingsKeys], [includeLayout, layoutKeys]] as [boolean, string[]][]) {
    if (flag) {
      for (const k of keys) {
        const storageKey = `playground-${k}`
        if (!(storageKey in data))
          data[storageKey] = JSON.stringify(defaultState[k as keyof typeof defaultState])
      }
    }
  }

  const payload = JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    data,
    ...(includeSaved ? { savedSnapshots: getSavedSnapshots() } : {}),
    ...(includeRecent ? { recentSnapshots: getTerminalSnapshots() } : {}),
    ...(includePrograms ? { savedPrograms: getSavedPrograms() } : {}),
  }, null, 2)

  const now = new Date()
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
  const filename = `dvala-playground-${ts}.json`
  closeExportModal()
  void saveFile(payload, filename)
}

async function saveFile(content: string, filename: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as Window & typeof globalThis & { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: filename,
        startIn: 'downloads',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type ExportPayload = {
  version: number
  data: Record<string, string>
  savedSnapshots?: SavedSnapshot[]
  recentSnapshots?: TerminalSnapshotEntry[]
  savedPrograms?: SavedProgram[]
}

function isExportPayload(value: unknown): value is ExportPayload {
  return (
    typeof value === 'object'
    && value !== null
    && 'version' in value
    && 'data' in value
    && typeof (value as Record<string, unknown>).data === 'object'
  )
}

let pendingImportPayload: ExportPayload | null = null
let importNeedsReload = false

const importCategoryKeys = {
  code: ['dvala-code', 'dvala-code-scroll-top', 'dvala-code-selection-start', 'dvala-code-selection-end'],
  context: ['context', 'context-scroll-top', 'context-selection-start', 'context-selection-end'],
  settings: ['debug', 'pure', 'intercept-effects', 'intercept-checkpoint', 'intercept-error', 'intercept-unhandled', 'disable-standard-handlers', 'disable-playground-effects', 'disable-auto-checkpoint'],
  layout: ['sidebar-width', 'playground-height', 'resize-divider-1-percent', 'resize-divider-2-percent'],
}

function hasCategoryInPayload(payload: ExportPayload, keys: string[]): boolean {
  return keys.some(k => `playground-${k}` in payload.data)
}

export function importPlayground() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as unknown
        if (!isExportPayload(parsed)) {
          showToast('Invalid export file')
          return
        }
        pendingImportPayload = parsed

        const hasCode = hasCategoryInPayload(parsed, importCategoryKeys.code)
        const hasContext = hasCategoryInPayload(parsed, importCategoryKeys.context)
        const hasSettings = hasCategoryInPayload(parsed, importCategoryKeys.settings)
        const hasLayout = hasCategoryInPayload(parsed, importCategoryKeys.layout)
        const hasSaved = (parsed.savedSnapshots?.length ?? 0) > 0
        const hasRecent = (parsed.recentSnapshots?.length ?? 0) > 0
        const hasPrograms = (parsed.savedPrograms?.length ?? 0) > 0

        const setup = (el: HTMLInputElement, label: HTMLLabelElement, present: boolean) => {
          el.checked = present
          el.disabled = !present
          label.style.opacity = present ? '' : '0.4'
          label.style.cursor = present ? '' : 'default'
        }

        setup(elements.importOptCode, elements.importOptCodeLabel, hasCode)
        setup(elements.importOptContext, elements.importOptContextLabel, hasContext)
        setup(elements.importOptSettings, elements.importOptSettingsLabel, hasSettings)
        setup(elements.importOptLayout, elements.importOptLayoutLabel, hasLayout)
        setup(elements.importOptSavedSnapshots, elements.importOptSavedSnapshotsLabel, hasSaved)
        setup(elements.importOptRecentSnapshots, elements.importOptRecentSnapshotsLabel, hasRecent)
        setup(elements.importOptSavedPrograms, elements.importOptSavedProgramsLabel, hasPrograms)

        elements.importOptionsModal.style.display = 'flex'
      } catch {
        showToast('Failed to parse export file')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

export function closeImportOptionsModal() {
  elements.importOptionsModal.style.display = 'none'
  pendingImportPayload = null
}

export function doImport() {
  const payload = pendingImportPayload
  if (!payload) return
  elements.importOptionsModal.style.display = 'none'

  const imported: string[] = []
  const skipped: string[] = []
  importNeedsReload = false

  const applyKeys = (keys: string[], categoryLabel: string) => {
    const applied = keys.filter(k => {
      const sk = `playground-${k}`
      if (sk in payload.data) {
        localStorage.setItem(sk, payload.data[sk]!)
        return true
      }
      return false
    })
    if (applied.length > 0) {
      imported.push(categoryLabel)
      importNeedsReload = true
    }
  }

  if (elements.importOptCode.checked) applyKeys(importCategoryKeys.code, 'Dvala code')
  if (elements.importOptContext.checked) applyKeys(importCategoryKeys.context, 'Context')
  if (elements.importOptSettings.checked) applyKeys(importCategoryKeys.settings, 'Settings')
  if (elements.importOptLayout.checked) applyKeys(importCategoryKeys.layout, 'Layout')

  if (elements.importOptSavedSnapshots.checked && payload.savedSnapshots) {
    const existingIds = new Set(getSavedSnapshots().map(s => s.snapshot.id))
    const toAdd = payload.savedSnapshots.filter(s => !existingIds.has(s.snapshot.id))
    const conflicts = payload.savedSnapshots.length - toAdd.length
    if (toAdd.length > 0) {
      setSavedSnapshots([...getSavedSnapshots(), ...toAdd])
      imported.push(`${toAdd.length} saved snapshot${toAdd.length !== 1 ? 's' : ''}`)
    }
    if (conflicts > 0)
      skipped.push(`${conflicts} saved snapshot${conflicts !== 1 ? 's' : ''} (already exist)`)
  }

  if (elements.importOptRecentSnapshots.checked && payload.recentSnapshots) {
    const existingIds = new Set(getTerminalSnapshots().map(s => s.snapshot.id))
    const toAdd = payload.recentSnapshots.filter(s => !existingIds.has(s.snapshot.id))
    const conflicts = payload.recentSnapshots.length - toAdd.length
    if (toAdd.length > 0) {
      setTerminalSnapshots([...getTerminalSnapshots(), ...toAdd])
      imported.push(`${toAdd.length} recent snapshot${toAdd.length !== 1 ? 's' : ''}`)
    }
    if (conflicts > 0)
      skipped.push(`${conflicts} recent snapshot${conflicts !== 1 ? 's' : ''} (already exist)`)
  }

  if (elements.importOptSavedPrograms.checked && payload.savedPrograms) {
    const existingIds = new Set(getSavedPrograms().map(p => p.id))
    const toAdd = payload.savedPrograms.filter(p => !existingIds.has(p.id))
    const conflicts = payload.savedPrograms.length - toAdd.length
    if (toAdd.length > 0) {
      setSavedPrograms([...getSavedPrograms(), ...toAdd])
      imported.push(`${toAdd.length} saved program${toAdd.length !== 1 ? 's' : ''}`)
    }
    if (conflicts > 0)
      skipped.push(`${conflicts} saved program${conflicts !== 1 ? 's' : ''} (already exist)`)
  }

  populateSnapshotsList()
  populateSavedProgramsList()
  pendingImportPayload = null

  const importedHtml = imported.length > 0
    ? `<p style="margin:0 0 0.5rem 0; color: var(--color-text);">Imported:</p><ul style="margin:0 0 0.75rem 0; padding-left:1.25rem;">${imported.map(s => `<li>${s}</li>`).join('')}</ul>`
    : '<p style="margin:0 0 0.75rem 0;">Nothing was imported.</p>'
  const skippedHtml = skipped.length > 0
    ? `<p style="margin:0 0 0.5rem 0; color: var(--color-text);">Skipped:</p><ul style="margin:0; padding-left:1.25rem;">${skipped.map(s => `<li>${s}</li>`).join('')}</ul>`
    : ''
  const reloadHtml = importNeedsReload
    ? '<p style="margin:0.75rem 0 0 0; color: var(--color-text-faintest);">The page will reload when you close this.</p>'
    : ''

  elements.importResultContent.innerHTML = importedHtml + skippedHtml + reloadHtml
  elements.importResultModal.style.display = 'flex'
}

export function closeImportResultModal() {
  elements.importResultModal.style.display = 'none'
  if (importNeedsReload) {
    importNeedsReload = false
    window.location.reload()
  }
}

// Set by checkpoint effect handler; cleared on resolve. Used by saveCheckpoint / downloadCheckpoint / shareCheckpoint.
let currentCheckpointSnapshot: Snapshot | null = null

const MAX_TERMINAL_SNAPSHOTS = 99
const VISIBLE_TERMINAL_SNAPSHOTS = 3
let showAllTerminalSnapshots = false

function saveTerminalSnapshot(snapshot: Snapshot, resultType: 'completed' | 'error' | 'halted', result?: string): void {
  const entry: TerminalSnapshotEntry = {
    kind: 'terminal',
    snapshot,
    savedAt: Date.now(),
    resultType,
    result,
  }
  const entries = getTerminalSnapshots().filter(e => e.snapshot.id !== snapshot.id)
  entries.unshift(entry) // Add to front (most recent first)
  if (entries.length > MAX_TERMINAL_SNAPSHOTS) {
    entries.length = MAX_TERMINAL_SNAPSHOTS
  }
  setTerminalSnapshots(entries)
  notifySnapshotAdded()
  populateSnapshotsList({ animateNewTerminal: true })
  const toastMessages = { completed: 'Program completed — snapshot captured', error: 'Program failed — snapshot captured', halted: 'Program halted — snapshot captured' }
  showToast(toastMessages[resultType], resultType === 'error' ? { severity: 'error' } : undefined)
}

export async function clearTerminalSnapshot(index: number): Promise<void> {
  await animateCardRemoval('terminal', index)
  const entries = getTerminalSnapshots()
  entries.splice(index, 1)
  setTerminalSnapshots(entries)
  populateSnapshotsList()
}

export function toggleShowAllTerminalSnapshots(): void {
  showAllTerminalSnapshots = !showAllTerminalSnapshots
  const overflow = document.getElementById('terminal-snapshots-overflow')
  if (overflow) {
    overflow.style.display = showAllTerminalSnapshots ? 'contents' : 'none'
    // Update button text
    const btn = overflow.nextElementSibling as HTMLButtonElement | null
    if (btn) {
      const entries = getTerminalSnapshots()
      btn.textContent = showAllTerminalSnapshots ? 'Show less' : `Show all (${entries.length})`
    }
  } else {
    populateSnapshotsList()
  }
}

function promptSnapshotName(onSave: (name: string) => void | Promise<void>) {
  const { panel, body, footer } = createModalPanel()

  const promptEl = document.createElement('div')
  promptEl.className = 'modal-body-row'
  promptEl.textContent = 'Enter a name for this snapshot'
  body.appendChild(promptEl)

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'readline-input'
  input.placeholder = 'My snapshot…'
  input.style.cssText = 'width:100%; box-sizing:border-box;'
  input.setAttribute('aria-label', 'Snapshot name')
  body.appendChild(input)

  const doSave = () => {
    const name = input.value.trim()
    popModal()
    void onSave(name)
  }

  const saveBtn = document.createElement('button')
  saveBtn.className = 'button button--primary'
  saveBtn.textContent = 'Save'
  saveBtn.addEventListener('click', doSave)

  footer.appendChild(saveBtn)

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave()
    else if (e.key === 'Escape') popModal()
  })

  pushPanel(panel, 'Save As')
  setTimeout(() => input.focus(), 260)
}

export function saveCheckpoint() {
  if (!currentCheckpointSnapshot)
    return
  const snapshot = currentCheckpointSnapshot
  promptSnapshotName(name => {
    const existing = getSavedSnapshots().filter(e => e.snapshot.id !== snapshot.id)
    existing.unshift({ kind: 'saved', snapshot, savedAt: Date.now(), locked: false, name: name || undefined })
    setSavedSnapshots(existing)
    notifySnapshotAdded()
    populateSnapshotsList({ animateNewSaved: true })
    showToast(`Checkpoint saved (${existing.length} total)`)
  })
}

export function downloadCheckpoint() {
  if (!currentCheckpointSnapshot)
    return
  void saveFile(JSON.stringify(currentCheckpointSnapshot, null, 2), `checkpoint-${currentCheckpointSnapshot.index}.json`)
}

export function shareCheckpoint() {
  if (!currentCheckpointSnapshot)
    return
  const href = `${location.origin}${location.pathname}?snapshot=${encodeSnapshot(currentCheckpointSnapshot)}`
  if (href.length > MAX_URL_LENGTH) {
    showToast('Checkpoint is too large to share as a URL. Use Download instead.', { severity: 'error' })
    return
  }
  addOutputSeparator()
  appendOutput('Sharable checkpoint link:', 'comment')
  const a = document.createElement('a')
  a.textContent = href
  a.className = 'share-link'
  a.href = href
  addOutputElement(a)
  void navigator.clipboard.writeText(href)
  showToast('Link copied to clipboard')
}

export function shareSnapshot() {
  if (!currentSnapshot)
    return
  const href = `${location.origin}${location.pathname}?snapshot=${encodeSnapshot(currentSnapshot)}`
  if (href.length > MAX_URL_LENGTH) {
    showToast('Snapshot is too large to share as a URL. Use Download instead.', { severity: 'error' })
    return
  }
  addOutputSeparator()
  appendOutput('Sharable snapshot link:', 'comment')
  const a = document.createElement('a')
  a.textContent = href
  a.className = 'share-link'
  a.href = href
  addOutputElement(a)
  void navigator.clipboard.writeText(href)
  showToast('Link copied to clipboard')
}

export function downloadSnapshot() {
  if (!currentSnapshot)
    return
  void saveFile(JSON.stringify(currentSnapshot, null, 2), `snapshot-${currentSnapshot.index}.json`)
  showToast('Snapshot downloaded')
}

export function saveSnapshot() {
  if (!currentSnapshot)
    return
  const snapshot = currentSnapshot
  promptSnapshotName(name => {
    const existing = getSavedSnapshots().filter(e => e.snapshot.id !== snapshot.id)
    existing.unshift({ kind: 'saved', snapshot, savedAt: Date.now(), locked: false, name: name || undefined })
    setSavedSnapshots(existing)
    notifySnapshotAdded()
    populateSnapshotsList({ animateNewSaved: true })
    showToast(`Snapshot saved (${existing.length} total)`)
  })
}

export async function resumeSnapshot() {
  if (!currentSnapshot)
    return
  const snapshot = currentSnapshot
  closeSnapshotModal()
  addOutputSeparator()
  appendOutput(`Resume snapshot ${snapshot.index}:`, 'comment')
  const dvalaParams = getDvalaParamsFromContext()
  const hijacker = hijackConsole()
  try {
    const disableAutoCheckpoint = getState('disable-auto-checkpoint')
    const runResult = snapshot.effectName
      ? await retrigger(snapshot, {
        handlers: dvalaParams.effectHandlers,
        bindings: dvalaParams.bindings as Record<string, Any>,
        modules: allBuiltinModules,
        disableAutoCheckpoint,
        terminalSnapshot: true,
      })
      : await resume(snapshot, null, {
        handlers: dvalaParams.effectHandlers,
        bindings: dvalaParams.bindings as Record<string, Any>,
        modules: allBuiltinModules,
        disableAutoCheckpoint,
        terminalSnapshot: true,
      })
    if (runResult.type === 'error') {
      if (runResult.snapshot) {
        saveTerminalSnapshot(runResult.snapshot, 'error')
      }
      throw runResult.error
    }
    if (runResult.type === 'suspended') {
      appendOutput('Program suspended', 'comment')
      void openSnapshotModal(runResult.snapshot)
      return
    }
    if (runResult.type === 'halted') {
      appendOutput('Program halted', 'comment')
      if (runResult.snapshot) {
        saveTerminalSnapshot(runResult.snapshot, 'halted')
      }
      return
    }
    const content = stringifyValue(runResult.value, false)
    if (runResult.snapshot) {
      saveTerminalSnapshot(runResult.snapshot, 'completed', content)
    }
    appendOutput(content, 'result')
  } catch (error) {
    appendOutput(error, 'error')
  } finally {
    hijacker.releaseConsole()
    focusDvalaCode()
  }
}

function disabledHandlersFallback(ctx: EffectContext): void {
  // Pass through to standard handlers for standard effects
  if (ctx.effectName === 'dvala.checkpoint' ||
      ctx.effectName.startsWith('dvala.error') ||
      ctx.effectName.startsWith('dvala.random') ||
      ctx.effectName.startsWith('dvala.time') ||
      ctx.effectName === 'dvala.sleep' ||
      ctx.effectName.startsWith('dvala.io.')) {
    ctx.next()
    return
  }
  // With playground handlers disabled, unhandled effects should throw
  throw new Error(`Unhandled effect (playground handlers disabled): ${ctx.effectName}`)
}

async function defaultEffectHandler(ctx: EffectContext): Promise<void> {
  const interceptEffects = getState('intercept-effects')

  if (ctx.effectName === 'dvala.checkpoint') {
    // The checkpoint snapshot is already created by dispatchPerform before
    // the effect reaches handlers. We only need to show the panel if
    // intercept-checkpoint is enabled, then continue.
    if (interceptEffects && getState('intercept-checkpoint')) {
      const snapshots = ctx.snapshots
      const snapshot = snapshots[snapshots.length - 1]
      if (snapshot) {
        return new Promise<void>(resolve => {
          registerPendingEffect(makeCheckpointEffect(ctx, snapshot, resolve))
        })
      }
    }
    ctx.next()
    return
  }
  if (ctx.effectName.startsWith('dvala.error')) {
    // When intercept-error is OFF, pass through to standard handler
    if (!(interceptEffects && getState('intercept-error'))) {
      ctx.next()
      return
    }
    return new Promise<void>(resolve => {
      registerPendingEffect(makeUnhandledEffect(ctx, resolve))
    })
  }
  // Pass through to standard handlers for non-interactive standard effects
  if (ctx.effectName.startsWith('dvala.random') || ctx.effectName.startsWith('dvala.time') || ctx.effectName === 'dvala.sleep') {
    ctx.next()
    return
  }
  // Unhandled effects - check intercept-unhandled setting
  if (!interceptEffects || !getState('intercept-unhandled')) {
    throw new Error(`Unhandled effect: ${ctx.effectName}`)
  }
  return new Promise<void>(resolve => {
    registerPendingEffect(makeUnhandledEffect(ctx, resolve))
  })
}

// ---------------------------------------------------------------------------
// Unified effect panel — core functions
// ---------------------------------------------------------------------------

function registerPendingEffect(entry: PendingEffect): void {
  pendingEffects.push(entry)

  entry.ctx.signal.addEventListener('abort', () => {
    const idx = pendingEffects.indexOf(entry)
    if (idx === -1)
      return // already resolved
    entry.ctx.suspend()
    entry.resolve()
    pendingEffects.splice(idx, 1)
    if (currentEffectIndex >= pendingEffects.length)
      currentEffectIndex = Math.max(0, pendingEffects.length - 1)
    if (pendingEffects.length === 0)
      closeEffectPanel()
    else
      renderCurrentEffect()
  }, { once: true })

  if (!effectBatchScheduled) {
    effectBatchScheduled = true
    void Promise.resolve().then(openEffectPanel)
  }
}

function openEffectPanel(): void {
  effectBatchScheduled = false
  currentEffectIndex = 0

  // Discard any stale snapshot panels so the effect panel always opens as root
  if (modalStack.length > 0) {
    elements.snapshotPanelContainer.innerHTML = ''
    elements.snapshotPanelContainer.style.maxWidth = ''
    modalStack.length = 0
    currentSnapshot = null
    resolveSnapshotModal?.()
    resolveSnapshotModal = null
  }

  const { panel, body, footer } = createModalPanel({ noClose: true })
  effectPanelBodyEl = body
  effectPanelFooterEl = footer

  // Inject nav into header (reuses existing CSS classes)
  const header = panel.firstElementChild as HTMLElement
  const navEl = document.createElement('div')
  navEl.className = 'effect-modal__nav'
  navEl.style.display = 'none'
  const prevBtn = document.createElement('button')
  prevBtn.className = 'button'
  prevBtn.textContent = '‹'
  prevBtn.addEventListener('click', () => navigateEffect(-1))
  const counterEl = document.createElement('span')
  counterEl.className = 'effect-modal__counter'
  const nextBtn = document.createElement('button')
  nextBtn.className = 'button'
  nextBtn.textContent = '›'
  nextBtn.addEventListener('click', () => navigateEffect(1))
  navEl.appendChild(prevBtn)
  navEl.appendChild(counterEl)
  navEl.appendChild(nextBtn)
  header.appendChild(navEl)
  effectNavEl = navEl
  effectNavCounterEl = counterEl

  renderCurrentEffect()
  const firstTitle = pendingEffects[0]?.title ?? 'Effect'
  pushPanel(panel, firstTitle, undefined, true)
  showExecutionControlBar()
}

function closeEffectPanel(): void {
  effectPanelBodyEl = null
  effectPanelFooterEl = null
  effectNavEl = null
  effectNavCounterEl = null
  pendingEffects = []
  currentEffectIndex = 0
  closeAllModals()
  focusDvalaCode()
}

function renderCurrentEffect(): void {
  const entry = pendingEffects[currentEffectIndex]
  if (!entry || !effectPanelBodyEl || !effectPanelFooterEl)
    return

  // Update breadcrumb label in modalStack to match current effect's title
  const stackEntry = modalStack[modalStack.length - 1]
  if (stackEntry)
    stackEntry.label = entry.title

  // Nav
  const total = pendingEffects.length
  if (effectNavEl) {
    effectNavEl.style.display = total > 1 ? 'flex' : 'none'
    if (effectNavCounterEl)
      effectNavCounterEl.textContent = `${currentEffectIndex + 1} / ${total}`
    const prev = effectNavEl.firstElementChild as HTMLElement
    const next = effectNavEl.lastElementChild as HTMLElement
    prev.style.opacity = currentEffectIndex > 0 ? '1' : '0.3'
    prev.style.pointerEvents = currentEffectIndex > 0 ? 'auto' : 'none'
    next.style.opacity = currentEffectIndex < total - 1 ? '1' : '0.3'
    next.style.pointerEvents = currentEffectIndex < total - 1 ? 'auto' : 'none'
  }

  effectPanelBodyEl.innerHTML = ''
  effectPanelFooterEl.innerHTML = ''
  entry.renderBody(effectPanelBodyEl)
  entry.renderFooter(effectPanelFooterEl)
  effectPanelFooterEl.style.display = effectPanelFooterEl.childElementCount > 0 ? '' : 'none'
}

export function navigateEffect(delta: number): void {
  const next = currentEffectIndex + delta
  if (next < 0 || next >= pendingEffects.length)
    return
  currentEffectIndex = next
  renderCurrentEffect()
}

function resolveCurrentEffect(): void {
  const entry = pendingEffects[currentEffectIndex]
  if (!entry)
    return
  pendingEffects.splice(currentEffectIndex, 1)
  if (currentEffectIndex >= pendingEffects.length)
    currentEffectIndex = Math.max(0, pendingEffects.length - 1)
  if (pendingEffects.length === 0)
    closeEffectPanel()
  else
    renderCurrentEffect()
}

// ---------------------------------------------------------------------------
// Effect handler factories
// ---------------------------------------------------------------------------

function makeCheckpointEffect(ctx: EffectContext, snapshot: Snapshot, resolve: () => void): PendingEffect {
  currentCheckpointSnapshot = snapshot

  const submit = () => {
    currentCheckpointSnapshot = null
    ctx.next()
    resolve()
    resolveCurrentEffect()
    focusDvalaCode()
  }

  return {
    ctx,
    title: 'Checkpoint',
    renderBody(el) {
      const msgField = document.createElement('div')
      msgField.className = 'effect-modal__field'
      const msgLabel = document.createElement('span')
      msgLabel.className = 'effect-modal__field-label'
      msgLabel.textContent = 'Message'
      const msgText = document.createElement('div')
      msgText.style.cssText = 'font-size: 0.875rem; color: var(--color-text);'
      msgText.textContent = snapshot.message || '(no message)'
      msgField.appendChild(msgLabel)
      msgField.appendChild(msgText)
      el.appendChild(msgField)

      if (snapshot.meta !== undefined && snapshot.meta !== null) {
        const metaField = document.createElement('div')
        metaField.className = 'effect-modal__field'
        const metaLabel = document.createElement('span')
        metaLabel.className = 'effect-modal__field-label'
        metaLabel.textContent = 'Metadata'
        const metaCode = document.createElement('code')
        metaCode.style.cssText = 'white-space:pre; font-size:0.75rem; color: var(--color-text);'
        metaCode.textContent = JSON.stringify(snapshot.meta, null, 2)
        metaField.appendChild(metaLabel)
        metaField.appendChild(metaCode)
        el.appendChild(metaField)
      }
    },
    renderFooter(el) {
      const btn = document.createElement('button')
      btn.className = 'button button--primary'
      btn.textContent = 'Resume'
      btn.addEventListener('click', submit)
      el.appendChild(btn)
    },
    onKeyDown(evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault()
        submit()
        return true
      }
      return false
    },
    resolve,
  }
}

function makeUnhandledEffect(ctx: EffectContext, resolve: () => void): PendingEffect {
  let inputMode: 'resume' | 'fail' | null = null
  let inputEl: HTMLTextAreaElement | null = null
  let errorEl: HTMLSpanElement | null = null

  const rerenderFooter = () => {
    if (!effectPanelFooterEl)
      return
    effectPanelFooterEl.innerHTML = ''
    entry.renderFooter(effectPanelFooterEl)
    if (inputMode !== null)
      void Promise.resolve().then(() => inputEl?.focus())
  }

  const ignore = () => {
    ctx.next()
    resolve()
    resolveCurrentEffect()
  }

  const enterInputMode = (mode: 'resume' | 'fail') => {
    inputMode = mode
    rerenderFooter()
  }

  const cancelInput = () => {
    inputMode = null
    inputEl = null
    errorEl = null
    rerenderFooter()
  }

  const confirmInput = () => {
    const raw = inputEl?.value.trim() ?? ''
    if (inputMode === 'resume') {
      try {
        const value = raw === '' ? null : JSON.parse(raw) as Any
        ctx.resume(value)
        resolve()
        resolveCurrentEffect()
      } catch {
        if (errorEl) {
          errorEl.textContent = 'Invalid JSON'
          errorEl.style.display = 'block'
        }
        inputEl?.focus()
      }
    } else if (inputMode === 'fail') {
      ctx.fail(raw || undefined)
      resolve()
      resolveCurrentEffect()
    }
  }

  // eslint-disable-next-line prefer-const
  let entry: PendingEffect = {
    ctx,
    title: ctx.effectName,
    renderBody(el) {
      const nameField = document.createElement('div')
      nameField.className = 'effect-modal__field'
      const nameLabel = document.createElement('span')
      nameLabel.className = 'effect-modal__field-label'
      nameLabel.textContent = 'Effect name'
      const nameCode = document.createElement('code')
      nameCode.className = 'effect-modal__name'
      nameCode.textContent = ctx.effectName
      nameField.appendChild(nameLabel)
      nameField.appendChild(nameCode)
      el.appendChild(nameField)

      const argsField = document.createElement('div')
      argsField.className = 'effect-modal__field'
      const argsLabel = document.createElement('span')
      argsLabel.className = 'effect-modal__field-label'
      argsLabel.textContent = 'Arguments'
      argsField.appendChild(argsLabel)
      const argsContainer = document.createElement('div')
      if (ctx.arg === undefined) {
        const empty = document.createElement('span')
        empty.textContent = '(no arguments)'
        empty.style.cssText = 'font-size:0.75rem; color: var(--color-text-faintest); font-style: italic;'
        argsContainer.appendChild(empty)
      } else {
        argsContainer.appendChild(makeArgRow(JSON.stringify(ctx.arg), 0, JSON.stringify(ctx.arg, null, 2)))
      }
      argsField.appendChild(argsContainer)
      el.appendChild(argsField)
    },
    renderFooter(el) {
      if (inputMode === null) {
        el.style.flexDirection = ''
        el.style.alignItems = ''
        const ignoreBtn = document.createElement('button')
        ignoreBtn.className = 'button'
        ignoreBtn.textContent = 'Ignore'
        ignoreBtn.addEventListener('click', ignore)
        const mockBtn = document.createElement('button')
        mockBtn.className = 'button button--primary'
        mockBtn.textContent = 'Mock response…'
        mockBtn.addEventListener('click', () => enterInputMode('resume'))
        el.appendChild(ignoreBtn)
        el.appendChild(mockBtn)
      } else {
        el.style.flexDirection = 'column'
        el.style.alignItems = 'stretch'

        const labels = { resume: 'Mock response (JSON)', fail: 'Error message (optional)' }
        const label = document.createElement('label')
        label.className = 'effect-modal__input-label'
        label.textContent = labels[inputMode]

        inputEl = document.createElement('textarea')
        inputEl.rows = 4
        inputEl.className = 'effect-modal__textarea'
        inputEl.placeholder = inputMode === 'resume' ? 'Empty = null. Examples: 42, "hello", {"key": "value"}' : ''
        inputEl.addEventListener('keydown', e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            confirmInput()
          }
        })

        errorEl = document.createElement('span')
        errorEl.className = 'form-error'
        errorEl.style.display = 'none'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'button'
        cancelBtn.textContent = 'Cancel'
        cancelBtn.addEventListener('click', cancelInput)

        const confirmBtn = document.createElement('button')
        confirmBtn.className = 'button button--primary'
        confirmBtn.textContent = 'Confirm'
        confirmBtn.addEventListener('click', confirmInput)

        const btnRow = document.createElement('div')
        btnRow.className = 'modal-btn-row'
        btnRow.style.marginTop = 'var(--space-2)'
        btnRow.style.alignSelf = 'flex-end'
        btnRow.appendChild(cancelBtn)
        btnRow.appendChild(confirmBtn)

        el.appendChild(label)
        el.appendChild(inputEl)
        el.appendChild(errorEl)
        el.appendChild(btnRow)
      }
    },
    onKeyDown(evt) {
      if (inputMode === null && evt.key === 'Enter') {
        evt.preventDefault()
        enterInputMode('resume')
        return true
      }
      if (inputMode !== null && evt.key === 'Escape') {
        evt.preventDefault()
        cancelInput()
        return true
      }
      return false
    },
    resolve,
  }

  return entry
}

function readlineHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    let inputEl: HTMLTextAreaElement | null = null
    const prompt = typeof ctx.arg === 'string' ? ctx.arg : ''

    const submit = () => {
      ctx.resume(inputEl?.value ?? null)
      resolve()
      resolveCurrentEffect()
      focusDvalaCode()
    }

    registerPendingEffect({
      ctx,
      title: 'Input',
      renderBody(el) {
        if (prompt) {
          const p = document.createElement('div')
          p.className = 'modal-body-row'
          p.textContent = prompt
          el.appendChild(p)
        }
        const textarea = document.createElement('textarea')
        textarea.rows = 3
        textarea.className = 'readline-input'
        textarea.setAttribute('aria-label', prompt || 'Enter input')
        el.appendChild(textarea)
        inputEl = textarea
        void Promise.resolve().then(() => textarea.focus())
      },
      renderFooter(el) {
        const btn = document.createElement('button')
        btn.className = 'button button--primary'
        btn.textContent = 'Submit'
        btn.addEventListener('click', submit)
        el.appendChild(btn)
      },
      onKeyDown(evt) {
        if (evt.key === 'Enter' && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
          evt.preventDefault()
          evt.stopPropagation()
          submit()
          return true
        }
        return false
      },
      resolve,
    })
  })
}

function printlnHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const value = ctx.arg
    const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)

    const submit = () => {
      ctx.resume(value)
      resolve()
      resolveCurrentEffect()
      focusDvalaCode()
    }

    registerPendingEffect({
      ctx,
      title: 'Output',
      renderBody(el) {
        const outputWrap = document.createElement('div')
        outputWrap.className = 'println-output'
        const pre = document.createElement('pre')
        pre.className = 'println-content'
        pre.textContent = text
        outputWrap.appendChild(pre)
        const copyBtn = document.createElement('span')
        copyBtn.className = 'println-copy-btn'
        copyBtn.innerHTML = copyIcon
        copyBtn.addEventListener('click', () => { void navigator.clipboard.writeText(text) })
        outputWrap.appendChild(copyBtn)
        el.appendChild(outputWrap)
      },
      renderFooter(el) {
        const btn = document.createElement('button')
        btn.className = 'button button--primary'
        btn.textContent = 'OK'
        btn.addEventListener('click', submit)
        el.appendChild(btn)
      },
      onKeyDown(evt) {
        if (evt.key === 'Enter' || evt.key === 'Escape') {
          evt.preventDefault()
          submit()
          return true
        }
        return false
      },
      resolve,
    })
  })
}

function ioPickHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const argObj = ctx.arg as { items: string[]; options?: { prompt?: string; default?: number } }
    const items = argObj.items
    const options = argObj.options
    const promptText = options?.prompt ?? 'Choose an item:'
    const defaultIndex = options?.default ?? null
    let focusedIndex: number | null = defaultIndex
    let rowEls: HTMLElement[] = []

    const setFocus = (index: number | null) => {
      focusedIndex = index
      rowEls.forEach((row, i) => {
        row.style.background = i === index ? 'var(--color-surface-hover)' : ''
      })
      if (index !== null)
        rowEls[index]?.scrollIntoView({ block: 'nearest' })
    }

    const submit = (index: number | null) => {
      ctx.resume(index as Any)
      resolve()
      resolveCurrentEffect()
      focusDvalaCode()
    }

    registerPendingEffect({
      ctx,
      title: promptText,
      renderBody(el) {
        rowEls = []
        items.forEach((item, i) => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex; align-items:center; padding:0.4rem 0.5rem; cursor:pointer; border-radius:3px;'
          row.onmouseenter = () => { if (focusedIndex !== i) row.style.background = 'var(--color-surface-hover)' }
          row.onmouseleave = () => { row.style.background = i === focusedIndex ? 'var(--color-surface-hover)' : '' }
          const labelSpan = document.createElement('span')
          labelSpan.style.cssText = 'font-size:0.875rem; font-family:sans-serif;'
          labelSpan.textContent = item
          row.appendChild(labelSpan)
          row.onclick = () => submit(i)
          el.appendChild(row)
          rowEls.push(row)
        })
        setFocus(focusedIndex)
      },
      renderFooter(_el) { /* no footer buttons — items are clickable */ },
      onKeyDown(evt) {
        if (evt.key === 'ArrowDown') {
          evt.preventDefault()
          setFocus(focusedIndex === null ? 0 : Math.min(focusedIndex + 1, items.length - 1))
          return true
        }
        if (evt.key === 'ArrowUp') {
          evt.preventDefault()
          setFocus(focusedIndex === null ? items.length - 1 : Math.max(focusedIndex - 1, 0))
          return true
        }
        if (evt.key === 'Enter') {
          evt.preventDefault()
          if (focusedIndex !== null)
            submit(focusedIndex)
          else
            showToast('Use arrow keys to select', { severity: 'error' })
          return true
        }
        return false
      },
      resolve,
    })
  })
}

function ioConfirmHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const argObj = ctx.arg as string | { question: string; options?: { default?: boolean } }
    const question = typeof argObj === 'string' ? argObj : argObj.question
    const options = typeof argObj === 'string' ? undefined : argObj.options
    const defaultValue = options?.default
    const defaultIndex = defaultValue === true ? 0 : defaultValue === false ? 1 : null
    let focusedIndex: number | null = defaultIndex
    let rowEls: HTMLElement[] = []
    const choiceItems = [{ label: 'Yes', value: true }, { label: 'No', value: false }]

    const setFocus = (index: number | null) => {
      focusedIndex = index
      rowEls.forEach((row, i) => {
        row.style.background = i === index ? 'var(--color-surface-hover)' : ''
      })
    }

    const submit = (value: boolean) => {
      ctx.resume(value as Any)
      resolve()
      resolveCurrentEffect()
      focusDvalaCode()
    }

    registerPendingEffect({
      ctx,
      title: question,
      renderBody(el) {
        rowEls = []
        choiceItems.forEach((item, i) => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0.5rem; cursor:pointer; border-radius:3px;'
          row.onmouseenter = () => { if (focusedIndex !== i) row.style.background = 'var(--color-surface-hover)' }
          row.onmouseleave = () => { row.style.background = i === focusedIndex ? 'var(--color-surface-hover)' : '' }
          const labelSpan = document.createElement('span')
          labelSpan.style.cssText = 'font-size:0.875rem; font-family:sans-serif;'
          labelSpan.textContent = item.label
          row.appendChild(labelSpan)
          row.onclick = () => submit(item.value)
          el.appendChild(row)
          rowEls.push(row)
        })
        setFocus(focusedIndex)
      },
      renderFooter(_el) { /* no footer buttons */ },
      onKeyDown(evt) {
        if (evt.key === 'ArrowDown') {
          evt.preventDefault()
          setFocus(focusedIndex === null ? 0 : Math.min(focusedIndex + 1, 1))
          return true
        }
        if (evt.key === 'ArrowUp') {
          evt.preventDefault()
          setFocus(focusedIndex === null ? 1 : Math.max(focusedIndex - 1, 0))
          return true
        }
        if (evt.key === 'Enter') {
          evt.preventDefault()
          if (focusedIndex !== null)
            submit(choiceItems[focusedIndex]!.value)
          else
            showToast('Use arrow keys to select', { severity: 'error' })
          return true
        }
        return false
      },
      resolve,
    })
  })
}

const effectHandlerMenuIds = ['io-pick-more-menu', 'io-confirm-more-menu', 'readline-more-menu', 'println-more-menu']

export function closeEffectHandlerMenus() {
  effectHandlerMenuIds.forEach(id => {
    const el = document.getElementById(id)
    if (el)
      el.style.display = 'none'
  })
}

export function toggleEffectHandlerMenu(id: string) {
  const menu = document.getElementById(id)
  if (!menu)
    return
  const wasHidden = menu.style.display !== 'flex'
  closeEffectHandlerMenus()
  if (wasHidden)
    menu.style.display = 'flex'
}

export function suspendCurrentEffectHandler() {
  closeEffectHandlerMenus()
  for (const entry of [...pendingEffects]) {
    entry.ctx.suspend()
    entry.resolve()
  }
  pendingEffects = []
  currentEffectIndex = 0
  closeEffectPanel()
}

export function haltCurrentEffectHandler() {
  closeEffectHandlerMenus()
  for (const entry of [...pendingEffects]) {
    entry.ctx.halt()
    entry.resolve()
  }
  pendingEffects = []
  currentEffectIndex = 0
  closeEffectPanel()
}

export function showExecutionControlBar() {
  elements.executionControlBar.style.display = 'flex'
  elements.executionStatus.textContent = 'Running'
  elements.executionStatus.className = 'execution-status execution-status--running'
  elements.execPlayBtn.style.display = 'none'
  elements.execPauseBtn.style.display = 'flex'
  elements.execStopBtn.style.display = 'flex'
}

export function showExecutionControlBarPaused() {
  elements.executionControlBar.style.display = 'flex'
  // Show "Paused" for root snapshot, "Paused #N" when navigating to checkpoints
  const label = modalStack.length > 1 && currentSnapshot ? `Paused #${currentSnapshot.index}` : 'Paused'
  elements.executionStatus.textContent = label
  elements.executionStatus.className = 'execution-status execution-status--paused'
  elements.execPlayBtn.style.display = 'flex'
  elements.execPlayBtn.disabled = false
  elements.execPlayBtn.style.opacity = ''
  elements.execPauseBtn.style.display = 'none'
  elements.execStopBtn.style.display = 'flex'
}

export function showExecutionControlBarTerminal() {
  elements.executionControlBar.style.display = 'flex'
  elements.executionStatus.textContent = 'Completed'
  elements.executionStatus.className = 'execution-status execution-status--terminal'
  elements.execPlayBtn.style.display = 'flex'
  elements.execPlayBtn.disabled = true
  elements.execPlayBtn.style.opacity = '0.3'
  elements.execPauseBtn.style.display = 'none'
  elements.execStopBtn.style.display = 'flex'
}

/** Update control bar based on current snapshot state */
export function updateExecutionControlBarForSnapshot() {
  if (currentSnapshot?.terminal === true) {
    showExecutionControlBarTerminal()
  } else {
    showExecutionControlBarPaused()
  }
}

export function hideExecutionControlBar() {
  elements.executionControlBar.style.display = 'none'
}

function initExecutionControlBar() {
  elements.execPlayBtn.addEventListener('click', () => {
    hideExecutionControlBar()
    void resumeSnapshot()
  })
  elements.execPauseBtn.addEventListener('click', () => {
    suspendCurrentEffectHandler()
    hideExecutionControlBar()
  })
  elements.execStopBtn.addEventListener('click', () => {
    // In running mode, halt the current effect
    // In paused mode, just close the modal (abandon the suspended execution)
    if (pendingEffects.length > 0) {
      haltCurrentEffectHandler()
    } else {
      closeSnapshotModal()
      hideExecutionControlBar()
    }
  })
}

// ---------------------------------------------------------------------------
// Synchronous effect handlers (used in sync mode)
// ---------------------------------------------------------------------------

function syncIoPickHandler(ctx: EffectContext): void {
  const argObj = ctx.arg as { items: string[]; options?: { prompt?: string; default?: number } }
  const items = argObj.items
  const options = argObj.options
  const header = options?.prompt ?? 'Choose an item:'
  const defaultIndex = options?.default
  const defaultHint = defaultIndex !== undefined ? ` [default: ${defaultIndex}]` : ''
  const listLines = items.map((item, i) => `${i}: ${item}`).join('\n')
  const result = window.prompt(`${header}${defaultHint}\n${listLines}`)
  if (result === null) {
    ctx.resume(null as Any)
    return
  }
  const trimmed = result.trim()
  if (trimmed === '') {
    ctx.resume((defaultIndex !== undefined ? defaultIndex : null) as Any)
    return
  }
  const parsed = Number(trimmed)
  ctx.resume(parsed as Any)
}

function syncIoConfirmHandler(ctx: EffectContext): void {
  const question = typeof ctx.arg === 'string' ? ctx.arg : ''
  ctx.resume(window.confirm(question) as Any)
}

function syncReadlineHandler(ctx: EffectContext): void {
  const promptText = typeof ctx.arg === 'string' ? ctx.arg : ''
  const value = window.prompt(promptText)
  ctx.resume(value)
}

function syncPrintlnHandler(ctx: EffectContext): void {
  const value = ctx.arg
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  window.alert(text)
  ctx.resume(value)
}

function syncDefaultEffectHandler(ctx: EffectContext): void {
  if (ctx.effectName === 'dvala.checkpoint') {
    ctx.next()
    return
  }
  // Pass through to standard handlers for non-interactive standard effects
  if (ctx.effectName.startsWith('dvala.random') || ctx.effectName.startsWith('dvala.time') || ctx.effectName === 'dvala.sleep') {
    ctx.next()
    return
  }
  throw new Error(`Unhandled effect: ${ctx.effectName}`)
}

function syncDisabledHandlersFallback(ctx: EffectContext): void {
  // Pass through to standard handlers for standard effects
  if (ctx.effectName === 'dvala.checkpoint' ||
      ctx.effectName.startsWith('dvala.error') ||
      ctx.effectName.startsWith('dvala.random') ||
      ctx.effectName.startsWith('dvala.time') ||
      ctx.effectName === 'dvala.sleep' ||
      ctx.effectName.startsWith('dvala.io.')) {
    ctx.next()
    return
  }
  throw new Error(`Unhandled effect (playground handlers disabled): ${ctx.effectName}`)
}

function getSyncEffectHandlers(): HandlerRegistration[] {
  if (getState('disable-standard-handlers')) {
    return [
      ...(!getState('disable-playground-effects') ? getPlaygroundEffectHandlers() : []),
      { pattern: '*', handler: syncDisabledHandlersFallback },
    ]
  }
  return [
    { pattern: 'dvala.io.pick', handler: syncIoPickHandler },
    { pattern: 'dvala.io.confirm', handler: syncIoConfirmHandler },
    { pattern: 'dvala.io.read', handler: syncReadlineHandler },
    { pattern: 'dvala.io.print', handler: syncPrintlnHandler },
    ...(!getState('disable-playground-effects') ? getPlaygroundEffectHandlers() : []),
    { pattern: '*', handler: syncDefaultEffectHandler },
  ]
}

function getDvalaParamsFromContext(): { bindings: Record<string, unknown>; effectHandlers: HandlerRegistration[] } {
  const contextString = getState('context')
  try {
    const parsedContext
      = contextString.trim().length > 0
        ? JSON.parse(contextString) as UnknownRecord
        : {}

    const parsedHandlers = (parsedContext.effectHandlers ?? []) as { pattern: string; handler: unknown }[]
    const bindings = asUnknownRecord(parsedContext.bindings ?? {})

    const effectHandlers: HandlerRegistration[] = parsedHandlers.map(({ pattern, handler: value }) => {
      if (typeof value !== 'string') {
        console.log(pattern, value)
        throw new TypeError(`Invalid handler value. "${pattern}" should be a javascript function string`)
      }

      const fn = eval(value) as EffectHandler

      if (typeof fn !== 'function') {
        throw new TypeError(`Invalid handler value. "${pattern}" should be a javascript function`)
      }

      return { pattern, handler: fn }
    })

    const hasPattern = (p: string) => effectHandlers.some(h => h.pattern === p)

    // With standard handlers disabled, only use context-defined handlers and a basic fallback
    if (getState('disable-standard-handlers')) {
      // Still add playground effects unless separately disabled
      if (!getState('disable-playground-effects')) {
        for (const reg of getPlaygroundEffectHandlers()) {
          if (!hasPattern(reg.pattern))
            effectHandlers.push(reg)
        }
      }
      if (!hasPattern('*'))
        effectHandlers.push({ pattern: '*', handler: disabledHandlersFallback })
      return {
        bindings,
        effectHandlers,
      }
    }

    if (!hasPattern('dvala.io.pick'))
      effectHandlers.push({ pattern: 'dvala.io.pick', handler: ioPickHandler })
    if (!hasPattern('dvala.io.confirm'))
      effectHandlers.push({ pattern: 'dvala.io.confirm', handler: ioConfirmHandler })
    if (!hasPattern('dvala.io.read'))
      effectHandlers.push({ pattern: 'dvala.io.read', handler: readlineHandler })
    if (!hasPattern('dvala.io.print'))
      effectHandlers.push({ pattern: 'dvala.io.print', handler: printlnHandler })

    // Playground effects (playground.*)
    if (!getState('disable-playground-effects')) {
      for (const reg of getPlaygroundEffectHandlers()) {
        if (!hasPattern(reg.pattern))
          effectHandlers.push(reg)
      }
    }

    if (!hasPattern('*'))
      effectHandlers.push({ pattern: '*', handler: defaultEffectHandler })

    return {
      bindings,
      effectHandlers,
    }
  } catch (err) {
    appendOutput(`Error: ${(err as Error).message}\nCould not parse context:\n${contextString}`, 'error')
    const fallback = getState('disable-standard-handlers') ? disabledHandlersFallback : defaultEffectHandler
    return { bindings: {}, effectHandlers: [{ pattern: '*', handler: fallback }] }
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
    syntaxOverlay.scrollContainer.scrollTop = getState('dvala-code-scroll-top')
    elements.outputResult.scrollTop = getState('output-scroll-top')
  }, 0)
}

function updateCSS() {
  const debug = getState('debug')
  elements.dvalaPanelDebugInfo.classList.toggle('active', debug)

  const debugToggle = document.getElementById('settings-debug-toggle') as HTMLInputElement | null
  if (debugToggle)
    debugToggle.checked = debug
  const pureToggle = document.getElementById('settings-pure-toggle') as HTMLInputElement | null
  if (pureToggle)
    pureToggle.checked = getState('pure')
  const pure = getState('pure')
  const disableHandlers = getState('disable-standard-handlers')
  const disabled = pure
  const interceptDisabled = disabled || disableHandlers
  const interceptEffects = getState('intercept-effects')

  // Main intercept effects toggle
  const interceptEffectsToggle = document.getElementById('settings-intercept-effects-toggle') as HTMLInputElement | null
  if (interceptEffectsToggle) {
    interceptEffectsToggle.checked = !interceptDisabled && interceptEffects
    interceptEffectsToggle.disabled = interceptDisabled
    interceptEffectsToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', interceptDisabled)
    interceptEffectsToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', interceptDisabled)
  }

  // Sub-toggles container visibility
  const subToggles = document.getElementById('settings-intercept-sub-toggles')
  if (subToggles) {
    subToggles.style.display = interceptEffects && !interceptDisabled ? 'block' : 'none'
  }

  // Sub-toggles
  const interceptErrorToggle = document.getElementById('settings-intercept-error-toggle') as HTMLInputElement | null
  if (interceptErrorToggle) {
    interceptErrorToggle.checked = getState('intercept-error')
  }
  const checkpointToggle = document.getElementById('settings-checkpoint-toggle') as HTMLInputElement | null
  if (checkpointToggle) {
    checkpointToggle.checked = getState('intercept-checkpoint')
  }
  const interceptUnhandledToggle = document.getElementById('settings-intercept-unhandled-toggle') as HTMLInputElement | null
  if (interceptUnhandledToggle) {
    interceptUnhandledToggle.checked = getState('intercept-unhandled')
  }

  const disableHandlersToggle = document.getElementById('settings-disable-handlers-toggle') as HTMLInputElement | null
  if (disableHandlersToggle) {
    disableHandlersToggle.checked = !disabled && disableHandlers
    disableHandlersToggle.disabled = disabled
    disableHandlersToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', disabled)
    disableHandlersToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', disabled)
  }
  const disablePlaygroundEffectsToggle = document.getElementById('settings-disable-playground-effects-toggle') as HTMLInputElement | null
  if (disablePlaygroundEffectsToggle) {
    disablePlaygroundEffectsToggle.checked = getState('disable-playground-effects')
  }
  const autoCheckpointToggle = document.getElementById('settings-auto-checkpoint-toggle') as HTMLInputElement | null
  if (autoCheckpointToggle) {
    // Checkbox is "Disable auto checkpoint" so checked = disabled
    autoCheckpointToggle.checked = !disabled && getState('disable-auto-checkpoint')
    autoCheckpointToggle.disabled = disabled
    autoCheckpointToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', disabled)
    autoCheckpointToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', disabled)
  }

  const playgroundDevToggle = document.getElementById('settings-playground-developer-toggle') as HTMLInputElement | null
  if (playgroundDevToggle)
    playgroundDevToggle.checked = getState('playground-developer')
  const devTabBtn = document.getElementById('settings-tab-btn-developer')
  if (devTabBtn)
    devTabBtn.style.display = getState('playground-developer') ? '' : 'none'

  elements.dvalaCodeTitle.style.color = (getState('focused-panel') === 'dvala-code') ? 'white' : ''
  const currentProgramId = getState('current-program-id')
  const currentProgram = currentProgramId ? getSavedPrograms().find(p => p.id === currentProgramId) : null
  const isLocked = currentProgram?.locked ?? false
  elements.dvalaCodeTitleString.textContent = currentProgram ? currentProgram.name : 'Untitled Program'
  elements.dvalaTextArea.readOnly = isLocked
  elements.dvalaTextArea.classList.toggle('panel-textarea--locked', isLocked)
  elements.dvalaCodeLockedIndicator.style.display = isLocked ? 'inline-flex' : 'none'
  if (isLocked) {
    elements.dvalaCodeUndoButton.classList.add('disabled')
    elements.dvalaCodeRedoButton.classList.add('disabled')
  }
  const showIndicator = !isLocked && (autoSaveTimer !== null || (currentProgramId === null && getState('dvala-code-edited') && getState('dvala-code').trim().length > 0))
  elements.dvalaCodePendingIndicator.style.display = showIndicator ? 'inline-block' : 'none'
  elements.contextTitle.style.color = (getState('focused-panel') === 'context') ? 'white' : ''

}

export function showPage(id: string, scroll: 'smooth' | 'instant' | 'none', historyEvent: 'replace' | 'push' | 'none' = 'push', tab?: string) {
  setTimeout(() => {
    inactivateAll()

    closeSearch()
    const page = document.getElementById(id)
    const linkElementId = `${(!id || id === 'index') ? 'home-page' : id}_link`
    const link = document.getElementById(linkElementId)

    elements.mainPanel.scrollTo({ top: 0 })

    if (!page) {
      showPage('index', scroll, 'replace')
      return
    }

    page.classList.add('active-content')
    if (id === 'settings-page') {
      tab = tab || 'dvala'
      showSettingsTab(tab)
    }
    if (id === 'saved-programs-page') {
      populateSavedProgramsList()
      const indicator = document.getElementById('programs-nav-indicator')
      if (indicator) indicator.style.display = 'none'
      const navLink = document.getElementById('saved-programs-page_link')
      if (navLink) navLink.style.color = ''
    }
    if (id === 'snapshots-page') {
      populateSnapshotsList()
      const indicator = document.getElementById('snapshots-nav-indicator')
      if (indicator) indicator.style.display = 'none'
      const navLink = document.getElementById('snapshots-page_link')
      if (navLink) navLink.style.color = ''
    }
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

      // If the link is inside a collapsed standard effect group, expand it first
      const seContent = link.closest('[id^="se-content-"]')
      if (seContent && seContent instanceof HTMLElement && !seContent.classList.contains('expanded')) {
        const groupKey = seContent.id.replace('se-content-', '')
        toggleStandardEffectGroup(groupKey, false)
        // Also expand the parent 'effects' API section if collapsed
        const seParent = document.getElementById('api-content-effects')
        if (seParent && !seParent.classList.contains('expanded')) {
          toggleApiSection('effects', false)
        }
      }

      // If the link is inside a collapsed playground effect group, expand it first
      const peContent = link.closest('[id^="pe-content-"]')
      if (peContent && peContent instanceof HTMLElement && !peContent.classList.contains('expanded')) {
        const groupKey = peContent.id.replace('pe-content-', '')
        togglePlaygroundEffectGroup(groupKey, false)
        // Also expand the parent 'playground-effects' API section if collapsed
        const peParent = document.getElementById('api-content-playground-effects')
        if (peParent && !peParent.classList.contains('expanded')) {
          toggleApiSection('playground-effects', false)
        }
      }

      if (scroll !== 'none')
        link.scrollIntoView({ block: 'center', behavior: scroll })
    }

    if (historyEvent === 'replace')
      router.navigate(pageIdToAppPath(id), true)
    else if (historyEvent === 'push')
      router.navigate(pageIdToAppPath(id))
    // historyEvent === 'none': don't update URL
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
  setDvalaCode(`// ${name}\n\n${example}\n`, true, 'top', () => {
    showToast('Example loaded in editor')
    saveState({ 'focused-panel': 'dvala-code' })
    applyState()
  })
}

export function copyExample(encodedExample: string) {
  const code = decodeURIComponent(atob(encodedExample))
  void navigator.clipboard.writeText(code)
  showToast('Example copied to clipboard')
}

export function copyCode(encodedCode: string) {
  const code = decodeURIComponent(atob(encodedCode))
  void navigator.clipboard.writeText(code)
  showToast('Code copied to clipboard')
}

export function loadEncodedCode(encodedCode: string) {
  const code = decodeURIComponent(atob(encodedCode))
  setDvalaCode(code, true, 'top', () => {
    showToast('Code loaded in editor')
    saveState({ 'focused-panel': 'dvala-code' })
    applyState()
  })
}

export function setPlayground(name: string, encodedExample: string) {
  const example = JSON.parse(decodeURIComponent(atob(encodedExample))) as Example
  guardCodeReplacement(() => {
    saveState({ 'current-program-id': null, 'dvala-code-edited': false })

    const context = example.context
      ? formatContextJson(example.context as Record<string, unknown>)
      : ''

    setContext(context, true, 'top')

    const code = example.code ? example.code : ''
    const size = Math.max(name.length + 10, 40)
    const paddingLeft = Math.floor((size - name.length) / 2)
    const paddingRight = Math.ceil((size - name.length) / 2)
    setDvalaCode(`
/*${'*'.repeat(size)}**
 *${' '.repeat(paddingLeft)}${name}${' '.repeat(paddingRight)} *
 *${'*'.repeat(size)}**/

${code}
`.trimStart(), true, 'top')
    saveState({ 'focused-panel': 'dvala-code' })
    applyState()
    showToast(`Example loaded: ${name}`)
  })
}

export function loadCode(code: string) {
  setDvalaCode(code, true, 'top', () => {
    saveState({ 'focused-panel': 'dvala-code' })
    applyState()
    showToast('Code loaded')
  })
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
