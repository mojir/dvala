/* eslint-disable no-console */
import { stringifyValue } from '../../common/utils'
import type { Example } from '../../reference/examples'
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
import { getAutoCompleter, getUndefinedSymbols, parseTokenStream, tokenizeSource } from '../../src/tooling'
import type { DvalaErrorJSON } from '../../src/errors'
import { Search } from './Search'
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

const dvalaDebug = createDvala({ debug: true, modules: allBuiltinModules })
const dvalaNoDebug = createDvala({ debug: false, modules: allBuiltinModules })
const getDvala = (forceDebug?: 'debug') => forceDebug || getState('debug') ? dvalaDebug : dvalaNoDebug

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
  dvalaPanelDebugInfo: document.getElementById('dvala-panel-debug-info') as HTMLDivElement,
  contextUndoButton: document.getElementById('context-undo-button') as HTMLAnchorElement,
  contextRedoButton: document.getElementById('context-redo-button') as HTMLAnchorElement,
  dvalaCodeUndoButton: document.getElementById('dvala-code-undo-button') as HTMLAnchorElement,
  dvalaCodeRedoButton: document.getElementById('dvala-code-redo-button') as HTMLAnchorElement,
  contextTitle: document.getElementById('context-title') as HTMLDivElement,
  dvalaCodeTitle: document.getElementById('dvala-code-title') as HTMLDivElement,
  dvalaCodeTitleString: document.getElementById('dvala-code-title-string') as HTMLSpanElement,
  dvalaCodeTitleInput: document.getElementById('dvala-code-title-input') as HTMLInputElement,
  dvalaCodePendingIndicator: document.getElementById('dvala-code-pending-indicator') as HTMLSpanElement,
  snapshotModal: document.getElementById('snapshot-modal') as HTMLDivElement,
  snapshotPanelContainer: document.getElementById('snapshot-panel-container') as HTMLDivElement,
  snapshotPanelTemplate: document.getElementById('snapshot-panel-template') as HTMLTemplateElement,
  infoModal: document.getElementById('info-modal') as HTMLDivElement,
  infoModalTitle: document.getElementById('info-modal-title') as HTMLDivElement,
  infoModalMessage: document.getElementById('info-modal-message') as HTMLDivElement,
  importOptionsModal: document.getElementById('import-options-modal') as HTMLDivElement,
  importOptCode: document.getElementById('import-opt-code') as HTMLInputElement,
  importOptCodeLabel: document.getElementById('import-opt-code-label') as HTMLLabelElement,
  importOptContext: document.getElementById('import-opt-context') as HTMLInputElement,
  importOptContextLabel: document.getElementById('import-opt-context-label') as HTMLLabelElement,
  importOptSettings: document.getElementById('import-opt-settings') as HTMLInputElement,
  importOptSettingsLabel: document.getElementById('import-opt-settings-label') as HTMLLabelElement,
  importOptSavedSnapshots: document.getElementById('import-opt-saved-snapshots') as HTMLInputElement,
  importOptSavedSnapshotsLabel: document.getElementById('import-opt-saved-snapshots-label') as HTMLLabelElement,
  importOptRecentSnapshots: document.getElementById('import-opt-recent-snapshots') as HTMLInputElement,
  importOptRecentSnapshotsLabel: document.getElementById('import-opt-recent-snapshots-label') as HTMLLabelElement,
  importOptLayout: document.getElementById('import-opt-layout') as HTMLInputElement,
  importOptLayoutLabel: document.getElementById('import-opt-layout-label') as HTMLLabelElement,
  importOptSavedPrograms: document.getElementById('import-opt-saved-programs') as HTMLInputElement,
  importOptSavedProgramsLabel: document.getElementById('import-opt-saved-programs-label') as HTMLLabelElement,
  importResultModal: document.getElementById('import-result-modal') as HTMLDivElement,
  importResultContent: document.getElementById('import-result-content') as HTMLDivElement,
  exportModal: document.getElementById('export-modal') as HTMLDivElement,
  exportOptCode: document.getElementById('export-opt-code') as HTMLInputElement,
  exportOptContext: document.getElementById('export-opt-context') as HTMLInputElement,
  exportOptSettings: document.getElementById('export-opt-settings') as HTMLInputElement,
  exportOptSavedSnapshots: document.getElementById('export-opt-saved-snapshots') as HTMLInputElement,
  exportOptRecentSnapshots: document.getElementById('export-opt-recent-snapshots') as HTMLInputElement,
  exportOptLayout: document.getElementById('export-opt-layout') as HTMLInputElement,
  exportOptSavedPrograms: document.getElementById('export-opt-saved-programs') as HTMLInputElement,
  confirmModal: document.getElementById('confirm-modal') as HTMLDivElement,
  confirmModalTitle: document.getElementById('confirm-modal-title') as HTMLDivElement,
  confirmModalMessage: document.getElementById('confirm-modal-message') as HTMLDivElement,
  confirmModalCheckboxRow: document.getElementById('confirm-modal-checkbox-row') as HTMLLabelElement,
  confirmModalCheckbox: document.getElementById('confirm-modal-checkbox') as HTMLInputElement,
  confirmModalCheckboxLabel: document.getElementById('confirm-modal-checkbox-label') as HTMLSpanElement,
  confirmModalOk: document.getElementById('confirm-modal-ok') as HTMLButtonElement,
  checkpointModal: document.getElementById('checkpoint-modal') as HTMLDivElement,
  checkpointModalMessage: document.getElementById('checkpoint-modal-message') as HTMLElement,
  checkpointModalMeta: document.getElementById('checkpoint-modal-meta') as HTMLDivElement,
  checkpointModalTech: document.getElementById('checkpoint-modal-tech') as HTMLDivElement,
  toastContainer: document.getElementById('toast-container') as HTMLDivElement,
  effectModal: document.getElementById('effect-modal') as HTMLDivElement,
  effectModalNav: document.getElementById('effect-modal-nav') as HTMLDivElement,
  effectModalCounter: document.getElementById('effect-modal-counter') as HTMLSpanElement,
  effectModalPrev: document.getElementById('effect-modal-prev') as HTMLButtonElement,
  effectModalNext: document.getElementById('effect-modal-next') as HTMLButtonElement,
  effectModalHandledBadge: document.getElementById('effect-modal-handled-badge') as HTMLDivElement,
  effectModalName: document.getElementById('effect-modal-name') as HTMLElement,
  effectModalArgs: document.getElementById('effect-modal-args') as HTMLDivElement,
  effectModalMainButtons: document.getElementById('effect-modal-main-buttons') as HTMLDivElement,
  effectModalInputSection: document.getElementById('effect-modal-input-section') as HTMLDivElement,
  effectModalInputLabel: document.getElementById('effect-modal-input-label') as HTMLSpanElement,
  effectModalValue: document.getElementById('effect-modal-value') as HTMLTextAreaElement,
  effectModalError: document.getElementById('effect-modal-error') as HTMLSpanElement,
  ioPickModal: document.getElementById('io-pick-modal') as HTMLDivElement,
  ioPickModalTitle: document.getElementById('io-pick-modal-title') as HTMLDivElement,
  ioPickList: document.getElementById('io-pick-list') as HTMLDivElement,
  ioConfirmModal: document.getElementById('io-confirm-modal') as HTMLDivElement,
  ioConfirmQuestion: document.getElementById('io-confirm-question') as HTMLDivElement,
  ioConfirmNoBtn: document.getElementById('io-confirm-no-btn') as HTMLButtonElement,
  ioConfirmYesBtn: document.getElementById('io-confirm-yes-btn') as HTMLButtonElement,
  readlineModal: document.getElementById('readline-modal') as HTMLDivElement,
  readlinePrompt: document.getElementById('readline-prompt') as HTMLDivElement,
  readlineInput: document.getElementById('readline-input') as HTMLTextAreaElement,
  printlnModal: document.getElementById('println-modal') as HTMLDivElement,
  printlnContent: document.getElementById('println-content') as HTMLPreElement,
  copyPrintlnBtn: document.getElementById('copy-println-btn') as HTMLDivElement,
}

elements.copyPrintlnBtn.addEventListener('click', () => {
  void navigator.clipboard.writeText(elements.printlnContent.textContent ?? '')
})

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
  resolve: () => void
  handled: boolean
  handledAction?: 'resume' | 'fail' | 'suspend' | 'ignore'
  handledValue?: string
}
let pendingEffects: PendingEffect[] = []
let currentEffectIndex = 0
let effectBatchScheduled = false
let pendingEffectAction: 'resume' | 'fail' | 'suspend' | null = null
let pendingReadline: { resolve: (value: string | null) => void; suspend?: () => void } | null = null
let pendingIoPick: { submit: (value: number | null) => void; suspend: () => void; focusedIndex: number | null; itemCount: number } | null = null
let pendingIoConfirm: { resolve: (value: boolean) => void; suspend: () => void; defaultValue: boolean | undefined } | null = null
let pendingPrintln: { resolve: () => void; suspend: () => void } | null = null
let currentSnapshot: Snapshot | null = null
const snapshotPanelStack: { panel: HTMLElement; snapshot: Snapshot; label: string }[] = []

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

export function showSettingsTab(id: string) {
  document.querySelectorAll('.settings-tab-btn').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'))
  document.getElementById(`settings-tab-btn-${id}`)?.classList.add('active')
  document.getElementById(`settings-tab-${id}`)?.classList.add('active')
  history.replaceState(null, '', `#settings-page/${id}`)
  if (id === 'actions')
    updateStorageUsage()
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
  if (navLink) navLink.style.color = 'rgb(245 245 245)'
}

function notifySnapshotAdded() {
  const snapshotsPage = document.getElementById('snapshots-page')
  if (snapshotsPage?.classList.contains('active-content')) return
  const indicator = document.getElementById('snapshots-nav-indicator')
  if (indicator) indicator.style.display = 'inline-block'
  const navLink = document.getElementById('snapshots-page_link')
  if (navLink) navLink.style.color = 'rgb(245 245 245)'
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
    <button onclick="event.stopPropagation(); Playground.closeContextMenu(); ${item.action}" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; background: none; border: none; color: rgb(209 213 219); font-size: 0.875rem; cursor: pointer; text-align: left;" onmouseover="this.style.background='rgb(60 60 60)'" onmouseout="this.style.background='none'">
      <span style="display: flex; align-items: center;">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
    </button>
  `).join('')

  return `
    <div style="position: relative;">
      <button class="snapshot-btn" onclick="event.stopPropagation(); Playground.toggleContextMenu('${menuId}', this)" style="background: none; border: none; padding: 2px; font-size: 1.1em; cursor: pointer; display: flex; align-items: center; border-radius: 4px; color: rgb(163 163 163);" title="More actions">${ICONS.menu}</button>
      <div id="${menuId}" class="snapshot-context-menu" style="display: none; position: fixed; min-width: 150px; background: rgb(40 40 40); border: 1px solid rgb(60 60 60); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 1000; overflow: hidden;">
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
    return `<div style="font-size: 0.8rem; color: rgb(140 140 140); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><span style="color: rgb(100 100 100);">error:</span> ${escapeHtml(String(meta.error.message))}</div>`
  }
  if (meta?.result !== undefined) {
    return `<div style="font-size: 0.8rem; color: rgb(140 140 140); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><span style="color: rgb(100 100 100);">result:</span> ${escapeHtml(String(meta.result))}</div>`
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
  const timestamp = `<div style="font-size: 0.75rem; color: rgb(100 100 100); display: flex; gap: 0.75rem;">${formatTime(new Date(savedAt))}<span>${sizeStr}</span></div>`

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
    borderColor = entry.resultType === 'error' ? '#d16969' : '#4db36e'
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
    type = 'saved'
    title = entry.name || `Snapshot #${index + 1}`
    titlePrefix = entry.locked ? `<span style="color: rgb(234 179 8); display: flex; align-items: center;" title="Locked">${ICONS.lock}</span>` : ''
    message = getSnapshotDisplayMessage(snapshot)
    detailLine = `${isCompleted ? buildTerminalDetailLine(snapshot) : ''}${timestamp}`
    borderColor = isCompleted ? ((snapshot.meta as { error?: unknown } | undefined)?.error ? '#d16969' : '#4db36e') : 'rgb(107 114 128)'
    menuItems = [
      { label: 'Open', icon: ICONS.eye, action: `Playground.openSavedSnapshot(${index})` },
      { label: entry.locked ? 'Unlock' : 'Lock', icon: entry.locked ? ICONS.lock : ICONS.unlock, action: `Playground.toggleSnapshotLock(${index})` },
      { label: 'Download', icon: ICONS.download, action: `Playground.downloadSavedSnapshotByIndex(${index})` },
      { label: 'Delete', icon: ICONS.trash, action: `Playground.deleteSavedSnapshot(${index})` },
    ]
    actionButtons = isCompleted ? '' : `<button class="snapshot-btn" onclick="event.stopPropagation(); Playground.runSavedSnapshot(${index})" style="background: none; border: none; padding: 2px; font-size: 1.1em; cursor: pointer; display: flex; align-items: center; border-radius: 4px; color: rgb(163 163 163);" title="Run snapshot">${ICONS.play}</button>`
    onclick = `Playground.openSavedSnapshot(${index})`
  }

  return `
    <div class="snapshot-card ${animateClass}" data-type="${type}" data-index="${index}" onclick="${onclick}" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem; background: rgb(46 46 46); border-radius: 8px; border-left: 3px solid ${borderColor}; cursor: pointer;" onmouseover="this.style.background='rgb(52 52 52)'" onmouseout="this.style.background='rgb(46 46 46)'">
      <div style="display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0;">
        <div style="font-size: 1rem; color: rgb(209 213 219); display: flex; align-items: center; gap: 0.5rem;">${titlePrefix}${escapeHtml(title)}${entry.kind === 'saved' && snapshot.terminal !== true ? '<span style="font-size: 0.65rem; color: rgb(100 100 100); font-family: sans-serif; font-weight: bold; letter-spacing: 0.05em;">SUSPENDED</span>' : ''}</div>
        <div style="font-size: 0.8rem; color: rgb(140 140 140);">${escapeHtml(message)}</div>
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
  return `<div style="font-size: 0.75rem; font-weight: 600; color: rgb(140 140 140); text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0;">${escapeHtml(label)}</div>`
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
    terminalEntries.forEach((entry, index) => {
      // Only animate the first (newest) terminal entry if animateNewTerminal is true
      cards.push(renderSnapshotCard(entry, index, animateNewTerminal && index === 0))
    })
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
  const normalized = program.code.trim().replace(/\s+/g, ' ')
  const snippet = normalized.slice(0, 120)
  const displaySnippet = snippet.length < normalized.length ? `${snippet}…` : snippet
  const isActive = getState('current-program-id') === program.id
  const borderColor = 'rgb(82 82 82)'
  const animateClass = animateIn ? 'animate-in' : ''
  const lockIcon = program.locked
    ? `<span style="color:rgb(234 179 8); display:flex; align-items:center;" title="Locked">${ICONS.lock}</span>`
    : ''
  const menuId = `program-menu-${program.id}`
  const menuItems: ContextMenuItem[] = [
    { label: program.locked ? 'Unlock' : 'Lock', icon: program.locked ? ICONS.unlock : ICONS.lock, action: `Playground.toggleProgramLock('${program.id}')` },
    { label: 'Create copy', icon: ICONS.duplicate, action: `Playground.duplicateProgram('${program.id}')` },
    { label: 'Download', icon: ICONS.download, action: `Playground.downloadProgram('${program.id}')` },
    { label: 'Delete', icon: ICONS.trash, action: `Playground.deleteSavedProgram('${program.id}')` },
  ]
  return `
    <div class="snapshot-card ${animateClass}" data-program-id="${program.id}" onclick="Playground.loadSavedProgram('${program.id}')" style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; padding:1rem; background:rgb(46 46 46); border-radius:8px; border-left:3px solid ${borderColor}; cursor:pointer;" onmouseover="this.style.background='rgb(52 52 52)'" onmouseout="this.style.background='rgb(46 46 46)'">
      <div style="display:flex; flex-direction:column; gap:0.25rem; flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${lockIcon}
          <span style="font-size:1rem; color:rgb(209 213 219);">${escapeHtml(program.name)}</span>
          ${isActive ? '<span style="font-size:0.65rem; font-weight:600; letter-spacing:0.05em; color:rgb(78 201 176); border:1px solid rgb(78 201 176); border-radius:3px; padding:1px 5px;">ACTIVE</span>' : ''}
        </div>
        ${normalized ? `<div style="font-size:0.8rem; color:rgb(140 140 140); font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(displaySnippet)}</div>` : '<span style="font-size:0.65rem; font-weight:600; letter-spacing:0.05em; color:rgb(140 140 140); padding:1px 0;">EMPTY PROGRAM</span>'}
        <div style="font-size:0.75rem; color:rgb(100 100 100);">${formatTime(new Date(program.updatedAt))}</div>
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
  saveState({ 'dvala-code': program.code, 'context': program.context, 'current-program-id': program.id })
  elements.dvalaTextArea.value = program.code
  elements.contextTextArea.value = program.context
  syntaxOverlay.update()
  updateCSS()
  populateSavedProgramsList()
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
    void showConfirmModal('Delete program', 'This program is locked. Are you sure you want to permanently delete it?', doDelete)
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
}

export function clearUnlockedPrograms() {
  void showConfirmModal('Clear unlocked programs', 'This will delete all unlocked programs. Locked programs will be kept.', async () => {
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
      void showConfirmModal('Replace existing program?', `"${name}" already exists. Replace it?`, doSave)
    } else {
      doSave()
    }
  })
}

function showNameInputModal(title: string, defaultValue: string, onConfirm: (name: string) => void) {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200; display:flex; align-items:center; justify-content:center;'

  const dialog = document.createElement('div')
  dialog.style.cssText = 'background:rgb(50 50 50); border-radius:8px; padding:1.5rem; display:flex; flex-direction:column; gap:1rem; min-width:20rem; max-width:90vw;'

  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = 'font-size:1rem; color:rgb(209 213 219); font-weight:600;'

  const input = document.createElement('input')
  input.type = 'text'
  input.value = defaultValue
  input.spellcheck = false
  input.style.cssText = 'background:rgb(30 30 30); border:1px solid rgb(82 82 82); border-radius:4px; padding:0.4rem 0.6rem; color:rgb(209 213 219); font-size:0.9rem; outline:none; width:100%; box-sizing:border-box;'

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
  const input = elements.dvalaCodeTitleInput
  const span = elements.dvalaCodeTitleString
  input.value = getState('current-program-id') ? elements.dvalaCodeTitleString.textContent ?? '' : ''
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
    void showConfirmModal('Replace existing program?', `"${name}" already exists. Replace it with the current code and context?`, () => {
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

function scheduleAutoSave() {
  const currentId = getState('current-program-id')
  if (!currentId) return
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
    void showConfirmModal('Delete locked snapshot', 'This snapshot is locked. Are you sure you want to delete it?', doDelete)
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
  void showConfirmModal('Clear unlocked snapshots', 'This will delete all unlocked snapshots. Locked snapshots will be kept.', async () => {
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

  if (!chevron || !content)
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
  const href = `${location.origin}${location.pathname}?state=${encodeState()}`
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
  void showConfirmModal('Clear Local Storage', 'This will clear code, context, settings, and layout preferences.', () => {
    clearAllStates()
    applyState(true)
    updateStorageUsage()
  })
}

export function clearIndexedDbData() {
  void showConfirmModal('Clear IndexedDB', 'This will delete all saved snapshots, recent snapshots, and saved programs.', () => {
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
  // Flush any pending auto-save for the current program
  if (autoSaveTimer) {
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
  saveState({ 'dvala-code': '', 'current-program-id': null }, true)
  elements.dvalaTextArea.value = ''
  syntaxOverlay.update()
  updateCSS()
  populateSavedProgramsList()
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
    scheduleAutoSave()
  } else {
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

export function resetPlayground() {
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
  await initSnapshotStorage()
  await initPrograms()
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
    if (Search.handleKeyDown(evt))
      return

    if (pendingIoPick && elements.ioPickModal.style.display !== 'none') {
      if (evt.key === 'ArrowDown') {
        evt.preventDefault()
        evt.stopPropagation()
        const next = pendingIoPick.focusedIndex === null ? 0 : Math.min(pendingIoPick.focusedIndex + 1, pendingIoPick.itemCount - 1)
        setPickFocus(next)
      } else if (evt.key === 'ArrowUp') {
        evt.preventDefault()
        evt.stopPropagation()
        const prev = pendingIoPick.focusedIndex === null ? pendingIoPick.itemCount - 1 : Math.max(pendingIoPick.focusedIndex - 1, 0)
        setPickFocus(prev)
      } else if (evt.key === 'Escape') {
        evt.preventDefault()
        evt.stopPropagation()
        closeEffectHandlerMenus()
        cancelIoPick()
      } else {
        evt.preventDefault()
        evt.stopPropagation()
      }
      return
    }

    if (pendingIoConfirm && elements.ioConfirmModal.style.display !== 'none') {
      if (evt.key === 'Escape') {
        evt.preventDefault()
        evt.stopPropagation()
        closeEffectHandlerMenus()
        submitIoConfirm(false)
      } else if (evt.key === 'Enter') {
        evt.preventDefault()
        evt.stopPropagation()
        if (pendingIoConfirm.defaultValue !== undefined)
          submitIoConfirm(pendingIoConfirm.defaultValue)
      } else {
        evt.preventDefault()
        evt.stopPropagation()
      }
      return
    }

    if (pendingReadline && elements.readlineModal.style.display !== 'none') {
      evt.stopPropagation()
      if (evt.key === 'Escape') {
        evt.preventDefault()
        closeEffectHandlerMenus()
        cancelReadline()
      } else if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault()
      }
      return
    }

    if (pendingPrintln && elements.printlnModal.style.display !== 'none') {
      evt.preventDefault()
      evt.stopPropagation()
      if (evt.key === 'Escape' || evt.key === 'Enter') {
        closeEffectHandlerMenus()
        dismissPrintln()
      }
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
      if (elements.infoModal.style.display !== 'none') {
        closeInfoModal()
      } else if (elements.confirmModal.style.display !== 'none') {
        closeConfirmModal()
      } else if (elements.checkpointModal.style.display !== 'none') {
        closeCheckpointModal()
      } else if (currentSnapshot) {
        if (snapshotPanelStack.length > 1) {
          slideBackSnapshotModal()
        } else {
          closeSnapshotModal()
        }
      } else if (pendingEffectAction) {
        cancelEffectAction()
      } else if (pendingEffects.length > 0) {
        selectEffectAction('ignore')
      }
      evt.preventDefault()
    }
    if (evt.key === 'Enter' && elements.infoModal.style.display !== 'none') {
      evt.preventDefault()
      closeInfoModal()
    }
    if (evt.key === 'Enter' && elements.confirmModal.style.display !== 'none') {
      evt.preventDefault()
      elements.confirmModalOk.click()
    }
    if (evt.key === 'Enter' && elements.checkpointModal.style.display !== 'none') {
      evt.preventDefault()
      closeCheckpointModal()
    }
    if (evt.key === 'Enter' && pendingPrintln && elements.printlnModal.style.display !== 'none') {
      evt.preventDefault()
      dismissPrintln()
    }
    if (evt.key === 'Enter' && currentSnapshot) {
      evt.preventDefault()
      void resumeSnapshot()
    }
    if (evt.key === 'Enter' && pendingEffects.length > 0 && !pendingEffectAction) {
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
  populateSnapshotsList()
  populateSavedProgramsList()

  const [pageId, tabId] = (location.hash.substring(1) || 'index').split('/')
  showPage(pageId!, 'instant', 'replace', tabId)

  Search.onClose(() => {
    applyState()
  })
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
  if (pendingIoPick || pendingIoConfirm || pendingPrintln) {
    evt.preventDefault()
    evt.stopPropagation()
    return
  }
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
  const [pageId, tabId] = (location.hash.substring(1) || 'index').split('/')
  showPage(pageId!, 'instant', 'none', tabId)
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
    const pure = getState('pure')
    const disableAutoCheckpoint = getState('disable-auto-checkpoint')
    const runResult = await getDvala().runAsync(code, pure
      ? { bindings: dvalaParams.bindings, pure: true, disableAutoCheckpoint }
      : { bindings: dvalaParams.bindings, effectHandlers: dvalaParams.effectHandlers, disableAutoCheckpoint },
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
}

export function toggleDebug() {
  saveState({ debug: !getState('debug') })
  updateCSS()
}

export function togglePure() {
  saveState({ pure: !getState('pure') })
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

export function toggleDisablePlaygroundHandlers() {
  saveState({ 'disable-playground-handlers': !getState('disable-playground-handlers') })
  updateCSS()
}

export function toggleAutoCheckpoint() {
  saveState({ 'disable-auto-checkpoint': !getState('disable-auto-checkpoint') })
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
    num.style.cssText = 'font-size:0.65rem; color: rgb(115 115 115); font-family:sans-serif; font-weight:bold; min-width:1rem; flex-shrink:0;'
    row.appendChild(num)
  }
  const code = document.createElement('code')
  code.textContent = content
  if (index !== undefined) {
    code.style.cssText = 'white-space:nowrap; font-size:0.75rem; color: rgb(212 212 212); overflow:hidden; text-overflow:ellipsis; min-width:0; flex: 1 1 0;'

    const textToCopy = copyContent ?? content
    const copyBtn = document.createElement('span')
    copyBtn.innerHTML = '&#x2398;'
    copyBtn.style.cssText = 'font-size:1.6rem; display:inline-flex; align-items:center; justify-content:center; height:1.4rem; overflow:hidden; color:rgb(115 115 115); cursor:pointer; flex-shrink:0; margin-left:1rem; opacity:0; transition:opacity 0.15s ease;'
    copyBtn.addEventListener('click', e => {
      e.stopPropagation()
      void navigator.clipboard.writeText(textToCopy)
    })
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.color = 'rgb(229 229 229)'
    })
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.color = 'rgb(115 115 115)'
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
    code.style.cssText = 'white-space:pre; font-size:0.75rem; color: rgb(212 212 212);'
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

  snapshotPanelStack.forEach((entry, i) => {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.textContent = '›'
      sep.style.cssText = 'color: rgb(115 115 115); margin: 0 0.15rem; font-weight: normal;'
      container.appendChild(sep)
    }

    const isLast = i === snapshotPanelStack.length - 1
    const span = document.createElement('span')
    span.textContent = entry.label
    if (isLast) {
      span.style.cssText = 'color: rgb(229 229 229);'
    } else {
      span.style.cssText = 'color: rgb(115 115 115); cursor: pointer; font-weight: normal;'
      const targetIndex = i
      span.addEventListener('click', () => popToLevel(targetIndex))
    }
    container.appendChild(span)
  })
}

function popToLevel(targetIndex: number) {
  while (snapshotPanelStack.length > targetIndex + 1) {
    const { panel } = snapshotPanelStack.pop()!
    panel.remove()
  }
  currentSnapshot = snapshotPanelStack[snapshotPanelStack.length - 1]?.snapshot ?? null
}

const MAX_URL_LENGTH = 24 * 1024 // 24KB, arbitrary limit to avoid creating unshareable links

function populateSnapshotPanel(panel: HTMLElement, snapshot: Snapshot, error?: DvalaErrorJSON) {
  const ref = (name: string) => panel.querySelector(`[data-ref="${name}"]`) as HTMLElement

  // Error section - insert at the top if there's an error
  if (error) {
    const breadcrumbs = ref('breadcrumbs')
    const errorSection = document.createElement('div')
    errorSection.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;'

    const errorLabel = document.createElement('span')
    errorLabel.textContent = 'ERROR'
    errorLabel.style.cssText = 'font-size: 0.75rem; font-weight: bold; color: #d16969; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif;'
    errorSection.appendChild(errorLabel)

    const codeWrapper = document.createElement('div')
    codeWrapper.className = 'example-code'
    codeWrapper.style.cssText = 'position: relative; border-left-color: #d16969;'

    const errorPre = document.createElement('pre')
    errorPre.className = 'fancy-scroll'
    errorPre.textContent = error.message
    errorPre.style.cssText = 'background: rgb(30 30 30); color: rgb(212 212 212); padding: 0.5rem; font-size: 0.875rem; font-family: monospace; overflow: auto; max-height: 8rem; white-space: pre-wrap; word-break: break-word; margin: 0; border: none;'
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
    breadcrumbs.insertAdjacentElement('afterend', errorSection)
  }

  // Suspended effect section - hide if no active effect (terminal snapshots)
  const suspendedEffectSection = ref('suspended-effect-section')
  if (snapshot.effectName) {
    suspendedEffectSection.style.display = 'flex'
    ref('effect-name').textContent = snapshot.effectName

    // Effect args
    const argsEl = ref('effect-args')
    argsEl.innerHTML = ''
    if (!snapshot.effectArgs || snapshot.effectArgs.length === 0) {
      const empty = document.createElement('span')
      empty.textContent = '(no arguments)'
      empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
      argsEl.appendChild(empty)
    } else {
      snapshot.effectArgs.forEach((arg, i) => argsEl.appendChild(makeArgRow(JSON.stringify(arg), i, JSON.stringify(arg, null, 2))))
    }
  } else {
    suspendedEffectSection.style.display = 'none'
  }

  // Share button — mark if snapshot URL would be too long
  const shareBtn = ref('share-btn') as HTMLButtonElement
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
    empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
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
    labelEl.style.cssText = 'font-size:0.7rem; color: rgb(115 115 115); font-weight:bold; font-family:sans-serif;'
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
    empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
    checkpointsEl.appendChild(empty)
  } else {
    cpSnapshots.forEach(cpSnapshot => {
      const card = document.createElement('div')
      card.style.cssText = 'display:flex; flex-direction:row; align-items:center; gap:0.5rem; padding:0.4rem 0.6rem; border:1px solid rgb(82 82 82); cursor:pointer; transition:border-color 0.15s ease, background 0.15s ease;'
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgb(140 140 140)'
        card.style.background = 'rgba(255,255,255,0.03)'
      })
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgb(82 82 82)'
        card.style.background = 'transparent'
      })
      card.addEventListener('click', () => pushCheckpointPanel(cpSnapshot))

      const badge = document.createElement('span')
      badge.textContent = `#${cpSnapshot.index}`
      badge.style.cssText = 'font-size:0.7rem; font-weight:bold; font-family:sans-serif; color:rgb(163 163 163); background:rgb(50 50 50); padding:0.1rem 0.35rem; flex-shrink:0;'
      card.appendChild(badge)

      const info = document.createElement('div')
      info.style.cssText = 'display:flex; flex-direction:column; gap:1px; overflow:hidden; min-width:0;'

      if (cpSnapshot.meta !== null && cpSnapshot.meta !== undefined) {
        const meta = document.createElement('code')
        meta.textContent = JSON.stringify(cpSnapshot.meta)
        meta.style.cssText = 'font-size:0.75rem; color:rgb(200 200 200); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'
        info.appendChild(meta)
      }

      const msg = document.createElement('span')
      msg.textContent = cpSnapshot.message
      msg.style.cssText = 'font-size:0.75rem; color:rgb(229 229 229); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'
      info.appendChild(msg)

      const ts = document.createElement('span')
      const d = new Date(cpSnapshot.timestamp)
      const pad = (n: number) => String(n).padStart(2, '0')
      ts.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      ts.style.cssText = 'font-size:0.65rem; color:rgb(115 115 115); font-family:sans-serif;'
      info.appendChild(ts)

      card.appendChild(info)

      const playIcon = document.createElement('span')
      playIcon.innerHTML = ICONS.play
      playIcon.style.cssText = 'margin-left:auto; flex-shrink:0; font-size:1.1rem; color:rgb(163 163 163); transition:color 0.15s ease;'
      playIcon.addEventListener('mouseenter', () => { playIcon.style.color = 'rgb(245 245 245)' })
      playIcon.addEventListener('mouseleave', () => { playIcon.style.color = 'rgb(163 163 163)' })
      playIcon.addEventListener('click', evt => {
        evt.stopPropagation()
        currentSnapshot = cpSnapshot
        void resumeSnapshot()
      })
      card.appendChild(playIcon)

      checkpointsEl.appendChild(card)
    })
  }

  // Copy JSON button
  ref('copy-json-btn').addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
  })
}

function createSnapshotPanel(snapshot: Snapshot, isRoot: boolean, error?: DvalaErrorJSON): HTMLElement {
  const clone = elements.snapshotPanelTemplate.content.cloneNode(true) as DocumentFragment
  const panel = clone.firstElementChild as HTMLElement

  // Show/hide appropriate button
  if (isRoot) {
    ;(panel.querySelector('[data-ref="back-btn"]') as HTMLElement).style.display = 'none'
  } else {
    ;(panel.querySelector('[data-ref="close-btn"]') as HTMLElement).style.display = 'none'
    ;(panel.querySelector('[data-ref="back-btn"]') as HTMLElement).style.display = 'flex'
    panel.style.position = 'absolute'
    panel.style.top = '0'
    panel.style.left = '0'
    panel.style.right = '0'
    panel.style.bottom = '0'
    panel.style.zIndex = String(snapshotPanelStack.length)
    panel.style.display = 'none'
  }

  populateSnapshotPanel(panel, snapshot, error)
  return panel
}

function pushCheckpointPanel(snapshot: Snapshot) {
  currentSnapshot = snapshot
  const panel = createSnapshotPanel(snapshot, false)
  elements.snapshotPanelContainer.appendChild(panel)
  const label = snapshotLabel(snapshot)
  snapshotPanelStack.push({ panel, snapshot, label })
  buildBreadcrumbs(panel)

  panel.style.display = 'flex'
  panel.animate(
    [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
    { duration: 250, easing: 'ease', fill: 'forwards' },
  )
}

function getSnapshotError(snapshot: Snapshot): DvalaErrorJSON | undefined {
  const meta = snapshot.meta as { error?: DvalaErrorJSON } | undefined
  return meta?.error
}

let resolveSnapshotModal: (() => void) | null = null

export function openSnapshotModal(snapshot: Snapshot): Promise<void> {
  currentSnapshot = snapshot
  elements.snapshotPanelContainer.innerHTML = ''
  snapshotPanelStack.length = 0

  const error = getSnapshotError(snapshot)
  const panel = createSnapshotPanel(snapshot, true, error)
  elements.snapshotPanelContainer.appendChild(panel)
  snapshotPanelStack.push({ panel, snapshot, label: 'Snapshot' })
  buildBreadcrumbs(panel)

  elements.snapshotModal.style.display = 'flex'

  return new Promise<void>(resolve => {
    resolveSnapshotModal = resolve
  })
}

export function slideBackSnapshotModal() {
  if (snapshotPanelStack.length <= 1)
    return

  const { panel } = snapshotPanelStack.pop()!
  panel.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
    { duration: 250, easing: 'ease' },
  ).onfinish = () => {
    panel.remove()
  }

  currentSnapshot = snapshotPanelStack[snapshotPanelStack.length - 1]?.snapshot ?? null
}

export function closeSnapshotModal() {
  elements.snapshotModal.style.display = 'none'
  elements.snapshotPanelContainer.innerHTML = ''
  snapshotPanelStack.length = 0
  currentSnapshot = null
  resolveSnapshotModal?.()
  resolveSnapshotModal = null
}

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

  elements.toastContainer.appendChild(toast)

  setTimeout(() => dismissToast(toast), TOAST_DURATION)
}

function dismissToast(toast: HTMLElement) {
  if (!toast.parentElement)
    return
  toast.style.animation = 'toast-out 0.2s ease forwards'
  toast.addEventListener('animationend', () => toast.remove())
}

let resolveInfoModal: (() => void) | null = null

export function showInfoModal(title: string, message: string): Promise<void> {
  elements.infoModalTitle.textContent = title
  elements.infoModalMessage.textContent = message
  elements.infoModal.style.display = 'flex'

  return new Promise<void>(resolve => {
    resolveInfoModal = resolve
  })
}

export function closeInfoModal() {
  elements.infoModal.style.display = 'none'
  resolveInfoModal?.()
  resolveInfoModal = null
}

let resolveConfirmModal: (() => void) | null = null

export function showConfirmModal(title: string, message: string, onConfirm: () => void | Promise<void>): Promise<void> {
  elements.confirmModalTitle.textContent = title
  elements.confirmModalMessage.textContent = message
  elements.confirmModalCheckboxRow.style.display = 'none'
  elements.confirmModalOk.onclick = () => {
    closeConfirmModal()
    void onConfirm()
  }
  elements.confirmModal.style.display = 'flex'

  return new Promise<void>(resolve => {
    resolveConfirmModal = resolve
  })
}

export function exportPlayground() {
  elements.exportModal.style.display = 'flex'
}

export function closeExportModal() {
  elements.exportModal.style.display = 'none'
}

export function doExport() {
  const settingsKeys = [
    'debug', 'pure', 'intercept-checkpoint', 'intercept-error',
    'disable-playground-handlers', 'disable-auto-checkpoint',
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
  settings: ['debug', 'pure', 'intercept-checkpoint', 'intercept-error', 'disable-playground-handlers', 'disable-auto-checkpoint'],
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
    ? `<p style="margin:0 0 0.5rem 0; color: rgb(212 212 212);">Imported:</p><ul style="margin:0 0 0.75rem 0; padding-left:1.25rem;">${imported.map(s => `<li>${s}</li>`).join('')}</ul>`
    : '<p style="margin:0 0 0.75rem 0;">Nothing was imported.</p>'
  const skippedHtml = skipped.length > 0
    ? `<p style="margin:0 0 0.5rem 0; color: rgb(212 212 212);">Skipped:</p><ul style="margin:0; padding-left:1.25rem;">${skipped.map(s => `<li>${s}</li>`).join('')}</ul>`
    : ''
  const reloadHtml = importNeedsReload
    ? '<p style="margin:0.75rem 0 0 0; color: rgb(115 115 115);">The page will reload when you close this.</p>'
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

export function closeConfirmModal() {
  elements.confirmModal.style.display = 'none'
  resolveConfirmModal?.()
  resolveConfirmModal = null
}

let currentCheckpointSnapshot: Snapshot | null = null
let resolveCheckpointModal: (() => void) | null = null

export function openCheckpointModal(snapshot: Snapshot): Promise<void> {
  currentCheckpointSnapshot = snapshot

  // Message
  elements.checkpointModalMessage.textContent = snapshot.message || '(no message)'

  // Meta
  elements.checkpointModalMeta.innerHTML = ''
  if (snapshot.meta === undefined || snapshot.meta === null) {
    const empty = document.createElement('span')
    empty.textContent = '(no metadata)'
    empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
    elements.checkpointModalMeta.appendChild(empty)
  } else {
    const code = document.createElement('code')
    code.textContent = JSON.stringify(snapshot.meta, null, 2)
    code.style.cssText = 'white-space:pre; font-size:0.75rem; color: rgb(212 212 212);'
    elements.checkpointModalMeta.appendChild(code)
  }

  // Technical info
  elements.checkpointModalTech.innerHTML = ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date(snapshot.timestamp)
  const checkpointBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  const techRows: [string, string][] = [
    ['ID', snapshot.id],
    ['Index', String(snapshot.index)],
    ['Run ID', snapshot.executionId],
    ['Timestamp', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`],
    ['Size', checkpointBytes >= 1024 * 1024 ? `${(checkpointBytes / (1024 * 1024)).toFixed(2)} MB` : `${(checkpointBytes / 1024).toFixed(2)} KB`],
  ]
  techRows.forEach(([label, value]) => {
    const row = makeArgRow(value)
    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.cssText = 'font-size:0.7rem; color: rgb(115 115 115); font-weight:bold; font-family:sans-serif;'
    row.insertBefore(labelEl, row.firstChild)
    elements.checkpointModalTech.appendChild(row)
  })

  elements.checkpointModal.style.display = 'flex'

  return new Promise<void>(resolve => {
    resolveCheckpointModal = resolve
  })
}

export function closeCheckpointModal() {
  elements.checkpointModal.style.display = 'none'
  currentCheckpointSnapshot = null
  resolveCheckpointModal?.()
  resolveCheckpointModal = null
}

const MAX_TERMINAL_SNAPSHOTS = 3

function saveTerminalSnapshot(snapshot: Snapshot, resultType: 'completed' | 'error', result?: string): void {
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
  showToast(resultType === 'error' ? 'Program failed — snapshot captured' : 'Program completed — snapshot captured')
}

export async function clearTerminalSnapshot(index: number): Promise<void> {
  await animateCardRemoval('terminal', index)
  const entries = getTerminalSnapshots()
  entries.splice(index, 1)
  setTerminalSnapshots(entries)
  populateSnapshotsList()
}

function promptSnapshotName(onSave: (name: string) => void | Promise<void>) {
  elements.readlinePrompt.textContent = 'Enter a name for this snapshot'
  elements.readlinePrompt.style.display = 'block'
  elements.readlineInput.value = ''
  elements.readlineModal.style.display = 'flex'
  elements.readlineInput.focus()
  pendingReadline = {
    resolve: (value: string | null) => {
      if (value !== null) {
        void onSave(value)
      }
    },
  }
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
      })
      : await resume(snapshot, null, {
        handlers: dvalaParams.effectHandlers,
        bindings: dvalaParams.bindings as Record<string, Any>,
        modules: allBuiltinModules,
        disableAutoCheckpoint,
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
  // With playground handlers disabled, unhandled effects should throw
  throw new Error(`Unhandled effect (playground handlers disabled): ${ctx.effectName}`)
}

async function defaultEffectHandler(ctx: EffectContext): Promise<void> {
  if (ctx.effectName === 'dvala.checkpoint') {
    // The checkpoint snapshot is already created by dispatchPerform before
    // the effect reaches handlers. We only need to show the modal if
    // intercept-checkpoint is enabled, then continue.
    if (getState('intercept-checkpoint')) {
      // Get the latest checkpoint from ctx.snapshots
      const snapshots = ctx.snapshots
      const snapshot = snapshots[snapshots.length - 1]
      if (snapshot) {
        await openCheckpointModal(snapshot)
      }
    }
    ctx.next()
    return
  }
  if (ctx.effectName.startsWith('dvala.error') && !getState('intercept-error')) {
    ctx.next()
    return
  }
  return new Promise<void>(resolve => {
    const pending: PendingEffect = { ctx, resolve, handled: false }
    pendingEffects.push(pending)

    // When the parallel group aborts (because another branch suspended),
    // auto-suspend this effect so executeParallelBranches can collect it.
    ctx.signal.addEventListener('abort', () => {
      if (pending.handled)
        return
      pending.ctx.suspend()
      pending.handled = true
      pending.resolve()
      // Remove from the visible pending list — the user never interacted with it
      const idx = pendingEffects.indexOf(pending)
      if (idx !== -1)
        pendingEffects.splice(idx, 1)
      if (currentEffectIndex >= pendingEffects.length)
        currentEffectIndex = Math.max(0, pendingEffects.length - 1)
      if (pendingEffects.length === 0 || pendingEffects.every(e => e.handled))
        closeEffectModal()
      else
        renderCurrentEffect()
    }, { once: true })

    if (!effectBatchScheduled) {
      effectBatchScheduled = true
      void Promise.resolve().then(openEffectModal)
    }
  })
}

function openEffectModal() {
  effectBatchScheduled = false
  currentEffectIndex = 0
  renderCurrentEffect()
  elements.effectModal.style.display = 'flex'
}

function renderCurrentEffect() {
  const effect = pendingEffects[currentEffectIndex]
  if (!effect)
    return

  // Counter / nav
  const total = pendingEffects.length
  if (total > 1) {
    elements.effectModalNav.style.display = 'flex'
    elements.effectModalCounter.textContent = `${currentEffectIndex + 1} / ${total}`
    elements.effectModalPrev.style.opacity = currentEffectIndex > 0 ? '1' : '0.3'
    elements.effectModalPrev.style.pointerEvents = currentEffectIndex > 0 ? 'auto' : 'none'
    elements.effectModalNext.style.opacity = currentEffectIndex < total - 1 ? '1' : '0.3'
    elements.effectModalNext.style.pointerEvents = currentEffectIndex < total - 1 ? 'auto' : 'none'
  } else {
    elements.effectModalNav.style.display = 'none'
  }

  // Handled badge + result
  elements.effectModalHandledBadge.innerHTML = ''
  if (effect.handled) {
    elements.effectModalHandledBadge.style.display = 'flex'
    const actionLabel = document.createElement('span')
    const actionColors: Record<string, string> = { resume: 'rgb(110 231 183)', fail: 'rgb(251 113 133)', suspend: 'rgb(148 163 184)', ignore: 'rgb(115 115 115)' }
    actionLabel.textContent = `✓ ${effect.handledAction ?? 'handled'}`
    actionLabel.style.cssText = `font-weight:bold; color:${actionColors[effect.handledAction ?? ''] ?? 'rgb(110 231 183)'};`
    elements.effectModalHandledBadge.appendChild(actionLabel)
    if (effect.handledValue) {
      const sep = document.createElement('span')
      sep.textContent = '→'
      sep.style.cssText = 'color: rgb(115 115 115); margin: 0 0.3rem;'
      elements.effectModalHandledBadge.appendChild(sep)
      const val = document.createElement('code')
      val.textContent = effect.handledValue
      val.style.cssText = 'color: rgb(212 212 212); font-size: 0.8rem;'
      elements.effectModalHandledBadge.appendChild(val)
    }
  } else {
    elements.effectModalHandledBadge.style.display = 'none'
  }

  // Effect name
  elements.effectModalName.textContent = effect.ctx.effectName

  // Args
  elements.effectModalArgs.innerHTML = ''
  if (effect.ctx.args.length === 0) {
    const empty = document.createElement('span')
    empty.textContent = '(no arguments)'
    empty.style.cssText = 'font-size:0.75rem; color: rgb(115 115 115); font-style: italic;'
    elements.effectModalArgs.appendChild(empty)
  } else {
    effect.ctx.args.forEach((arg, i) => {
      elements.effectModalArgs.appendChild(makeArgRow(JSON.stringify(arg), i, JSON.stringify(arg, null, 2)))
    })
  }

  // Input section reset
  pendingEffectAction = null
  elements.effectModalInputSection.style.display = 'none'
  elements.effectModalMainButtons.style.opacity = effect.handled ? '0.4' : '1'
  elements.effectModalMainButtons.style.pointerEvents = effect.handled ? 'none' : 'auto'
}

function closeEffectModal() {
  elements.effectModal.style.display = 'none'
  pendingEffects = []
  currentEffectIndex = 0
  pendingEffectAction = null
}

function advanceAfterHandle() {
  // Find next unhandled effect after current
  let next = pendingEffects.findIndex((e, i) => i > currentEffectIndex && !e.handled)
  if (next === -1)
    next = pendingEffects.findIndex(e => !e.handled)
  if (next === -1) {
    closeEffectModal()
  } else {
    currentEffectIndex = next
    renderCurrentEffect()
  }
}

export function navigateEffect(delta: number) {
  const next = currentEffectIndex + delta
  if (next < 0 || next >= pendingEffects.length)
    return
  currentEffectIndex = next
  renderCurrentEffect()
}

export function selectEffectAction(action: 'resume' | 'fail' | 'suspend' | 'ignore') {
  const effect = pendingEffects[currentEffectIndex]
  if (!effect || effect.handled)
    return

  if (action === 'ignore') {
    effect.ctx.next()
    effect.handled = true
    effect.handledAction = 'ignore'
    effect.resolve()
    advanceAfterHandle()
    return
  }

  pendingEffectAction = action
  const labels: Record<typeof action, string> = {
    resume: 'Resume message',
    fail: 'Error message (optional)',
    suspend: 'Suspend message',
  }
  elements.effectModalInputLabel.textContent = labels[action]
  elements.effectModalValue.value = ''
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
  const effect = pendingEffects[currentEffectIndex]
  if (!effect || effect.handled || !pendingEffectAction)
    return

  const valueStr = elements.effectModalValue.value.trim()

  if (pendingEffectAction === 'resume') {
    try {
      const value = valueStr === '' ? null : JSON.parse(valueStr) as Any
      effect.ctx.resume(value)
      effect.handled = true
      effect.handledAction = 'resume'
      effect.handledValue = valueStr || 'null'
      effect.resolve()
      advanceAfterHandle()
    } catch {
      elements.effectModalError.textContent = 'Invalid JSON'
      elements.effectModalError.style.display = 'block'
      elements.effectModalValue.focus()
    }
  } else if (pendingEffectAction === 'fail') {
    effect.ctx.fail(valueStr || undefined)
    effect.handled = true
    effect.handledAction = 'fail'
    effect.handledValue = valueStr || undefined
    effect.resolve()
    advanceAfterHandle()
  } else if (pendingEffectAction === 'suspend') {
    const meta: Any | undefined = valueStr ? { message: valueStr } : undefined
    effect.ctx.suspend(meta)
    effect.handled = true
    effect.handledAction = 'suspend'
    effect.handledValue = valueStr || undefined
    effect.resolve()
    advanceAfterHandle()
  }
}

// ---------------------------------------------------------------------------
// dvala.io.pick handler — shows a scrollable clickable list modal
// ---------------------------------------------------------------------------

function setPickFocus(index: number | null) {
  if (!pendingIoPick)
    return
  pendingIoPick.focusedIndex = index
  const rows = elements.ioPickList.children
  for (let i = 0; i < rows.length; i++) {
    (rows[i] as HTMLElement).style.background = i === index ? 'rgb(50 50 50)' : ''
  }
  if (index !== null)
    (rows[index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
}

function ioPickHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const items = ctx.args[0] as string[]
    const options = ctx.args[1] as { prompt?: string; default?: number } | undefined
    const promptText = options?.prompt ?? 'Choose an item:'
    const defaultIndex = options?.default ?? null

    elements.ioPickModalTitle.textContent = promptText
    elements.ioPickList.innerHTML = ''

    const submit = (value: number | null) => {
      elements.ioPickModal.style.display = 'none'
      pendingIoPick = null
      ctx.resume(value as Any)
      resolve()
      focusDvalaCode()
    }

    items.forEach((item, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0.5rem; cursor:pointer; border-radius:3px;'
      row.onmouseenter = () => { row.style.background = 'rgb(60 60 60)' }
      row.onmouseleave = () => { row.style.background = pendingIoPick?.focusedIndex === i ? 'rgb(50 50 50)' : '' }
      const indexSpan = document.createElement('span')
      indexSpan.style.cssText = 'font-size:0.75rem; color:rgb(115 115 115); font-family:monospace; min-width:1.2rem; text-align:right; flex-shrink:0;'
      indexSpan.textContent = String(i)
      const labelSpan = document.createElement('span')
      labelSpan.style.cssText = 'font-size:0.875rem; font-family:sans-serif;'
      labelSpan.textContent = item
      row.appendChild(indexSpan)
      row.appendChild(labelSpan)
      row.onclick = () => submit(i)
      elements.ioPickList.appendChild(row)
    })

    const suspendPick = () => {
      elements.ioPickModal.style.display = 'none'
      pendingIoPick = null
      ctx.suspend()
      resolve()
      focusDvalaCode()
    }
    pendingIoPick = { submit, suspend: suspendPick, focusedIndex: defaultIndex, itemCount: items.length }
    setPickFocus(defaultIndex)
    elements.ioPickModal.style.display = 'flex'
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
  const wasHidden = menu.style.display === 'none'
  closeEffectHandlerMenus()
  if (wasHidden)
    menu.style.display = 'flex'
}

export function suspendCurrentEffectHandler() {
  closeEffectHandlerMenus()
  if (pendingIoPick)
    pendingIoPick.suspend()
  else if (pendingIoConfirm)
    pendingIoConfirm.suspend()
  else if (pendingReadline?.suspend)
    pendingReadline.suspend()
  else if (pendingPrintln)
    pendingPrintln.suspend()
}

export function cancelIoPick() {
  if (!pendingIoPick)
    return
  pendingIoPick.submit(null)
}

// ---------------------------------------------------------------------------
// dvala.io.confirm handler — shows a Yes/No modal
// ---------------------------------------------------------------------------

function ioConfirmHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const question = ctx.args[0] as string
    const options = ctx.args[1] as { default?: boolean } | undefined
    const defaultValue = options?.default

    elements.ioConfirmQuestion.textContent = question

    // Only highlight a button when a default is explicitly set
    elements.ioConfirmNoBtn.style.color = defaultValue === false ? '#4ec9b0' : ''
    elements.ioConfirmYesBtn.style.color = defaultValue === true ? '#4ec9b0' : ''

    elements.ioConfirmModal.style.display = 'flex'
    pendingIoConfirm = {
      resolve: (value: boolean) => {
        ctx.resume(value as Any)
        resolve()
      },
      suspend: () => {
        elements.ioConfirmModal.style.display = 'none'
        pendingIoConfirm = null
        ctx.suspend()
        resolve()
        focusDvalaCode()
      },
      defaultValue,
    }
  })
}

export function submitIoConfirm(value: boolean) {
  if (!pendingIoConfirm)
    return
  elements.ioConfirmModal.style.display = 'none'
  const p = pendingIoConfirm
  pendingIoConfirm = null
  p.resolve(value)
  focusDvalaCode()
}

// ---------------------------------------------------------------------------
// dvala.io.read-line handler — shows a simple input modal
// ---------------------------------------------------------------------------

function readlineHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const prompt = typeof ctx.args[0] === 'string' ? ctx.args[0] : ''
    elements.readlinePrompt.textContent = prompt
    elements.readlinePrompt.style.display = prompt ? 'block' : 'none'
    elements.readlineInput.value = ''
    elements.readlineModal.style.display = 'flex'
    elements.readlineInput.focus()
    pendingReadline = {
      resolve: (value: string | null) => {
        ctx.resume(value)
        resolve()
      },
      suspend: () => {
        elements.readlineModal.style.display = 'none'
        pendingReadline = null
        ctx.suspend()
        resolve()
        focusDvalaCode()
      },
    }
  })
}

export function submitReadline() {
  if (!pendingReadline)
    return
  const value = elements.readlineInput.value
  elements.readlineModal.style.display = 'none'
  pendingReadline.resolve(value)
  pendingReadline = null
  focusDvalaCode()
}

export function cancelReadline() {
  if (!pendingReadline)
    return
  elements.readlineModal.style.display = 'none'
  pendingReadline.resolve(null)
  pendingReadline = null
  focusDvalaCode()
}

// ---------------------------------------------------------------------------
// dvala.io.println handler — shows output in a modal
// ---------------------------------------------------------------------------

function printlnHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const value = ctx.args[0]
    const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
    elements.printlnContent.textContent = text
    elements.printlnModal.style.display = 'flex'
    pendingPrintln = {
      resolve: () => {
        ctx.resume(value as Any)
        resolve()
      },
      suspend: () => {
        elements.printlnModal.style.display = 'none'
        pendingPrintln = null
        ctx.suspend()
        resolve()
        focusDvalaCode()
      },
    }
  })
}

// ---------------------------------------------------------------------------
// dvala.io.print handler — logs to output panel (no modal)
// ---------------------------------------------------------------------------

async function printHandler(ctx: EffectContext): Promise<void> {
  const value = ctx.args[0]
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  appendOutput(text, 'output')
  ctx.resume(value as Any)
}

export function dismissPrintln() {
  if (!pendingPrintln)
    return
  elements.printlnModal.style.display = 'none'
  pendingPrintln.resolve()
  pendingPrintln = null
  focusDvalaCode()
}

// ---------------------------------------------------------------------------
// Synchronous effect handlers (used in sync mode)
// ---------------------------------------------------------------------------

function syncIoPickHandler(ctx: EffectContext): void {
  const items = ctx.args[0] as string[]
  const options = ctx.args[1] as { prompt?: string; default?: number } | undefined
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
  const question = typeof ctx.args[0] === 'string' ? ctx.args[0] : ''
  ctx.resume(window.confirm(question) as Any)
}

function syncReadlineHandler(ctx: EffectContext): void {
  const promptText = typeof ctx.args[0] === 'string' ? ctx.args[0] : ''
  const value = window.prompt(promptText)
  ctx.resume(value)
}

function syncPrintlnHandler(ctx: EffectContext): void {
  const value = ctx.args[0]
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  window.alert(text)
  ctx.resume(value as Any)
}

function syncPrintHandler(ctx: EffectContext): void {
  const value = ctx.args[0]
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  appendOutput(text, 'output')
  ctx.resume(value as Any)
}

function syncDefaultEffectHandler(ctx: EffectContext): void {
  if (ctx.effectName === 'dvala.checkpoint') {
    ctx.next()
    return
  }
  throw new Error(`Unhandled effect: ${ctx.effectName}`)
}

function syncDisabledHandlersFallback(ctx: EffectContext): void {
  throw new Error(`Unhandled effect (playground handlers disabled): ${ctx.effectName}`)
}

function getSyncEffectHandlers(): HandlerRegistration[] {
  if (getState('disable-playground-handlers')) {
    return [
      { pattern: '*', handler: syncDisabledHandlersFallback },
    ]
  }
  return [
    { pattern: 'dvala.io.pick', handler: syncIoPickHandler },
    { pattern: 'dvala.io.confirm', handler: syncIoConfirmHandler },
    { pattern: 'dvala.io.read-line', handler: syncReadlineHandler },
    { pattern: 'dvala.io.println', handler: syncPrintlnHandler },
    { pattern: 'dvala.io.print', handler: syncPrintHandler },
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

    // With playground handlers disabled, only use context-defined handlers and a basic fallback
    if (getState('disable-playground-handlers')) {
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
    if (!hasPattern('dvala.io.read-line'))
      effectHandlers.push({ pattern: 'dvala.io.read-line', handler: readlineHandler })
    if (!hasPattern('dvala.io.println'))
      effectHandlers.push({ pattern: 'dvala.io.println', handler: printlnHandler })
    if (!hasPattern('dvala.io.print'))
      effectHandlers.push({ pattern: 'dvala.io.print', handler: printHandler })
    if (!hasPattern('*'))
      effectHandlers.push({ pattern: '*', handler: defaultEffectHandler })

    return {
      bindings,
      effectHandlers,
    }
  } catch (err) {
    appendOutput(`Error: ${(err as Error).message}\nCould not parse context:\n${contextString}`, 'error')
    const fallback = getState('disable-playground-handlers') ? disabledHandlersFallback : defaultEffectHandler
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
    elements.dvalaTextArea.scrollTop = getState('dvala-code-scroll-top')
    elements.outputResult.scrollTop = getState('output-scroll-top')
  }, 0)
}

function updateCSS() {
  const debug = getState('debug')
  elements.dvalaPanelDebugInfo.style.display = debug ? 'flex' : 'none'

  const debugToggle = document.getElementById('settings-debug-toggle') as HTMLInputElement | null
  if (debugToggle)
    debugToggle.checked = debug
  const pureToggle = document.getElementById('settings-pure-toggle') as HTMLInputElement | null
  if (pureToggle)
    pureToggle.checked = getState('pure')
  const pure = getState('pure')
  const disableHandlers = getState('disable-playground-handlers')
  const disabled = pure
  const checkpointDisabled = disabled || disableHandlers
  const interceptErrorToggle = document.getElementById('settings-intercept-error-toggle') as HTMLInputElement | null
  if (interceptErrorToggle) {
    interceptErrorToggle.checked = !checkpointDisabled && getState('intercept-error')
    interceptErrorToggle.disabled = checkpointDisabled
    interceptErrorToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', checkpointDisabled)
    interceptErrorToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', checkpointDisabled)
  }
  const checkpointToggle = document.getElementById('settings-checkpoint-toggle') as HTMLInputElement | null
  if (checkpointToggle) {
    checkpointToggle.checked = !checkpointDisabled && getState('intercept-checkpoint')
    checkpointToggle.disabled = checkpointDisabled
    checkpointToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', checkpointDisabled)
    checkpointToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', checkpointDisabled)
  }
  const disableHandlersToggle = document.getElementById('settings-disable-handlers-toggle') as HTMLInputElement | null
  if (disableHandlersToggle) {
    disableHandlersToggle.checked = !disabled && disableHandlers
    disableHandlersToggle.disabled = disabled
    disableHandlersToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', disabled)
    disableHandlersToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', disabled)
  }
  const autoCheckpointToggle = document.getElementById('settings-auto-checkpoint-toggle') as HTMLInputElement | null
  if (autoCheckpointToggle) {
    // Checkbox is "Disable auto checkpoint" so checked = disabled
    autoCheckpointToggle.checked = !disabled && getState('disable-auto-checkpoint')
    autoCheckpointToggle.disabled = disabled
    autoCheckpointToggle.closest('.settings-toggle')?.classList.toggle('settings-toggle-disabled', disabled)
    autoCheckpointToggle.closest('[class]')?.closest('[class]')?.classList.toggle('settings-toggle-row-disabled', disabled)
  }

  elements.dvalaCodeTitle.style.color = (getState('focused-panel') === 'dvala-code') ? 'white' : ''
  const currentProgramId = getState('current-program-id')
  const currentProgram = currentProgramId ? getSavedPrograms().find(p => p.id === currentProgramId) : null
  elements.dvalaCodeTitleString.textContent = currentProgram ? currentProgram.name : 'Untitled Program'
  elements.dvalaCodePendingIndicator.style.display = autoSaveTimer !== null ? 'inline-block' : 'none'
  elements.contextTitle.style.color = (getState('focused-panel') === 'context') ? 'white' : ''

}

export function showPage(id: string, scroll: 'smooth' | 'instant' | 'none', historyEvent: 'replace' | 'push' | 'none' = 'push', tab?: string) {
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
    if (id === 'settings-page') {
      tab = tab || 'dvala'
      showSettingsTab(tab)
    }
    if (id === 'saved-programs-page') {
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

      if (scroll !== 'none')
        link.scrollIntoView({ block: 'center', behavior: scroll })
    }

    if (id === 'index')
      history.replaceState(null, 'Dvala', window.location.pathname + window.location.search)

    else if (historyEvent === 'replace')
      history.replaceState(null, '', `#${id}${tab ? `/${tab}` : ''}`)

    else if (historyEvent !== 'none')
      history.pushState(null, '', `#${id}${tab ? `/${tab}` : ''}`)
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
  showToast('Example loaded in editor')
  saveState({ 'focused-panel': 'dvala-code' })
  applyState()
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
/*${'*'.repeat(size)}**
 *${' '.repeat(paddingLeft)}${name}${' '.repeat(paddingRight)} *
 *${'*'.repeat(size)}**/

${code}
`.trimStart(), true, 'top')
  saveState({ 'focused-panel': 'dvala-code' })
  applyState()
  showToast(`Example loaded: ${name}`)
}

export function loadCode(code: string) {
  setDvalaCode(code, true, 'top')
  saveState({ 'focused-panel': 'dvala-code' })
  applyState()
  showToast('Code loaded')
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
