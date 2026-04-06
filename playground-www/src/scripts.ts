/* eslint-disable no-console */
import { stringifyValue } from '../../common/utils'
import type { Example } from '../../reference/examples'
import { getLinkName } from '../../reference'
import type { Any, UnknownRecord } from '../../src/interface'
import type { Ast } from '../../src/parser/types'
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
import { createAstTreeViewer } from './components/astTreeViewer'
import { closeSearch, handleSearchKeyDown, initSearchDialog, onSearchClose } from './components/searchDialog'
import type { EditorMenuItem } from './editorMenu'
import { renderEditorMenu } from './editorMenu'
import { addIcon, copyIcon, downloadIcon, hamburgerIcon, saveIcon, shareIcon } from './icons'
import { renderCodeBlock } from './renderCodeBlock'
import { renderShell } from './shell'
import * as router from './router'
import { renderDocPage } from './components/docPage'
import { renderExampleDetailPage, renderExampleIndexPage } from './components/examplePage'
import { getRefEntries, REF_SECTIONS, renderReferenceIndexPage, renderReferenceModulePage, renderReferenceSectionPage } from './components/referencePage'
import type { RefEntry } from './components/referencePage'
import { getFeatureCard, renderStartPage } from './components/startPage'
import { renderDvalaMarkdown } from './renderDvalaMarkdown'
import { renderBookIndexPage, renderChapterPage, allChapters, bookSections } from './components/chapterPage'
import { toggleSearchDropdown } from './components/searchDropdown'
import type { SearchResult } from './components/searchDropdown'
import { toggleTocDropdown } from './components/tocDropdown'
import type { TocItem } from './components/tocDropdown'
import { slugifyHeading } from './renderDvalaMarkdown'
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
  DVALA_FILE_SUFFIX,
  clearAllFiles,
  getSavedFiles,
  initFiles,
  normalizeSavedFileName,
  setSavedFiles,
  stripSavedFileSuffix,
} from './fileStorage'
import type { SavedFile } from './fileStorage'
import {
  clearAllFileHistories,
  deleteFileHistory,
  getFileHistory,
  initFileHistories,
  pruneFileHistories,
  setFileHistory,
} from './fileHistoryStorage'
import {
  applyEncodedState,
  clearAllStates,
  clearState,
  defaultState,
  encodeState,
  getState,
  saveState,
  updateState,
} from './state'
import type { HistoryEntry, HistoryStatus } from './StateHistory'
import { StateHistory } from './StateHistory'
import { decodeSnapshot, encodeSnapshot } from './snapshotUtils'
import { SyntaxOverlay } from './SyntaxOverlay'
import { isMac, throttle } from './utils'
import { createPlaygroundAPI } from './playgroundAPI'
import { createEffectHandlers } from './createEffectHandlers'

const dvalaDebug = createDvala({ debug: true, modules: allBuiltinModules })
const dvalaNoDebug = createDvala({ debug: false, modules: allBuiltinModules })
const getDvala = (forceDebug?: 'debug') => forceDebug || getState('debug') ? dvalaDebug : dvalaNoDebug
const MAX_FILE_HISTORY_STEPS = 99
const CONTEXT_UI_STATE_KEY = '__playground'
const dvalaCodeHistory = new StateHistory(createDvalaCodeHistoryEntryFromState(), syncDvalaCodeHistoryButtons, MAX_FILE_HISTORY_STEPS)
let activeDvalaCodeHistoryFileId: string | null = null
let closeEditorMenuListener: ((event: MouseEvent) => void) | null = null

function createDvalaCodeHistoryEntryFromState(): HistoryEntry {
  return {
    text: getState('dvala-code'),
    selectionStart: getState('dvala-code-selection-start'),
    selectionEnd: getState('dvala-code-selection-end'),
  }
}

function isCurrentFileLocked(): boolean {
  const currentFileId = getState('current-file-id')
  return currentFileId !== null && getSavedFiles().some(file => file.id === currentFileId && file.locked)
}

function syncDvalaCodeHistoryButtons(status: HistoryStatus = dvalaCodeHistory.getStatus()) {
  const isLocked = isCurrentFileLocked()
  elements.dvalaCodeUndoButton.classList.toggle('disabled', isLocked || !status.canUndo)
  elements.dvalaCodeRedoButton.classList.toggle('disabled', isLocked || !status.canRedo)
}

function persistActiveDvalaCodeHistory() {
  if (activeDvalaCodeHistoryFileId)
    setFileHistory(activeDvalaCodeHistoryFileId, dvalaCodeHistory.serialize())
}

function switchDvalaCodeHistory(fileId: string | null, initialEntry = createDvalaCodeHistoryEntryFromState(), reset = false) {
  persistActiveDvalaCodeHistory()
  // Scratch has no file ID but still gets its history persisted under '<scratch>'
  const effectiveId = fileId ?? '<scratch>'
  activeDvalaCodeHistoryFileId = effectiveId

  const persistedHistory = reset ? undefined : getFileHistory(effectiveId)
  if (persistedHistory) {
    dvalaCodeHistory.hydrate(persistedHistory, initialEntry)
  } else {
    dvalaCodeHistory.reset(initialEntry)
    persistActiveDvalaCodeHistory()
  }
}

function pushActiveDvalaCodeHistoryEntry() {
  dvalaCodeHistory.push(createDvalaCodeHistoryEntryFromState())
  persistActiveDvalaCodeHistory()
}

function activateCurrentFileHistory(reset = false) {
  switchDvalaCodeHistory(getState('current-file-id'), createDvalaCodeHistoryEntryFromState(), reset)
}

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
        updateContextState(json, false)
      },
      getSavedFiles: () => getSavedFiles(),
      saveFile: (name, code) => {
        const files = getSavedFiles()
        const normalizedName = normalizeSavedFileName(name)
        const existing = files.find(entry => entry.name === normalizedName)
        const now = Date.now()
        if (existing) {
          existing.code = code
          existing.updatedAt = now
          setSavedFiles([...files])
        } else {
          const createdFile: SavedFile = {
            id: crypto.randomUUID(),
            name: normalizedName,
            code,
            context: '',
            createdAt: now,
            updatedAt: now,
            locked: false,
          }
          setSavedFiles([createdFile, ...files])
        }
      },
      runCode: async code => {
        const result = await getDvala().runAsync(code, { bindings: {}, effectHandlers: [], pure: false })
        if (result.type === 'error') throw result.error
        if (result.type === 'suspended') throw new Error('File suspended')
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
  get mainPanel() { return document.getElementById('main-panel') as HTMLElement },
  get dvalaPanel() { return document.getElementById('dvala-panel') as HTMLElement },
  get outputPanel() { return document.getElementById('output-panel') as HTMLElement },
  get moreMenu() { return document.getElementById('more-menu') as HTMLElement },
  get filesHeaderMenu() { return document.getElementById('files-header-menu') as HTMLElement },
  get addContextMenu() { return document.getElementById('add-context-menu') as HTMLElement },
  get newContextName() { return document.getElementById('new-context-name') as HTMLInputElement },
  get newContextValue() { return document.getElementById('new-context-value') as HTMLTextAreaElement },
  get newContextError() { return document.getElementById('new-context-error') as HTMLSpanElement },
  get contextTextArea() { return document.getElementById('context-textarea') as HTMLTextAreaElement },
  get contextEntryList() { return document.getElementById('context-entry-list') as HTMLDivElement },
  get contextDetailView() { return document.getElementById('context-detail-view') as HTMLDivElement },
  get contextDetailTextArea() { return document.getElementById('context-detail-textarea') as HTMLTextAreaElement },
  get outputResult() { return document.getElementById('output-result') as HTMLElement },
  get dvalaTextArea() { return document.getElementById('dvala-textarea') as HTMLTextAreaElement },
  get resizeDevider1() { return document.getElementById('resize-divider-1') as HTMLElement },
  get resizeDevider2() { return document.getElementById('resize-divider-2') as HTMLElement },
  get dvalaPanelDebugInfo() { return document.getElementById('dvala-panel-debug-info') as HTMLDivElement },
  get contextUndoButton() { return document.getElementById('context-undo-button') as HTMLAnchorElement },
  get contextRedoButton() { return document.getElementById('context-redo-button') as HTMLAnchorElement },
  get dvalaCodeUndoButton() { return document.getElementById('dvala-code-undo-button') as HTMLAnchorElement },
  get dvalaCodeRedoButton() { return document.getElementById('dvala-code-redo-button') as HTMLAnchorElement },
  get editorToolbarTitle() { return document.getElementById('editor-toolbar-title') as HTMLSpanElement },
  get contextTitle() { return document.getElementById('context-title') as HTMLDivElement },
  get dvalaCodeTitle() { return document.getElementById('dvala-code-title') as HTMLDivElement },
  get dvalaCodeTitleString() { return document.getElementById('dvala-code-title-string') as HTMLSpanElement },
  get dvalaCodeTitleInput() { return document.getElementById('dvala-code-title-input') as HTMLInputElement },
  get dvalaCodePendingIndicator() { return document.getElementById('dvala-code-pending-indicator') as HTMLSpanElement },
  get dvalaCodeLockedIndicator() { return document.getElementById('dvala-code-locked-indicator') as HTMLSpanElement },
  get saveScratchButton() { return document.getElementById('save-scratch-btn') as HTMLAnchorElement },
  get snapshotModal() { return document.getElementById('snapshot-modal') as HTMLDivElement },
  get snapshotPanelContainer() { return document.getElementById('snapshot-panel-container') as HTMLDivElement },
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
  get importOptSavedFiles() { return document.getElementById('import-opt-saved-files') as HTMLInputElement },
  get importOptSavedFilesLabel() { return document.getElementById('import-opt-saved-files-label') as HTMLLabelElement },
  get importResultModal() { return document.getElementById('import-result-modal') as HTMLDivElement },
  get importResultContent() { return document.getElementById('import-result-content') as HTMLDivElement },
  get exportModal() { return document.getElementById('export-modal') as HTMLDivElement },
  get exportOptCode() { return document.getElementById('export-opt-code') as HTMLInputElement },
  get exportOptContext() { return document.getElementById('export-opt-context') as HTMLInputElement },
  get exportOptSettings() { return document.getElementById('export-opt-settings') as HTMLInputElement },
  get exportOptSavedSnapshots() { return document.getElementById('export-opt-saved-snapshots') as HTMLInputElement },
  get exportOptRecentSnapshots() { return document.getElementById('export-opt-recent-snapshots') as HTMLInputElement },
  get exportOptLayout() { return document.getElementById('export-opt-layout') as HTMLInputElement },
  get exportOptSavedFiles() { return document.getElementById('export-opt-saved-files') as HTMLInputElement },
  get toastContainer() { return document.getElementById('toast-container') as HTMLDivElement },
  get executionControlBar() { return document.getElementById('execution-control-bar') as HTMLDivElement },
  get executionStatus() { return document.getElementById('execution-status') as HTMLSpanElement },
  get execPlayBtn() { return document.getElementById('exec-play-btn') as HTMLButtonElement },
  get execPauseBtn() { return document.getElementById('exec-pause-btn') as HTMLButtonElement },
  get execStopBtn() { return document.getElementById('exec-stop-btn') as HTMLButtonElement },
}

type MoveParams = {
  id: 'resize-divider-1'
  startMoveX: number
  percentBeforeMove: number
} | {
  id: 'resize-divider-2'
  startMoveY: number
  percentBeforeMove: number
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
let snapshotExecutionControlsVisible = false
let activeContextEntryKind: ContextEntryKind = getState('current-context-entry-kind')
let activeContextBindingName: string | null = getState('current-context-binding-name')
let isSyncingContextDetail = false
let contextDetailHasParseError = false
const modalStack: { panel: HTMLElement; label: string; icon?: string; snapshot: Snapshot | null; isEffect?: boolean }[] = []
let overlayCloseAnimation: Animation | null = null

// Toast hint for effect modals that can't be dismissed with Escape
const EFFECT_MODAL_ESCAPE_HINT = 'Escape not supported here'
type ContextEntryKind = 'binding' | 'effect-handler'
type ContextUiSectionKey = 'bindings' | 'effectHandlers'
type StoredContextEffectHandler = { pattern: string; handler: unknown }

const CONTEXT_EFFECT_HANDLERS_KEY = 'effectHandlers'
const DEFAULT_CONTEXT_EFFECT_HANDLER_SOURCE = `async ({ resume }) => {
  resume(null);
}`

function calculateDimensions() {
  return {
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
  }
}

export function openMoreMenu(triggerEl?: HTMLElement) {
  if (!triggerEl) return
  toggleEditorMenu('more-menu', triggerEl)
}

export function closeMoreMenu() {
  closeAllEditorMenus()
}

export function openFilesHeaderMenu(triggerEl: HTMLElement) {
  toggleEditorMenu('files-header-menu', triggerEl)
}

export function closeFilesHeaderMenu() {
  closeAllEditorMenus()
}

export function openSnapshotsHeaderMenu(triggerEl: HTMLElement) {
  toggleEditorMenu('snapshots-header-menu', triggerEl)
}

export function closeSnapshotsHeaderMenu() {
  closeAllEditorMenus()
}

function positionEditorMenu(menu: HTMLElement, triggerEl: HTMLElement, offsetY = 0) {
  const rect = triggerEl.getBoundingClientRect()
  menu.style.position = 'fixed'
  menu.style.top = `${rect.bottom + offsetY}px`
  menu.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`
  menu.style.left = 'auto'
}

function closeAllEditorMenus() {
  document.querySelectorAll('.editor-menu').forEach(el => {
    (el as HTMLElement).style.display = 'none'
  })
  if (closeEditorMenuListener) {
    document.removeEventListener('click', closeEditorMenuListener)
    closeEditorMenuListener = null
  }
}

function toggleEditorMenu(menuId: string, triggerEl: HTMLElement, offsetY = 0) {
  const menu = document.getElementById(menuId)
  if (!menu) return

  const isOpen = menu.style.display === 'block'
  closeAllEditorMenus()
  if (isOpen) return

  positionEditorMenu(menu, triggerEl, offsetY)
  menu.style.display = 'block'
  closeEditorMenuListener = event => {
    const target = event.target as Node | null
    if (!target || (!menu.contains(target) && !triggerEl.contains(target)))
      closeAllEditorMenus()
  }

  setTimeout(() => {
    if (closeEditorMenuListener)
      document.addEventListener('click', closeEditorMenuListener)
  }, 0)
}

export function toggleTocMenu(event: Event): void {
  event.stopPropagation()
  const currentChapterId = router.currentPath().replace(/^\/book\//, '')
  const currentHash = location.hash.replace(/^#/, '')

  toggleTocDropdown(event.currentTarget as HTMLElement, {
    id: 'chapter-toc-dropdown',
    overview: { label: 'Overview', onSelect: () => router.navigate('/book') },
    sections: bookSections.map(section => ({
      title: section.name,
      items: section.entries.flatMap(entry => {
        const isActiveChapter = entry.id === currentChapterId
        const chapterItem: TocItem = {
          label: entry.title,
          active: isActiveChapter && !currentHash,
          onSelect: () => router.navigate(`/book/${entry.id}`),
        }
        const h2s = [...entry.raw.matchAll(/^##\s+(.+)$/gm)]
        const subItems: TocItem[] = h2s.map(m => {
          const text = m[1]!.trim()
          const slug = slugifyHeading(text)
          return {
            label: text,
            type: 'subitem' as const,
            active: isActiveChapter && currentHash === slug,
            onSelect: () => {
              const alreadyOnChapter = router.currentPath() === `/book/${entry.id}`
              if (!alreadyOnChapter) router.navigate(`/book/${entry.id}`)
              setTimeout(() => {
                const el = document.getElementById(slug)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' })
                  history.replaceState(null, '', `${location.pathname}#${slug}`)
                }
              }, alreadyOnChapter ? 0 : 80)
            },
          }
        })
        return [chapterItem, ...subItems]
      }),
    })),
  })
}

// Build a flat search index from all chapters, h2 headings, prose paragraphs, and code blocks.
// This is computed once lazily so it doesn't block startup.
interface BookSearchEntry {
  type: 'chapter' | 'section' | 'content' | 'code'
  label: string // primary display text
  context: string // secondary line (breadcrumb)
  snippet: string // full text for matching (may be longer than label)
  chapterId: string
  hash: string // '' for chapter hits, slug for section/content/code hits
}

// Walk raw markdown and yield prose paragraphs and code blocks grouped by nearest h2.
// Prose is cleaned of markdown syntax; code is kept verbatim for exact-match searching.
function extractContentBlocks(raw: string): { hash: string; text: string; isCode: boolean }[] {
  const out: { hash: string; text: string; isCode: boolean }[] = []
  let currentHash = ''
  let inCode = false
  let buf = ''

  const flushProse = () => {
    const clean = buf.replace(/[*_`[\]()!]/g, '').replace(/\s+/g, ' ').trim()
    if (clean.length > 30) out.push({ hash: currentHash, text: clean, isCode: false })
    buf = ''
  }

  for (const line of raw.split('\n')) {
    if (/^```/.test(line)) {
      if (!inCode) {
        // Entering code block — flush pending prose first
        flushProse()
        inCode = true
      } else {
        // Exiting code block — save the code content
        const code = buf.trim()
        if (code.length > 10) out.push({ hash: currentHash, text: code, isCode: true })
        buf = ''
        inCode = false
      }
      continue
    }
    if (inCode) { buf += (buf ? '\n' : '') + line; continue }
    // Update current section anchor on h2
    if (/^##\s/.test(line)) {
      flushProse()
      currentHash = slugifyHeading(line.replace(/^##\s+/, '').trim())
      continue
    }
    if (/^#+\s/.test(line)) continue
    if (line.trim() === '') { flushProse() } else { buf += (buf ? ' ' : '') + line }
  }
  // Flush any trailing buffer
  if (inCode) { const code = buf.trim(); if (code.length > 10) out.push({ hash: currentHash, text: code, isCode: true }) } else flushProse()
  return out
}

let _bookSearchIndex: BookSearchEntry[] | null = null
function getBookSearchIndex(): BookSearchEntry[] {
  if (_bookSearchIndex) return _bookSearchIndex
  _bookSearchIndex = []
  for (const section of bookSections) {
    for (const entry of section.entries) {
      _bookSearchIndex.push({ type: 'chapter', label: entry.title, context: section.name, snippet: '', chapterId: entry.id, hash: '' })
      for (const m of entry.raw.matchAll(/^##\s+(.+)$/gm)) {
        const text = m[1]!.trim()
        _bookSearchIndex.push({ type: 'section', label: text, context: entry.title, snippet: '', chapterId: entry.id, hash: slugifyHeading(text) })
      }
      // Index prose and code blocks at lower priority
      for (const { hash, text, isCode } of extractContentBlocks(entry.raw)) {
        const type = isCode ? 'code' : 'content'
        const label = text.length > 80 ? `${text.slice(0, 80)}…` : text
        _bookSearchIndex.push({ type, label, context: entry.title, snippet: text, chapterId: entry.id, hash })
      }
    }
  }
  return _bookSearchIndex
}

// ─── Unified cross-domain search ───────────────────────────────────────────────
//
// All search dropdowns (Book, Examples, Reference) use a single unified search
// that returns results from the current domain first, then progressively
// discloses results from other domains.

/** A search hit with a navigation path, used across all domains. */
interface UnifiedHit {
  path: string
  domain: string
  /** Stashed book entry for hash-scroll navigation. */
  bookEntry?: BookSearchEntry
}

/** Extract a short snippet around the first match of `q` in `text`. */
function extractSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return ''
  const lineStart = text.lastIndexOf('\n', idx) + 1
  const lineEnd = text.indexOf('\n', idx)
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim()
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

/** Cached map from reference title → concatenated example code. */
let refExampleCodeCache: Map<string, string> | null = null
let refExampleCodeDataRef: typeof window.referenceData = undefined

function getRefExampleCode(entry: RefEntry): string {
  const data = window.referenceData
  if (!data) return ''
  // Rebuild cache if data changed
  if (refExampleCodeDataRef !== data) {
    refExampleCodeDataRef = data
    refExampleCodeCache = new Map()
    const allRefs = { ...data.api, ...data.modules, ...data.effects, ...playgroundEffectReference }
    for (const ref of Object.values(allRefs)) {
      const code = ref.examples.map((ex: string | { code: string }) => typeof ex === 'string' ? ex : ex.code).join('\n')
      refExampleCodeCache.set(ref.title, code)
    }
  }
  return refExampleCodeCache!.get(entry.title) ?? ''
}

/** Determine the current domain from the URL path. */
function getCurrentDomain(): string {
  const path = router.currentPath()
  if (path.startsWith('/book')) return 'book'
  if (path.startsWith('/examples')) return 'examples'
  if (path.startsWith('/ref')) return 'reference'
  return ''
}

// Pre-lowercased search indices — built lazily, rebuilt if data changes

interface BookSearchCache { labelLower: string; contextLower: string; snippetLower: string; entry: BookSearchEntry }
let bookSearchCache: BookSearchCache[] | null = null

function getBookSearchCache(): BookSearchCache[] {
  if (!bookSearchCache) {
    bookSearchCache = getBookSearchIndex().map(e => ({
      labelLower: e.label.toLowerCase(),
      contextLower: e.context.toLowerCase(),
      snippetLower: (e.snippet ?? '').toLowerCase(),
      entry: e,
    }))
  }
  return bookSearchCache
}

interface ExampleSearchCache { nameLower: string; codeLower: string; ex: Example }
let exampleSearchCache: ExampleSearchCache[] | null = null
let exampleSearchDataRef: typeof window.referenceData = undefined

function getExampleSearchCache(): ExampleSearchCache[] {
  const data = window.referenceData
  if (data !== exampleSearchDataRef || !exampleSearchCache) {
    exampleSearchDataRef = data
    exampleSearchCache = (data?.examples ?? []).map(ex => ({
      nameLower: `${ex.name} ${ex.description} ${ex.category}`.toLowerCase(),
      codeLower: ex.code.toLowerCase(),
      ex,
    }))
  }
  return exampleSearchCache
}

interface RefSearchCache { textLower: string; codeLower: string; entry: RefEntry }
let refSearchCache: RefSearchCache[] | null = null
let refSearchDataRef: typeof window.referenceData = undefined

function getRefSearchCache(): RefSearchCache[] {
  const data = window.referenceData
  if (data !== refSearchDataRef || !refSearchCache) {
    refSearchDataRef = data
    if (!data) { refSearchCache = []; return refSearchCache }
    const entries = getRefEntries(data)
    refSearchCache = entries.map(e => ({
      textLower: `${e.title} ${e.description} ${e.group}`.toLowerCase(),
      codeLower: getRefExampleCode(e).toLowerCase(),
      entry: e,
    }))
  }
  return refSearchCache
}

// Cap for secondary (code) results per domain to avoid scanning all entries
const MAX_SECONDARY = 8

/** Search the Book domain. */
function searchBook(q: string): { priority: SearchResult<UnifiedHit>[]; secondary: SearchResult<UnifiedHit>[] } {
  const cache = getBookSearchCache()
  const priority: SearchResult<UnifiedHit>[] = []
  const secondary: SearchResult<UnifiedHit>[] = []
  for (const c of cache) {
    const e = c.entry
    if (e.type === 'chapter' || e.type === 'section') {
      if (c.labelLower.includes(q) || c.contextLower.includes(q)) {
        priority.push({
          data: { path: `/book/${e.chapterId}`, domain: 'book', bookEntry: e } satisfies UnifiedHit,
          label: e.label, context: e.context,
          modifier: e.type === 'section' ? 'section' as const : undefined,
        })
      }
    } else if (secondary.length < MAX_SECONDARY) {
      if (c.snippetLower.includes(q) || c.labelLower.includes(q)) {
        secondary.push({
          data: { path: `/book/${e.chapterId}`, domain: 'book', bookEntry: e } satisfies UnifiedHit,
          label: e.label, context: e.context,
          modifier: e.type === 'code' ? 'code' : 'content',
        })
      }
    }
  }
  return { priority, secondary }
}

/** Search the Examples domain. */
function searchExamples(q: string): { priority: SearchResult<UnifiedHit>[]; secondary: SearchResult<UnifiedHit>[] } {
  const cache = getExampleSearchCache()
  const priority: SearchResult<UnifiedHit>[] = []
  const secondary: SearchResult<UnifiedHit>[] = []
  for (const c of cache) {
    const ex = c.ex
    if (c.nameLower.includes(q)) {
      priority.push({ data: { path: `/examples/${ex.id}`, domain: 'examples' }, label: ex.name, context: ex.category })
    }
    if (secondary.length < MAX_SECONDARY && c.codeLower.includes(q)) {
      secondary.push({ data: { path: `/examples/${ex.id}`, domain: 'examples' }, label: extractSnippet(ex.code, q), context: ex.name, modifier: 'code' })
    }
  }
  return { priority, secondary }
}

/** Search the Reference domain. */
function searchReference(q: string): { priority: SearchResult<UnifiedHit>[]; secondary: SearchResult<UnifiedHit>[] } {
  const cache = getRefSearchCache()
  const priority: SearchResult<UnifiedHit>[] = []
  const secondary: SearchResult<UnifiedHit>[] = []
  for (const c of cache) {
    const e = c.entry
    if (c.textLower.includes(q)) {
      priority.push({ data: { path: `/ref/${e.linkName}`, domain: 'reference' }, label: e.title, context: `${e.section} › ${e.group}` })
    }
    if (secondary.length < MAX_SECONDARY && c.codeLower.includes(q)) {
      secondary.push({ data: { path: `/ref/${e.linkName}`, domain: 'reference' }, label: extractSnippet(getRefExampleCode(e), q), context: e.title, modifier: 'code' })
    }
  }
  return { priority, secondary }
}

const DOMAIN_LABELS: Record<string, string> = {
  book: 'The Book',
  examples: 'Examples',
  reference: 'Reference',
}

/** Run a unified search across all domains, prioritizing the current one. */
function unifiedSearch(q: string): { results: SearchResult<UnifiedHit>[]; label?: string }[] {
  const currentDomain = getCurrentDomain()
  const domains = [
    { id: 'book', search: searchBook },
    { id: 'examples', search: searchExamples },
    { id: 'reference', search: searchReference },
  ]

  // Current domain first, then others
  const local = domains.find(d => d.id === currentDomain)
  const others = domains.filter(d => d.id !== currentDomain)

  const groups: { results: SearchResult<UnifiedHit>[]; label?: string }[] = []

  // Local domain results (no label)
  if (local) {
    const { priority, secondary } = local.search(q)
    groups.push({ results: priority.slice(0, 14) })
    groups.push({ results: secondary.slice(0, Math.max(0, 8 - priority.length)) })
  }

  // Other domain results with labels
  const localTotal = groups.reduce((sum, g) => sum + g.results.length, 0)
  let remainingCap = Math.max(0, 14 - localTotal)

  for (const other of others) {
    if (remainingCap <= 0) break
    const { priority, secondary } = other.search(q)
    const hits = [...priority.slice(0, remainingCap)]
    const codeSlots = Math.max(0, Math.min(remainingCap - hits.length, 4))
    if (codeSlots > 0) hits.push(...secondary.slice(0, codeSlots))
    if (hits.length > 0) {
      const prefix = localTotal > 0 ? 'Also in' : 'Found in'
      groups.push({ results: hits, label: `${prefix} ${DOMAIN_LABELS[other.id] ?? other.id}` })
      remainingCap -= hits.length
    }
  }

  return groups
}

/** Navigate to a unified search hit, handling book hash scrolling. */
function navigateToHit(hit: UnifiedHit): void {
  if (hit.bookEntry?.hash) {
    const alreadyOnChapter = router.currentPath() === `/book/${hit.bookEntry.chapterId}`
    if (!alreadyOnChapter) router.navigate(`/book/${hit.bookEntry.chapterId}`)
    setTimeout(() => {
      const el = document.getElementById(hit.bookEntry!.hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        history.replaceState(null, '', `${location.pathname}#${hit.bookEntry!.hash}`)
      }
    }, alreadyOnChapter ? 0 : 80)
    return
  }
  router.navigate(hit.path)
}

export function toggleBookSearch(event: Event): void {
  event.stopPropagation()
  document.getElementById('chapter-toc-dropdown')?.remove()
  openUnifiedSearch(event.currentTarget as HTMLElement)
}

export function toggleExampleSearch(event: Event): void {
  event.stopPropagation()
  openUnifiedSearch(event.currentTarget as HTMLElement)
}

export function toggleRefSearch(event: Event): void {
  event.stopPropagation()
  openUnifiedSearch(event.currentTarget as HTMLElement)
}

function openUnifiedSearch(btn: HTMLElement): void {
  toggleSearchDropdown<UnifiedHit>(btn, {
    id: 'unified-search-dropdown',
    placeholder: 'Search…',
    search: (query: string) => unifiedSearch(query.toLowerCase()),
    onSelect: (hit: UnifiedHit) => navigateToHit(hit),
  })
}

// ─── Reference TOC menu ────────────────────────────────────────────────────────

export function toggleRefTocMenu(event: Event): void {
  event.stopPropagation()
  const data = window.referenceData
  if (!data) return

  const allEntries = getRefEntries(data)
  const path = router.currentPath()
  const currentSubPath = path.startsWith('/ref/') ? path.slice('/ref/'.length) : ''

  // Build TOC: sections with their groups only — no individual leaf entries
  const tocSections = REF_SECTIONS.map(section => {
    const sectionEntries = allEntries.filter(e => e.section === section.id)

    // Collect unique groups
    const groups = new Map<string, number>()
    for (const entry of sectionEntries) {
      groups.set(entry.group, (groups.get(entry.group) ?? 0) + 1)
    }

    // For modules: each group links to /ref/modules/:name
    // For others: groups link to the section page
    const items: TocItem[] = Array.from(groups.entries()).map(([groupName]) => {
      const groupPath = section.id === 'modules' ? `/ref/modules/${groupName}` : `/ref/${section.id}`
      const isActive = section.id === 'modules'
        ? currentSubPath === `modules/${groupName}`
        : currentSubPath === section.id
      return {
        label: groupName,
        type: 'subitem' as const,
        active: isActive,
        onSelect: () => router.navigate(groupPath),
      }
    })

    return { title: section.title, items }
  })

  toggleTocDropdown(event.currentTarget as HTMLElement, {
    id: 'ref-toc-dropdown',
    overview: { label: 'Overview', onSelect: () => router.navigate('/ref') },
    sections: tocSections,
  })
}

export function showBookPage() {
  router.navigate('/book')
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
  edit: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="m3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/><path fill="currentColor" d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83l3.75 3.75z"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.06L1.87 20.5c-.38.65.09 1.5.87 1.5h18.52c.78 0 1.25-.85.87-1.5zm0 4.69c.41 0 .75.34.75.75v5.5a.75.75 0 0 1-1.5 0V8.5c0-.41.34-.75.75-.75m0 10.5a1 1 0 1 1 0-2a1 1 0 0 1 0 2"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66a2.92 2.92 0 1 0 2.92-2.92"/></svg>',
}

export function closeContextMenu(): void {
  closeAllEditorMenus()
}

// Prevent all href="#" anchors from scrolling to top / navigating.
// Uses capture phase so it fires before onclick handlers and before
// the browser processes the default action.
document.addEventListener('click', e => {
  const anchor = e.composedPath().find(el => el instanceof HTMLAnchorElement)
  if (anchor?.getAttribute('href') === '#')
    e.preventDefault()
}, true)

function getTerminalSnapshotLabel(index: number): string {
  const ordinals = ['Last', '2nd Last', '3rd Last']
  return `${ordinals[index] ?? `${index + 1}th Last`} Run`
}

function getSavedSnapshotLabel(entry: SavedSnapshot, index: number): string {
  return entry.name || `Snapshot ${index + 1}`
}

function getActiveSnapshotDetails(): { label: string; snapshot: Snapshot } | null {
  if (!activeSnapshotKey) return null

  if (activeSnapshotKey.startsWith('terminal:')) {
    const index = Number(activeSnapshotKey.slice('terminal:'.length))
    const entry = getTerminalSnapshots()[index]
    if (!entry) return null
    return { label: getTerminalSnapshotLabel(index), snapshot: entry.snapshot }
  }

  if (activeSnapshotKey.startsWith('saved:')) {
    const index = Number(activeSnapshotKey.slice('saved:'.length))
    const entry = getSavedSnapshots()[index]
    if (!entry) return null
    return { label: getSavedSnapshotLabel(entry, index), snapshot: entry.snapshot }
  }

  return null
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
  void options
  populateSideSnapshotsList()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Saved Files ──────────────────────────────────────────────────────────────

function animateFileCardRemoval(id: string): Promise<void> {
  const card = document.querySelector(`.snapshot-card[data-file-id="${id}"]`)
  if (!card) return Promise.resolve()
  return new Promise(resolve => {
    card.classList.add('removing')
    card.addEventListener('animationend', () => resolve(), { once: true })
    setTimeout(resolve, 300)
  })
}

function populateSavedFilesList(options: { animateNewId?: string } = {}) {
  void options
  populateExplorerFileList()
}

export function loadSavedFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  if (isScratchActive())
    persistScratchFromCurrentState()
  closeSnapshotViewIfNeeded()
  if (getState('current-file-id') === id) return
  cancelScratchEditedClear()
  flushPendingAutoSave()
  saveState({
    'dvala-code': file.code,
    'context': file.context,
    'current-file-id': file.id,
    'dvala-code-edited': false,
    'dvala-code-selection-start': 0,
    'dvala-code-selection-end': 0,
    'dvala-code-scroll-top': 0,
  }, false)
  activateCurrentFileHistory(false)
  elements.dvalaTextArea.value = file.code
  updateContextState(file.context, false)
  syntaxOverlay.update()
  syntaxOverlay.scrollContainer.scrollTo(0, 0)
  syncCodePanelView('files')
  syncPlaygroundUrlState('files')
  updateCSS()
  populateExplorerFileList()
  populateSavedFilesList()
}

// ─── Explorer panel (compact file list in editor tab) ────────────────────────

const SIDE_SNAPSHOTS_VISIBLE = 9
const SCRATCH_TITLE = '<scratch>'
let sideSnapshotsShowAll = false
// Track which snapshot is actively viewed in the code panel: 'terminal:0', 'saved:2', or null
let activeSnapshotKey: string | null = null

type SideTabId = 'files' | 'snapshots' | 'context'

function isScratchActive(): boolean {
  return getState('current-file-id') === null
}

function getScratchCode(): string {
  return isScratchActive() ? getState('dvala-code') : getState('scratch-code')
}

function getScratchContext(): string {
  return isScratchActive() ? getState('context') : getState('scratch-context')
}

function hasScratchContent(): boolean {
  return getScratchCode().trim().length > 0 || getScratchContext().trim().length > 0
}

function persistScratchFromCurrentState() {
  if (!isScratchActive()) return
  saveState({
    'scratch-code': getState('dvala-code'),
    'scratch-context': getState('context'),
  }, false)
}

function closeSnapshotViewIfNeeded() {
  if (snapshotViewStack.length === 0) return
  snapshotViewStack.splice(0)
  activeSnapshotKey = null
  currentSnapshot = null
  hideExecutionControlBar()
}

function openScratchInEditor(options: { code?: string; context?: string; toast?: string; focusCode?: boolean; navigateToPlayground?: boolean; force?: boolean } = {}) {
  // Guard: if loading new code into scratch and it already has content, confirm first.
  // The `force` flag skips this — used when the caller has already confirmed (e.g. clearScratch).
  if (!options.force && options.code !== undefined && hasScratchContent() && getState('dvala-code-edited')) {
    void showInfoModal('Overwrite scratch?', 'The scratch buffer has content. Discard it?', () => {
      openScratchInEditor({ ...options, force: true })
    })
    return
  }

  const code = options.code ?? getState('scratch-code')
  const context = options.context ?? getState('scratch-context')

  flushPendingAutoSave()

  saveState({
    'scratch-code': code,
    'scratch-context': context,
  }, false)

  closeSnapshotViewIfNeeded()

  saveState({
    'active-side-tab': 'files',
    context,
    'context-scroll-top': 0,
    'context-selection-start': 0,
    'context-selection-end': 0,
    'current-file-id': null,
    'dvala-code': code,
    'dvala-code-edited': false,
    'dvala-code-scroll-top': 0,
    'dvala-code-selection-start': 0,
    'dvala-code-selection-end': 0,
    'focused-panel': 'dvala-code',
  }, false)

  activateCurrentFileHistory(true)

  if (options.navigateToPlayground)
    router.navigate('/editor')

  syncPlaygroundUrlState('files')
  applyState()
  populateExplorerFileList()

  if (options.focusCode)
    focusDvalaCode()

  if (options.toast)
    showToast(options.toast)
}

function normalizeSideTab(tabId: string | null | undefined): SideTabId {
  if (tabId === 'snapshots' || tabId === 'context') return tabId
  return 'files'
}

function getActiveSnapshotUrlId(): string | null {
  if (!activeSnapshotKey) return null

  if (activeSnapshotKey.startsWith('terminal:')) {
    const index = Number(activeSnapshotKey.slice('terminal:'.length))
    return getTerminalSnapshots()[index]?.snapshot.id ?? null
  }

  if (activeSnapshotKey.startsWith('saved:')) {
    const index = Number(activeSnapshotKey.slice('saved:'.length))
    return getSavedSnapshots()[index]?.snapshot.id ?? null
  }

  return null
}

function syncPlaygroundUrlState(tabId: SideTabId) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', tabId)

  if (tabId === 'files' && getState('current-file-id'))
    url.searchParams.set('fileId', getState('current-file-id')!)
  else
    url.searchParams.delete('fileId')

  const snapshotId = tabId === 'snapshots' ? getActiveSnapshotUrlId() : null
  if (snapshotId)
    url.searchParams.set('snapshotId', snapshotId)
  else
    url.searchParams.delete('snapshotId')

  if (tabId === 'context' && activeContextBindingName)
    url.searchParams.set('bindingName', activeContextBindingName)
  else
    url.searchParams.delete('bindingName')

  if (tabId === 'context' && activeContextEntryKind === 'effect-handler')
    url.searchParams.set('contextEntryKind', 'effect-handler')
  else
    url.searchParams.delete('contextEntryKind')

  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

export function toggleSideSnapshotsShowAll() {
  sideSnapshotsShowAll = !sideSnapshotsShowAll
  populateSideSnapshotsList()
}

function populateSideSnapshotsList() {
  const list = document.getElementById('side-snapshots-list')
  if (!list) return

  const terminalEntries = getTerminalSnapshots()
  const savedEntries = getSavedSnapshots()

  if (terminalEntries.length === 0 && savedEntries.length === 0) {
    list.innerHTML = '<div class="explorer-empty">No snapshots</div>'
    return
  }

  const items: string[] = []

  if (terminalEntries.length > 0) {
    items.push('<div class="explorer-group-label">Completed Files</div>')
    const ordinals = ['Last', '2nd Last', '3rd Last']
    const visibleCount = sideSnapshotsShowAll ? terminalEntries.length : Math.min(SIDE_SNAPSHOTS_VISIBLE, terminalEntries.length)
    for (let i = 0; i < visibleCount; i++) {
      const entry = terminalEntries[i]!
      const label = `${ordinals[i] ?? `${i + 1}th Last`} Run`
      const colorVar = entry.resultType === 'error' ? 'var(--color-error)' : entry.resultType === 'halted' ? 'var(--color-primary)' : 'var(--color-success)'
      const activeClass = activeSnapshotKey === `terminal:${i}` ? ' explorer-item--active' : ''
      const menuId = `side-terminal-menu-${i}`
      const menuItems: EditorMenuItem[] = [
        { action: `Playground.closeExplorerMenus();Playground.openTerminalSnapshot(${i})`, icon: ICONS.eye, label: 'Open' },
        { action: `Playground.closeExplorerMenus();Playground.saveTerminalSnapshotToSaved(${i})`, icon: ICONS.save, label: 'Save' },
        { action: `Playground.closeExplorerMenus();Playground.downloadTerminalSnapshotByIndex(${i})`, icon: ICONS.download, label: 'Download' },
        { action: `Playground.closeExplorerMenus();Playground.clearTerminalSnapshot(${i})`, danger: true, icon: ICONS.trash, label: 'Delete' },
      ]
      items.push(`
        <div class="explorer-item${activeClass}" onclick="Playground.openTerminalSnapshot(${i})" title="${escapeHtml(label)}">
          <span class="explorer-item__dot" style="background:${colorVar};"></span>
          <span class="explorer-item__name">${escapeHtml(label)}</span>
          <span class="explorer-item__actions" onclick="event.stopPropagation()">
            ${renderEditorMenu({ id: menuId, items: menuItems })}
            <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          </span>
        </div>`)
    }
    if (terminalEntries.length > SIDE_SNAPSHOTS_VISIBLE) {
      if (sideSnapshotsShowAll) {
        items.push('<div class="explorer-show-more" onclick="Playground.toggleSideSnapshotsShowAll()">Show less</div>')
      } else {
        items.push(`<div class="explorer-show-more" onclick="Playground.toggleSideSnapshotsShowAll()">Show all (${terminalEntries.length})</div>`)
      }
    }
  }

  if (savedEntries.length > 0) {
    items.push('<div class="explorer-group-label">Saved Snapshots</div>')
    savedEntries.forEach((entry, i) => {
      const label = entry.name || `Snapshot ${i + 1}`
      const lockHtml = entry.locked ? `<span class="explorer-item__lock" title="Locked">${ICONS.lock}</span>` : ''
      const savedActiveClass = activeSnapshotKey === `saved:${i}` ? ' explorer-item--active' : ''
      const isSuspended = entry.snapshot.terminal !== true
      const menuId = `side-saved-menu-${i}`
      const menuItems: EditorMenuItem[] = [
        { action: `Playground.closeExplorerMenus();Playground.openSavedSnapshot(${i})`, icon: ICONS.eye, label: 'Open' },
        { action: `Playground.closeExplorerMenus();Playground.toggleSnapshotLock(${i})`, icon: entry.locked ? ICONS.unlock : ICONS.lock, label: entry.locked ? 'Unlock' : 'Lock' },
        { action: `Playground.closeExplorerMenus();Playground.downloadSavedSnapshotByIndex(${i})`, icon: ICONS.download, label: 'Download' },
        { action: `Playground.closeExplorerMenus();Playground.deleteSavedSnapshot(${i})`, danger: true, icon: ICONS.trash, label: 'Delete' },
      ]
      const runButton = isSuspended
        ? `<button class="explorer-item__btn" onclick="event.stopPropagation();Playground.runSavedSnapshot(${i})" title="Run snapshot">${ICONS.play}</button>`
        : ''
      items.push(`
        <div class="explorer-item${savedActiveClass}" onclick="Playground.openSavedSnapshot(${i})" title="${escapeHtml(label)}">
          <span class="explorer-item__name">${escapeHtml(label)}</span>
          ${lockHtml}
          <span class="explorer-item__actions" onclick="event.stopPropagation()">
            ${runButton}
            ${renderEditorMenu({ id: menuId, items: menuItems })}
            <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          </span>
        </div>`)
    })
  }

  list.innerHTML = items.join('')
}

export function showSideTab(tabId: string, options: { persist?: boolean; syncUrl?: boolean } = {}) {
  const normalizedTabId = normalizeSideTab(tabId)
  // Hide all side tabs, show the selected one
  document.querySelectorAll('.side-panel__tab').forEach(el => {
    (el as HTMLElement).style.display = 'none'
  })
  const tab = document.getElementById(`side-tab-${normalizedTabId}`)
  if (tab) tab.style.display = ''

  // Update icon active state
  document.querySelectorAll('.side-panel__icon').forEach(el => el.classList.remove('side-panel__icon--active'))
  const icon = document.getElementById(`side-icon-${normalizedTabId}`)
  if (icon) icon.classList.add('side-panel__icon--active')

  document.querySelectorAll('[id^="side-header-"]').forEach(el => {
    if (el.id === 'side-panel-header') return
    if (el.id.startsWith('side-header-actions-') || el.id.startsWith('side-header-')) {
      (el as HTMLElement).style.display = 'none'
    }
  })

  const header = document.getElementById(`side-header-${normalizedTabId}`)
  if (header) header.style.display = ''

  const actions = document.getElementById(`side-header-actions-${normalizedTabId}`)
  if (actions) actions.style.display = ''

  if (options.persist !== false)
    saveState({ 'active-side-tab': normalizedTabId }, false)

  if (options.syncUrl !== false)
    syncPlaygroundUrlState(normalizedTabId)

  // Sync the code panel view and header
  syncCodePanelView(normalizedTabId)
  updateCSS()
}

/** Sync the code panel: show editor, snapshot, or empty view + update header accordingly. */
function setEditorEmptyState(emptyView: HTMLElement, title: string, description: string, buttonLabel: string, action: string) {
  emptyView.innerHTML = `
    <div class="dvala-empty-view__content">
      <div class="dvala-empty-view__title">${escapeHtml(title)}</div>
      <div class="dvala-empty-view__description">${escapeHtml(description)}</div>
      <button type="button" class="button button--primary dvala-empty-view__button" onclick="${action}">${escapeHtml(buttonLabel)}</button>
    </div>
  `
}

function syncCodePanelView(sideTab?: string) {
  const tab = sideTab ?? getCurrentSideTab()
  const editorView = document.getElementById('dvala-editor-view')
  const contextDetailView = document.getElementById('context-detail-view')
  const snapshotView = document.getElementById('dvala-snapshot-view')
  const emptyView = document.getElementById('dvala-empty-view')
  const headerEditor = document.getElementById('dvala-header-editor')
  const headerSnapshot = document.getElementById('dvala-header-snapshot')
  const undoBtn = document.getElementById('dvala-code-undo-button')
  const redoBtn = document.getElementById('dvala-code-redo-button')
  const fileCloseBtn = document.getElementById('file-close-btn')
  const closeBtn = document.getElementById('snapshot-close-btn')
  if (!editorView || !snapshotView || !emptyView) return

  // Hide all views
  editorView.style.display = 'none'
  if (contextDetailView) contextDetailView.style.display = 'none'
  snapshotView.style.display = 'none'
  emptyView.style.display = 'none'
  if (headerEditor) headerEditor.style.display = 'none'
  if (headerSnapshot) headerSnapshot.style.display = 'none'
  if (undoBtn) undoBtn.style.display = 'none'
  if (redoBtn) redoBtn.style.display = 'none'
  if (fileCloseBtn) fileCloseBtn.style.display = 'none'
  if (closeBtn) closeBtn.style.display = 'none'

  if (tab === 'files') {
    editorView.style.display = 'flex'
    if (headerEditor) headerEditor.style.display = 'flex'
    if (undoBtn) undoBtn.style.display = ''
    if (redoBtn) redoBtn.style.display = ''
    if (fileCloseBtn && getState('current-file-id')) fileCloseBtn.style.display = ''
  } else if (tab === 'snapshots') {
    if (activeSnapshotKey && snapshotViewStack.length === 0) {
      const activeSnapshot = getActiveSnapshotDetails()
      if (activeSnapshot) {
        replaceSnapshotView(activeSnapshot.snapshot, activeSnapshot.label)
        updateCSS()
        return
      }
      activeSnapshotKey = null
      populateSideSnapshotsList()
    }

    if (activeSnapshotKey && snapshotViewStack.length > 0) {
      snapshotView.style.display = 'flex'
      if (headerSnapshot) headerSnapshot.style.display = 'flex'
      if (closeBtn) closeBtn.style.display = ''
    } else {
      emptyView.style.display = 'flex'
      setEditorEmptyState(
        emptyView,
        'Select a snapshot to view',
        'Import a snapshot here, or run a file and save a checkpoint to create a new entry.',
        'Import snapshot',
        'Playground.openImportSnapshotModal()',
      )
    }
  } else {
    const context = getParsedContext()
    const bindingNames = getContextBindingNames(context)
    const effectHandlerNames = getContextEffectHandlerNames(context)
    ensureActiveContextSelection(context)

    if (headerEditor) headerEditor.style.display = 'flex'
    if (bindingNames.length > 0 || effectHandlerNames.length > 0) {
      if (contextDetailView) contextDetailView.style.display = 'flex'
      syncContextDetailEditor()
    } else {
      emptyView.style.display = 'flex'
      emptyView.innerHTML = `
        <div class="dvala-empty-view__content">
          <div class="dvala-empty-view__title">No context entries</div>
          <div class="dvala-empty-view__description">Add a binding or effect handler to set up the execution context.</div>
          <button type="button" class="button button--primary dvala-empty-view__button" onclick="Playground.promptAddContextBinding()">Add binding</button>
          <button type="button" class="button button--primary dvala-empty-view__button" onclick="Playground.promptAddContextEffectHandler()">Add effect handler</button>
        </div>
      `
    }
  }
}

function getCurrentSideTab(): string {
  const active = document.querySelector('.side-panel__icon--active')
  if (!active) return getState('active-side-tab')
  const id = active.id
  if (id === 'side-icon-snapshots') return 'snapshots'
  if (id === 'side-icon-context') return 'context'
  return 'files'
}

function getUniqueSavedFileName(name: string, existingNames: Iterable<string>): string {
  const normalizedName = normalizeSavedFileName(name)
  const usedNames = new Set(existingNames)
  if (!usedNames.has(normalizedName)) return normalizedName

  const baseName = stripSavedFileSuffix(normalizedName)
  let n = 2
  let candidate = `${baseName} (${n})${DVALA_FILE_SUFFIX}`
  while (usedNames.has(candidate)) {
    n++
    candidate = `${baseName} (${n})${DVALA_FILE_SUFFIX}`
  }
  return candidate
}

/**
 * Create a new untitled file and return its ID.
 * Generates a unique name: "Untitled File.dvala", "Untitled File (2).dvala", etc.
 */
function createUntitledFile(code = '', context = ''): string {
  const files = getSavedFiles()
  const name = getUniqueSavedFileName('Untitled File', files.map(entry => entry.name))
  const now = Date.now()
  const createdFile: SavedFile = {
    id: crypto.randomUUID(),
    name,
    code,
    context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setSavedFiles([createdFile, ...files])
  return createdFile.id
}

function populateExplorerFileList() {
  const list = document.getElementById('explorer-file-list')
  const stats = document.getElementById('explorer-file-stats')
  if (!list) return

  const files = getSavedFiles()
  const currentId = getState('current-file-id')
  const scratchCode = getScratchCode()

  const renderScratchExplorerItem = () => {
    const activeClass = currentId === null ? ' explorer-item--active' : ''

    return `
      <div class="explorer-item${activeClass}" onclick="Playground.openScratch()" title="Scratch">
        <span class="explorer-item__name" style="font-family:var(--font-mono);">${escapeHtml(SCRATCH_TITLE)}</span>
      </div>`
  }

  const renderFileStats = () => {
    if (!stats) return
    // No stats panel when scratch is active
    if (currentId === null) {
      stats.style.display = 'none'
      return
    }
    const currentFile = currentId ? files.find(entry => entry.id === currentId) : null
    const currentTitle = currentFile ? currentFile.name : SCRATCH_TITLE
    const currentCode = currentFile ? currentFile.code : scratchCode
    const lockIcon = currentFile?.locked
      ? `<span class="file-stats-panel__lock" title="Locked">${ICONS.lock}</span>`
      : ''
    const timeMarkup = currentFile
      ? `<div class="file-stats-panel__time">${formatTime(new Date(currentFile.updatedAt))}</div>`
      : '<div class="file-stats-panel__time">Local scratch</div>'

    const tokenStream = tokenizeSource(currentCode)
    const meaningfulTokens = tokenStream.tokens
    let firstMeaningful = 0
    while (firstMeaningful < meaningfulTokens.length) {
      const type = meaningfulTokens[firstMeaningful]![0]
      if (type !== 'Whitespace' && type !== 'SingleLineComment' && type !== 'MultiLineComment') break
      firstMeaningful++
    }
    const lineCount = currentCode === '' ? 0 : currentCode.split('\n').length
    const charCount = currentCode.length

    stats.style.display = 'block'
    stats.innerHTML = `
      <div class="file-stats-panel__header">
        <div class="file-stats-panel__title-row">
          <span class="file-stats-panel__title" style="font-family:var(--font-mono);">${escapeHtml(currentTitle)}</span>
          ${lockIcon}
        </div>
        ${timeMarkup}
      </div>
      <div class="file-stats-panel__meta">
        <span>${lineCount} ${lineCount === 1 ? 'line' : 'lines'}</span>
        <span>${charCount} chars</span>
      </div>`
  }

  if (files.length === 0) {
    list.innerHTML = `${renderScratchExplorerItem()}<div class="explorer-empty">No saved files</div>`
    renderFileStats()
    return
  }

  list.innerHTML = [renderScratchExplorerItem(), ...files.map(entry => {
    const isActive = entry.id === currentId
    const activeClass = isActive ? ' explorer-item--active' : ''
    const lockHtml = entry.locked ? `<span class="explorer-item__lock" title="Locked">${ICONS.lock}</span>` : ''
    const menuId = `explorer-menu-${entry.id}`
    const menuItems: EditorMenuItem[] = [
      { action: `Playground.closeExplorerMenus();Playground.renameFile('${entry.id}')`, icon: ICONS.edit, label: 'Rename' },
      { action: `Playground.closeExplorerMenus();Playground.duplicateFile('${entry.id}')`, icon: ICONS.duplicate, label: 'Duplicate' },
      { action: `Playground.closeExplorerMenus();Playground.toggleFileLock('${entry.id}')`, icon: entry.locked ? ICONS.unlock : ICONS.lock, label: entry.locked ? 'Unlock' : 'Lock' },
      { action: `Playground.closeExplorerMenus();Playground.downloadFile('${entry.id}')`, icon: ICONS.download, label: 'Export' },
      { action: `Playground.closeExplorerMenus();Playground.shareFile('${entry.id}')`, icon: ICONS.share, label: 'Share' },
      { action: `Playground.closeExplorerMenus();Playground.deleteSavedFile('${entry.id}')`, danger: true, icon: ICONS.trash, label: 'Delete' },
    ]
    return `
      <div class="explorer-item${activeClass}" onclick="Playground.loadSavedFile('${entry.id}')" title="${escapeHtml(entry.name)}">
        <span class="explorer-item__name" style="font-family:var(--font-mono);">${escapeHtml(entry.name)}</span>
        ${lockHtml}
        <span class="explorer-item__actions" onclick="event.stopPropagation()">
          <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          ${renderEditorMenu({ id: menuId, items: menuItems })}
        </span>
      </div>`
  })].join('')

  renderFileStats()
}

export function renameFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  showNameInputModal('Rename file', file.name, name => {
    const files = getSavedFiles()
    const normalizedName = normalizeSavedFileName(name)
    const duplicate = files.find(entry => entry.name === normalizedName && entry.id !== id)
    const doRename = () => {
      const updated = files.map(entry => entry.id === id ? { ...entry, name: normalizedName, updatedAt: Date.now() } : entry).filter(entry => !duplicate || entry.id !== duplicate.id)
      setSavedFiles(updated)
      updateCSS()
      populateSavedFilesList()
      showToast(`Renamed to "${normalizedName}"`)
    }
    if (duplicate) {
      void showInfoModal('Replace existing file?', `"${normalizedName}" already exists. Replace it?`, doRename)
    } else {
      doRename()
    }
  })
}

export function shareFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return

  const dismiss = () => popModal()

  const { panel, body } = createModalPanel({
    size: 'small',
    footerActions: [
      { label: 'Cancel', action: dismiss },
      {
        label: 'Copy link',
        primary: true,
        action: () => {
          const includeContext = (document.getElementById('share-include-context') as HTMLInputElement)?.checked ?? false
          const sharedState: Record<string, unknown> = { 'dvala-code': file.code }
          if (includeContext && file.context.trim()) {
            sharedState['context'] = file.context
          }
          const base = document.querySelector('base')?.href ?? `${location.origin}/`
          const encoded = btoa(encodeURIComponent(JSON.stringify(sharedState)))
          const params = new URLSearchParams({
            state: encoded,
            view: getState('active-side-tab'),
          })
          params.set('fileId', file.id)
          const href = `${base}editor?${params.toString()}`
          if (href.length > MAX_URL_LENGTH) {
            popModal()
            showToast('File is too large to share as a URL. Try reducing the code or context size.', { severity: 'error' })
            return
          }
          void navigator.clipboard.writeText(href).then(() => {
            showToast('Link copied to clipboard')
          })
          popModal()
        },
      },
    ],
  })

  const content = document.createElement('div')
  content.className = 'modal-body-row'
  content.innerHTML = `
    <p style="margin:0 0 var(--space-3);">Share <strong>${escapeHtml(file.name)}</strong> as a link.</p>
    <label style="display:flex; align-items:center; gap:var(--space-2); cursor:pointer;">
      <input type="checkbox" id="share-include-context" ${file.context.trim() ? '' : 'disabled'}>
      Include context${file.context.trim() ? '' : ' (empty)'}
    </label>
  `
  body.appendChild(content)

  pushPanel(panel, 'Share file')
}

export function toggleExplorerMenu(menuId: string, btn: HTMLElement) {
  toggleEditorMenu(menuId, btn, 2)
}

export function closeExplorerMenus() {
  closeAllEditorMenus()
}

function clearActiveFileSelection() {
  openScratchInEditor()
}

export function closeActiveFile() {
  clearActiveFileSelection()
}

export function openScratch() {
  openScratchInEditor({ focusCode: true })
}

export function saveScratch() {
  if (!hasScratchContent()) return
  saveAs()
}

export function clearScratch() {
  const clear = () => {
    saveState({
      'scratch-code': '',
      'scratch-context': '',
    }, false)

    if (isScratchActive())
      openScratchInEditor({ code: '', context: '', focusCode: true, toast: 'Scratch cleared', force: true })
    else {
      populateExplorerFileList()
      updateCSS()
      showToast('Scratch cleared')
    }
  }

  if (!hasScratchContent()) {
    clear()
    return
  }

  void showInfoModal('Clear scratch', 'This will clear the scratch buffer.', clear)
}

export function deleteSavedFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  const doDelete = async () => {
    await animateFileCardRemoval(id)
    deleteFileHistory(id)
    const updated = getSavedFiles().filter(p => p.id !== id)
    setSavedFiles(updated)
    if (getState('current-file-id') === id) {
      clearActiveFileSelection()
    }
    populateSavedFilesList()
  }
  if (file.locked) {
    void showInfoModal('Delete file', 'This file is locked. Are you sure you want to permanently delete it?', doDelete)
  } else {
    void doDelete()
  }
}

export function downloadFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  const filename = `${file.name.replace(/[^a-z0-9_-]/gi, '_')}.json`
  const { id: _id, ...exportData } = file
  void saveFile(JSON.stringify(exportData, null, 2), filename)
}

export function toggleFileLock(id: string) {
  const files = getSavedFiles()
  const updated = files.map(entry => entry.id === id ? { ...entry, locked: !entry.locked } : entry)
  setSavedFiles(updated)
  populateSavedFilesList()
  if (id === getState('current-file-id')) updateCSS()
}

export function clearAllSavedFiles() {
  clearAllFiles()
  clearAllFileHistories()
  clearActiveFileSelection()
  populateSavedFilesList()
}

export function clearUnlockedFiles() {
  void showInfoModal('Remove unlocked files', 'This will delete all unlocked files. Locked files will be kept.', async () => {
    const unlocked = getSavedFiles().filter(p => !p.locked)
    await Promise.all(unlocked.map(entry => animateFileCardRemoval(entry.id)))
    unlocked.forEach(entry => deleteFileHistory(entry.id))
    const kept = getSavedFiles().filter(p => p.locked)
    setSavedFiles(kept)
    if (!kept.find(p => p.id === getState('current-file-id'))) {
      clearActiveFileSelection()
    }
    populateSavedFilesList()
    showToast('Unlocked files cleared')
  })
}

export function openImportFileModal() {
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
        void showInfoModal('Import failed', 'Not a valid file object (requires at least "name" and "code").')
        return
      }
      const raw = parsed as Record<string, unknown>
      const now = Date.now()
      const existing = getSavedFiles()
      const existingNames = new Set(existing.map(p => p.name))
      const rawName = typeof raw['name'] === 'string' ? raw['name'] : 'Imported File'
      const name = getUniqueSavedFileName(rawName, existingNames)
      const imported: SavedFile = {
        id: crypto.randomUUID(),
        name,
        code: typeof raw['code'] === 'string' ? raw['code'] : '',
        context: typeof raw['context'] === 'string' ? raw['context'] : '',
        createdAt: typeof raw['createdAt'] === 'number' ? raw['createdAt'] : now,
        updatedAt: typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : now,
        locked: typeof raw['locked'] === 'boolean' ? raw['locked'] : false,
      }
      setSavedFiles([imported, ...existing])

      populateSavedFilesList({ animateNewId: imported.id })
      showToast(`Imported "${imported.name}"`)
    }
    reader.readAsText(file)
  }
  input.click()
}

export function duplicateFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  const now = Date.now()
  const name = getUniqueSavedFileName(`Copy of ${file.name}`, getSavedFiles().map(entry => entry.name))
  const copy: SavedFile = {
    id: crypto.randomUUID(),
    name,
    code: file.code,
    context: file.context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setSavedFiles([copy, ...getSavedFiles()])
  saveState({
    'dvala-code': copy.code,
    'context': copy.context,
    'current-file-id': copy.id,
    'dvala-code-selection-start': 0,
    'dvala-code-selection-end': 0,
    'dvala-code-scroll-top': 0,
  }, false)
  activateCurrentFileHistory(true)
  elements.dvalaTextArea.value = copy.code
  updateContextState(copy.context, false)
  syntaxOverlay.update()
  updateCSS()
  populateSavedFilesList({ animateNewId: copy.id })
  showToast(`Created "${copy.name}"`)
}

export function saveAs() {
  const currentId = getState('current-file-id')
  const currentFile = currentId ? getSavedFiles().find(entry => entry.id === currentId) : null
  const defaultName = currentFile ? `Copy of ${currentFile.name}` : ''
  showNameInputModal('Save as', defaultName, name => {
    const files = getSavedFiles()
    const normalizedName = normalizeSavedFileName(name)
    const duplicate = files.find(entry => entry.name === normalizedName)
    const doSave = () => {
      const filtered = duplicate ? files.filter(entry => entry.id !== duplicate.id) : files
      const now = Date.now()
      if (!currentId)
        persistScratchFromCurrentState()
      const createdFile: SavedFile = {
        id: crypto.randomUUID(),
        name: normalizedName,
        code: getState('dvala-code'),
        context: getState('context'),
        createdAt: now,
        updatedAt: now,
        locked: false,
      }
      setSavedFiles([createdFile, ...filtered])
      saveState({ 'current-file-id': createdFile.id }, false)
      activateCurrentFileHistory(true)

      updateCSS()
      populateSavedFilesList({ animateNewId: createdFile.id })
      showToast(`Saved as "${normalizedName}"`)
    }
    if (duplicate) {
      void showInfoModal('Replace existing file?', `"${normalizedName}" already exists. Replace it?`, doSave)
    } else {
      doSave()
    }
  })
}

function showNameInputModal(
  title: string,
  defaultValue: string,
  onConfirm: (name: string) => void,
  onCancel?: () => void,
  options?: { prefix?: string },
) {
  const dismiss = () => { popModal(); onCancel?.() }

  const input = document.createElement('input')
  input.type = 'text'
  input.value = defaultValue
  input.spellcheck = false
  input.style.cssText = `background:var(--color-surface-dim); border:1px solid var(--color-scrollbar-track); border-radius:4px; padding:0.4rem 0.6rem; color:var(--color-text); font-size:0.9rem; outline:none; width:100%; box-sizing:border-box;${options?.prefix ? ' border-top-left-radius:0; border-bottom-left-radius:0; border-left:none;' : ''}`

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const name = input.value.trim()
      if (!name) return
      popModal()
      onConfirm(name)
    } else if (e.key === 'Escape') {
      dismiss()
    }
  })

  const { panel, body } = createModalPanel({
    size: 'small',
    onClose: onCancel,
    footerActions: [
      { label: 'Cancel', action: dismiss },
      {
        label: 'Save',
        primary: true,
        action: () => {
          const name = input.value.trim()
          if (!name) return
          popModal()
          onConfirm(name)
        },
      },
    ],
  })

  const row = document.createElement('div')
  row.className = 'modal-body-row'
  if (options?.prefix) {
    row.style.display = 'flex'
    row.style.alignItems = 'stretch'

    const prefix = document.createElement('span')
    prefix.textContent = options.prefix
    prefix.setAttribute('aria-hidden', 'true')
    prefix.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; padding:0 0.65rem; border:1px solid var(--color-scrollbar-track); border-right:none; border-radius:4px 0 0 4px; background:var(--color-surface); color:var(--color-text-dim); font-family:var(--font-mono); font-size:0.9rem; flex-shrink:0; user-select:none;'

    row.appendChild(prefix)
  }

  row.appendChild(input)
  body.appendChild(row)

  pushPanel(panel, title)
  setTimeout(() => { input.focus(); input.select() }, 0)
}

export function openContextJsonModal() {
  const dismiss = () => popModal()
  let formattedContext: string

  try {
    const runtimeContext = getRuntimeContextObject(getParsedContext())

    formattedContext = Object.keys(runtimeContext).length > 0
      ? JSON.stringify(runtimeContext, null, 2)
      : '{}'
  } catch {
    formattedContext = getState('context')
  }

  const { panel, body } = createModalPanel({
    size: 'large',
    footerActions: [
      {
        label: 'Copy',
        action: () => {
          void navigator.clipboard.writeText(formattedContext)
          showToast('Context JSON copied to clipboard')
        },
      },
      { label: 'Close', action: dismiss },
    ],
  })

  const copyButton = panel.querySelector<HTMLButtonElement>('.modal-panel__footer .button')
  if (copyButton)
    copyButton.innerHTML = `${copyIcon} Copy`

  body.style.padding = '0'

  const pre = document.createElement('pre')
  pre.className = 'fancy-scroll'
  pre.textContent = formattedContext
  pre.setAttribute('aria-label', 'Full context JSON')
  pre.tabIndex = 0
  pre.style.margin = '0'
  pre.style.minHeight = '26rem'
  pre.style.height = '60vh'
  pre.style.padding = 'var(--space-2)'
  pre.style.overflow = 'auto'
  pre.style.background = 'var(--color-code-bg)'
  pre.style.color = 'var(--color-text)'
  pre.style.fontFamily = 'var(--font-mono)'
  pre.style.fontSize = 'var(--font-size-sm)'
  pre.style.whiteSpace = 'pre'
  body.appendChild(pre)

  pushPanel(panel, 'Context JSON')
  setTimeout(() => {
    pre.focus()
  }, 0)
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
// Timer to clear the scratch "edited" indicator after a short delay (mirrors auto-save UX)
let scratchEditedTimer: ReturnType<typeof setTimeout> | null = null
const PENDING_INDICATOR_DELAY = 1000

function scheduleScratchEditedClear() {
  // dvala-code-edited persists as the durable "user touched scratch" flag.
  // The timer only drives the transient pending indicator via scratchEditedTimer !== null.
  saveState({ 'dvala-code-edited': true }, false)
  if (scratchEditedTimer) clearTimeout(scratchEditedTimer)
  scratchEditedTimer = setTimeout(() => {
    scratchEditedTimer = null
    updateCSS()
  }, PENDING_INDICATOR_DELAY)
}

function cancelScratchEditedClear() {
  if (!scratchEditedTimer) return
  clearTimeout(scratchEditedTimer)
  scratchEditedTimer = null
}

function flushPendingAutoSave() {
  if (!autoSaveTimer) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
  const id = getState('current-file-id')
  if (id) {
    const updated = getSavedFiles().map(p =>
      p.id === id
        ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() }
        : p,
    )
    setSavedFiles(updated)
  }
}

/**
 * Guards a code-replacing action that switches the editor to scratch mode.
 * Flushes any pending auto-save for the current file, then proceeds.
 * Scratch content is guarded separately in openScratchInEditor.
 */
function guardCodeReplacement(proceed: () => void) {
  flushPendingAutoSave()
  proceed()
}

function scheduleAutoSave() {
  const currentId = getState('current-file-id')
  if (!currentId) return
  if (getSavedFiles().find(p => p.id === currentId)?.locked) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    const id = getState('current-file-id')
    if (!id) return
    const updated = getSavedFiles().map(p =>
      p.id === id
        ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() }
        : p,
    )
    setSavedFiles(updated)
    populateSavedFilesList()
    updateCSS()
  }, PENDING_INDICATOR_DELAY)
  updateCSS()
}

export function openSavedSnapshot(index: number) {
  const entries = getSavedSnapshots()
  const entry = entries[index]
  if (!entry) return
  activeSnapshotKey = `saved:${index}`
  populateSideSnapshotsList()
  showSideTab('snapshots')
  replaceSnapshotView(entry.snapshot, getSavedSnapshotLabel(entry, index))
  syncPlaygroundUrlState('snapshots')
}

export function openTerminalSnapshot(index: number) {
  const entries = getTerminalSnapshots()
  const entry = entries[index]
  if (!entry) return
  activeSnapshotKey = `terminal:${index}`
  populateSideSnapshotsList()
  showSideTab('snapshots')
  replaceSnapshotView(entry.snapshot, getTerminalSnapshotLabel(index))
  syncPlaygroundUrlState('snapshots')
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
  const params = new URLSearchParams({
    state: encodeState(),
    view: getState('active-side-tab'),
  })
  const currentFileId = getState('current-file-id')
  if (currentFileId)
    params.set('fileId', currentFileId)
  const currentSnapshotId = getActiveSnapshotUrlId()
  if (currentSnapshotId)
    params.set('snapshotId', currentSnapshotId)
  const href = `${base}editor?${params.toString()}`
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

function onDocumentClick(event: Event) {
  const target = event.target as HTMLInputElement | undefined

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
  calculateDimensions()

  // Set grid column widths for the editor-top area
  const sidePercent = getState('resize-divider-1-percent')
  const editorTop = document.getElementById('editor-top')
  if (editorTop) {
    editorTop.style.gridTemplateColumns = `auto ${sidePercent}% 5px 1fr`
  }

  // Vertical split: output height as percentage of tab height
  const tabPlayground = document.getElementById('tab-editor')
  if (tabPlayground && elements.outputPanel) {
    const tabHeight = tabPlayground.clientHeight
    const outputHeight = (tabHeight * (100 - getState('resize-divider-2-percent'))) / 100
    elements.outputPanel.style.height = `${outputHeight}px`
  }
  elements.wrapper.style.display = 'block'
}

const layout = throttle(applyLayout)

export const undoDvalaCodeHistory = throttle(() => {
  if (elements.dvalaTextArea.readOnly) return
  ignoreSelectionChange = true
  try {
    const historyEntry = dvalaCodeHistory.undo()
    persistActiveDvalaCodeHistory()
    saveState({
      'dvala-code': historyEntry.text,
      'dvala-code-selection-start': historyEntry.selectionStart,
      'dvala-code-selection-end': historyEntry.selectionEnd,
    }, false)
    applyState()
    focusDvalaCode()
  } catch {
    // no-op
  }
  setTimeout(() => ignoreSelectionChange = false)
})

export const redoDvalaCodeHistory = throttle(() => {
  if (elements.dvalaTextArea.readOnly) return
  ignoreSelectionChange = true
  try {
    const historyEntry = dvalaCodeHistory.redo()
    persistActiveDvalaCodeHistory()
    saveState({
      'dvala-code': historyEntry.text,
      'dvala-code-selection-start': historyEntry.selectionStart,
      'dvala-code-selection-end': historyEntry.selectionEnd,
    }, false)
    applyState()
    focusDvalaCode()
  } catch {
    // no-op
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
    const bytes = new TextEncoder().encode(JSON.stringify({
      saved: getSavedSnapshots(),
      terminal: getTerminalSnapshots(),
      files: getSavedFiles(),
    })).length
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
  void showInfoModal('Clear IndexedDB', 'This will delete all saved snapshots, recent snapshots, and saved files.', () => {
    clearAllSnapshots()
    clearAllFiles()
    clearAllFileHistories()
    saveState({ 'current-file-id': null }, false)
    activateCurrentFileHistory(true)
    populateSnapshotsList()
    populateSavedFilesList()
    updateCSS()
    updateStorageUsage()
  })
}

function updateContextState(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom', syncDetail = true) {
  const previousValue = getState('context')
  elements.contextTextArea.value = value

  if (pushToHistory && value !== previousValue) {
    saveState({
      'context': value,
      'context-selection-start': elements.contextTextArea.selectionStart,
      'context-selection-end': elements.contextTextArea.selectionEnd,
    }, true)
    scheduleAutoSave()
  } else if (value !== previousValue) {
    saveState({ context: value }, false)
  }

  if (scroll === 'top')
    elements.contextTextArea.scrollTo(0, 0)
  else if (scroll === 'bottom')
    elements.contextTextArea.scrollTo({ top: elements.contextTextArea.scrollHeight, behavior: 'smooth' })

  renderContextEntryList()
  if (syncDetail && getCurrentSideTab() === 'context')
    syncCodePanelView('context')
  else if (syncDetail)
    syncContextDetailEditor()

  updateCSS()
}

function getParsedContext(): Record<string, unknown> {
  try {
    return asUnknownRecord(JSON.parse(getState('context')))
  } catch (_e) {
    return {}
  }
}

function persistActiveContextSelection(syncUrl = getCurrentSideTab() === 'context') {
  saveState({
    'current-context-binding-name': activeContextBindingName,
    'current-context-entry-kind': activeContextEntryKind,
  }, false)
  if (syncUrl)
    syncPlaygroundUrlState('context')
}

function getContextBindings(context: Record<string, unknown>): UnknownRecord {
  const bindings = context.bindings
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings))
    return {}

  return asUnknownRecord(bindings)
}

function compareContextEntryNames(left: string, right: string): number {
  return left.toLowerCase().localeCompare(right.toLowerCase())
}

function sortContextEffectHandlers(handlers: StoredContextEffectHandler[]): StoredContextEffectHandler[] {
  return [...handlers].sort((left, right) => compareContextEntryNames(left.pattern, right.pattern))
}

function getContextEffectHandlers(context: Record<string, unknown>): StoredContextEffectHandler[] {
  const effectHandlers = context[CONTEXT_EFFECT_HANDLERS_KEY]
  if (!Array.isArray(effectHandlers))
    return []

  return effectHandlers.filter((entry): entry is StoredContextEffectHandler => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      return false

    const record = asUnknownRecord(entry)
    return typeof record.pattern === 'string' && Object.prototype.hasOwnProperty.call(record, 'handler')
  })
}

function getContextEffectHandler(context: Record<string, unknown>, pattern: string): StoredContextEffectHandler | null {
  return getContextEffectHandlers(context).find(handler => handler.pattern === pattern) ?? null
}

function getRuntimeContextObject(context: Record<string, unknown>): Record<string, unknown> {
  const runtimeContext = { ...context }
  const runtimeBindings = Object.fromEntries(
    Object.entries(getContextBindings(context)).filter(([name]) => isContextBindingActive(context, name)),
  )
  const runtimeEffectHandlers = getContextEffectHandlers(context).filter(({ pattern }) => isContextEffectHandlerActive(context, pattern))

  if (Object.keys(runtimeBindings).length > 0)
    runtimeContext.bindings = runtimeBindings
  else
    delete runtimeContext.bindings

  if (runtimeEffectHandlers.length > 0)
    runtimeContext[CONTEXT_EFFECT_HANDLERS_KEY] = runtimeEffectHandlers
  else
    delete runtimeContext[CONTEXT_EFFECT_HANDLERS_KEY]

  delete runtimeContext[CONTEXT_UI_STATE_KEY]
  return runtimeContext
}

function getContextUiState(context: Record<string, unknown>): UnknownRecord {
  const uiState = context[CONTEXT_UI_STATE_KEY]
  if (!uiState || typeof uiState !== 'object' || Array.isArray(uiState))
    return {}

  return asUnknownRecord(uiState)
}

function getContextUiSectionState(context: Record<string, unknown>, key: ContextUiSectionKey): UnknownRecord {
  const section = getContextUiState(context)[key]
  if (!section || typeof section !== 'object' || Array.isArray(section))
    return {}

  return asUnknownRecord(section)
}

function getContextBindingUiState(context: Record<string, unknown>): UnknownRecord {
  return getContextUiSectionState(context, 'bindings')
}

function getContextEffectHandlerUiState(context: Record<string, unknown>): UnknownRecord {
  return getContextUiSectionState(context, 'effectHandlers')
}

function getContextBindingUiEntry(context: Record<string, unknown>, name: string): UnknownRecord {
  const bindingEntry = getContextBindingUiState(context)[name]
  if (!bindingEntry || typeof bindingEntry !== 'object' || Array.isArray(bindingEntry))
    return {}

  return asUnknownRecord(bindingEntry)
}

function getContextEffectHandlerUiEntry(context: Record<string, unknown>, pattern: string): UnknownRecord {
  const handlerEntry = getContextEffectHandlerUiState(context)[pattern]
  if (!handlerEntry || typeof handlerEntry !== 'object' || Array.isArray(handlerEntry))
    return {}

  return asUnknownRecord(handlerEntry)
}

function getContextBindingInvalidDraft(context: Record<string, unknown>, name: string): string | null {
  const invalidDraft = getContextBindingUiEntry(context, name).invalidJson
  return typeof invalidDraft === 'string' ? invalidDraft : null
}

function getContextEffectHandlerInvalidDraft(context: Record<string, unknown>, pattern: string): string | null {
  const invalidDraft = getContextEffectHandlerUiEntry(context, pattern).invalidHandler
  return typeof invalidDraft === 'string' ? invalidDraft : null
}

function getContextBindingNames(context: Record<string, unknown>): string[] {
  const bindingNames = Object.keys(getContextBindings(context))
  const invalidDraftNames = Object.keys(getContextBindingUiState(context)).filter(name => getContextBindingInvalidDraft(context, name) !== null)

  return [...new Set([...bindingNames, ...invalidDraftNames])]
    .sort(compareContextEntryNames)
}

function getContextEffectHandlerNames(context: Record<string, unknown>): string[] {
  const handlerNames = getContextEffectHandlers(context).map(({ pattern }) => pattern)
  const invalidDraftNames = Object.keys(getContextEffectHandlerUiState(context)).filter(name => getContextEffectHandlerInvalidDraft(context, name) !== null)

  return [...new Set([...handlerNames, ...invalidDraftNames])]
    .sort(compareContextEntryNames)
}

function updateContextUiSectionEntry(context: Record<string, unknown>, key: ContextUiSectionKey, name: string, updater: (entry: UnknownRecord) => UnknownRecord) {
  const uiState = { ...getContextUiState(context) }
  const sectionState = { ...getContextUiSectionState(context, key) }
  const currentEntry = sectionState[name]
  const nextEntry = updater(currentEntry && typeof currentEntry === 'object' && !Array.isArray(currentEntry) ? { ...asUnknownRecord(currentEntry) } : {})

  if (Object.keys(nextEntry).length > 0)
    sectionState[name] = nextEntry
  else
    delete sectionState[name]

  if (Object.keys(sectionState).length > 0)
    uiState[key] = sectionState
  else
    delete uiState[key]

  if (Object.keys(uiState).length > 0)
    context[CONTEXT_UI_STATE_KEY] = uiState
  else
    delete context[CONTEXT_UI_STATE_KEY]
}

function updateContextBindingUiEntry(context: Record<string, unknown>, name: string, updater: (entry: UnknownRecord) => UnknownRecord) {
  updateContextUiSectionEntry(context, 'bindings', name, updater)
}

function updateContextEffectHandlerUiEntry(context: Record<string, unknown>, pattern: string, updater: (entry: UnknownRecord) => UnknownRecord) {
  updateContextUiSectionEntry(context, 'effectHandlers', pattern, updater)
}

function isContextBindingActive(context: Record<string, unknown>, name: string): boolean {
  const bindingState = getContextBindingUiState(context)[name]
  if (!bindingState || typeof bindingState !== 'object' || Array.isArray(bindingState))
    return true

  return asUnknownRecord(bindingState).active !== false
}

function isContextEffectHandlerActive(context: Record<string, unknown>, pattern: string): boolean {
  const handlerState = getContextEffectHandlerUiState(context)[pattern]
  if (!handlerState || typeof handlerState !== 'object' || Array.isArray(handlerState))
    return true

  return asUnknownRecord(handlerState).active !== false
}

function formatContextJson(context: Record<string, unknown>): string {
  const nextContext = { ...context }
  const uiState = getContextUiState(nextContext)
  const bindingUiState = getContextBindingUiState(nextContext)
  const effectHandlerUiState = getContextEffectHandlerUiState(nextContext)

  if (Object.keys(bindingUiState).length > 0)
    uiState.bindings = bindingUiState
  else
    delete uiState.bindings

  if (Object.keys(effectHandlerUiState).length > 0)
    uiState.effectHandlers = effectHandlerUiState
  else
    delete uiState.effectHandlers

  if (Object.keys(uiState).length > 0)
    nextContext[CONTEXT_UI_STATE_KEY] = uiState
  else
    delete nextContext[CONTEXT_UI_STATE_KEY]

  return JSON.stringify(nextContext, null, 2)
}

function contextEntryExists(context: Record<string, unknown>, kind: ContextEntryKind, name: string): boolean {
  if (kind === 'binding')
    return getContextBindingNames(context).includes(name)

  return getContextEffectHandlerNames(context).includes(name)
}

function ensureActiveContextSelection(context: Record<string, unknown>) {
  const bindingNames = getContextBindingNames(context)
  const effectHandlerNames = getContextEffectHandlerNames(context)
  const preferredName = activeContextBindingName ?? getState('current-context-binding-name')
  const preferredKind = activeContextEntryKind ?? getState('current-context-entry-kind')
  if (preferredName && contextEntryExists(context, preferredKind, preferredName)) {
    if (activeContextBindingName !== preferredName || activeContextEntryKind !== preferredKind) {
      activeContextBindingName = preferredName
      activeContextEntryKind = preferredKind
      persistActiveContextSelection()
    }
    return
  }

  const nextSelection = bindingNames.length > 0
    ? { kind: 'binding' as const, name: bindingNames[0] ?? null }
    : { kind: 'effect-handler' as const, name: effectHandlerNames[0] ?? null }

  if (activeContextBindingName !== nextSelection.name || activeContextEntryKind !== nextSelection.kind) {
    activeContextBindingName = nextSelection.name
    activeContextEntryKind = nextSelection.kind
    persistActiveContextSelection()
  }
}

function setContextBindingActive(context: Record<string, unknown>, name: string, active: boolean) {
  updateContextBindingUiEntry(context, name, entry => {
    if (active)
      delete entry.active
    else
      entry.active = false
    return entry
  })
}

function setContextEffectHandlerActive(context: Record<string, unknown>, pattern: string, active: boolean) {
  updateContextEffectHandlerUiEntry(context, pattern, entry => {
    if (active)
      delete entry.active
    else
      entry.active = false
    return entry
  })
}

function syncContextDetailValidity(isValid: boolean) {
  elements.contextDetailTextArea.toggleAttribute('aria-invalid', !isValid)
}

function isStoredContextBindingJsonValid(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined)
      return false
    JSON.parse(serialized)
    return true
  } catch {
    return false
  }
}

function compileContextEffectHandlerSource(value: string): EffectHandler {
  const fn = eval(`(${value})`) as unknown
  if (typeof fn !== 'function')
    throw new TypeError('Effect handler must be a JavaScript function')

  return fn as EffectHandler
}

function isStoredContextEffectHandlerValid(value: unknown): boolean {
  if (typeof value !== 'string')
    return false

  try {
    compileContextEffectHandlerSource(value)
    return true
  } catch {
    return false
  }
}

function hasContextBindingParseError(context: Record<string, unknown>, name: string): boolean {
  const bindings = getContextBindings(context)
  if (getContextBindingInvalidDraft(context, name) !== null)
    return true

  if (!Object.prototype.hasOwnProperty.call(bindings, name))
    return false

  if (activeContextBindingName === name && contextDetailHasParseError)
    return true

  return !isStoredContextBindingJsonValid(bindings[name])
}

function hasContextEffectHandlerParseError(context: Record<string, unknown>, pattern: string): boolean {
  const handler = getContextEffectHandler(context, pattern)
  if (getContextEffectHandlerInvalidDraft(context, pattern) !== null)
    return true

  if (!handler)
    return false

  if (activeContextEntryKind === 'effect-handler' && activeContextBindingName === pattern && contextDetailHasParseError)
    return true

  return !isStoredContextEffectHandlerValid(handler.handler)
}

function syncContextDetailEditor() {
  const context = getParsedContext()
  const bindings = getContextBindings(context)
  ensureActiveContextSelection(context)
  const activeName = activeContextBindingName
  const activeHandler = activeName ? getContextEffectHandler(context, activeName) : null

  isSyncingContextDetail = true
  contextDetailHasParseError = false
  if (activeContextEntryKind === 'binding' && activeName && Object.prototype.hasOwnProperty.call(bindings, activeName)) {
    elements.contextDetailTextArea.readOnly = false
    const invalidDraft = getContextBindingInvalidDraft(context, activeName)
    if (invalidDraft !== null) {
      elements.contextDetailTextArea.value = invalidDraft
      contextDetailHasParseError = true
    } else {
      elements.contextDetailTextArea.value = JSON.stringify(bindings[activeName], null, 2)
    }
  } else if (activeContextEntryKind === 'effect-handler' && activeName && activeHandler) {
    elements.contextDetailTextArea.readOnly = false
    const invalidDraft = getContextEffectHandlerInvalidDraft(context, activeName)
    if (invalidDraft !== null) {
      elements.contextDetailTextArea.value = invalidDraft
      contextDetailHasParseError = true
    } else if (typeof activeHandler.handler === 'string') {
      elements.contextDetailTextArea.value = activeHandler.handler
      contextDetailHasParseError = !isStoredContextEffectHandlerValid(activeHandler.handler)
    } else {
      elements.contextDetailTextArea.value = String(activeHandler.handler)
      contextDetailHasParseError = true
    }
  } else if (activeName) {
    const invalidBindingDraft = getContextBindingInvalidDraft(context, activeName)
    const invalidHandlerDraft = getContextEffectHandlerInvalidDraft(context, activeName)
    if (activeContextEntryKind === 'binding' && invalidBindingDraft !== null) {
      elements.contextDetailTextArea.readOnly = false
      elements.contextDetailTextArea.value = invalidBindingDraft
      contextDetailHasParseError = true
    } else if (activeContextEntryKind === 'effect-handler' && invalidHandlerDraft !== null) {
      elements.contextDetailTextArea.readOnly = false
      elements.contextDetailTextArea.value = invalidHandlerDraft
      contextDetailHasParseError = true
    } else {
      elements.contextDetailTextArea.readOnly = true
      elements.contextDetailTextArea.value = ''
    }
  } else {
    elements.contextDetailTextArea.readOnly = true
    elements.contextDetailTextArea.value = ''
  }
  isSyncingContextDetail = false
  syncContextDetailValidity(!contextDetailHasParseError)
}

function renderContextEntryList() {
  const context = getParsedContext()
  ensureActiveContextSelection(context)

  const items: string[] = [
    `<div class="explorer-group-label explorer-group-label--with-action">
      <span>Bindings</span>
      <button class="explorer-group-label__action" type="button" onmousedown="event.preventDefault();Playground.promptAddContextBinding()" title="Add binding" aria-label="Add binding">${addIcon}</button>
    </div>`,
  ]
  const bindingNames = getContextBindingNames(context)

  if (bindingNames.length === 0) {
    items.push('<div class="explorer-empty">No bindings yet</div>')
  } else {
    bindingNames.forEach((name, index) => {
      const isActive = isContextBindingActive(context, name)
      const hasParseError = hasContextBindingParseError(context, name)
      const itemClass = `${activeContextEntryKind === 'binding' && activeContextBindingName === name ? ' explorer-item--active' : ''}${isActive ? '' : ' explorer-item--inactive'}`
      const menuId = `context-binding-menu-${index}`
      const encodedName = encodeURIComponent(name)
      const selectAction = `Playground.selectContextBinding(decodeURIComponent('${encodedName}'))`
      const renameAction = `Playground.renameContextBinding(decodeURIComponent('${encodedName}'))`
      const removeAction = `Playground.removeContextBinding(decodeURIComponent('${encodedName}'))`
      const toggleAction = `Playground.toggleContextBindingActive(decodeURIComponent('${encodedName}'))`
      const menuItems: EditorMenuItem[] = [
        { action: `Playground.closeExplorerMenus();${renameAction}`, icon: ICONS.edit, label: 'Rename' },
        { action: `Playground.closeExplorerMenus();${removeAction}`, danger: true, icon: ICONS.trash, label: 'Remove' },
      ]

      items.push(`
        <div class="explorer-item${itemClass}" onmousedown="event.preventDefault();${selectAction}" title="${escapeHtml(name)}">
          <input class="explorer-item__checkbox" type="checkbox" ${isActive ? 'checked' : ''} onmousedown="event.preventDefault();event.stopPropagation();${toggleAction}" aria-label="Toggle ${escapeHtml(name)}">
          <span class="explorer-item__name">${escapeHtml(name)}</span>
          ${hasParseError ? `<span class="explorer-item__warning" title="Binding JSON is invalid">${ICONS.warning}</span>` : ''}
          <span class="explorer-item__actions" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
            <button class="explorer-item__btn" onmousedown="event.preventDefault();event.stopPropagation();Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
            ${renderEditorMenu({ id: menuId, items: menuItems })}
          </span>
        </div>`)
    })
  }

  items.push(`<div class="explorer-group-label explorer-group-label--with-action">
    <span>Effect Handlers</span>
    <button class="explorer-group-label__action" type="button" onmousedown="event.preventDefault();Playground.promptAddContextEffectHandler()" title="Add effect handler" aria-label="Add effect handler">${addIcon}</button>
  </div>`)

  const effectHandlerNames = getContextEffectHandlerNames(context)
  if (effectHandlerNames.length === 0) {
    items.push('<div class="explorer-empty">No effect handlers yet</div>')
  } else {
    effectHandlerNames.forEach((pattern, index) => {
      const isActive = isContextEffectHandlerActive(context, pattern)
      const hasParseError = hasContextEffectHandlerParseError(context, pattern)
      const itemClass = `${activeContextEntryKind === 'effect-handler' && activeContextBindingName === pattern ? ' explorer-item--active' : ''}${isActive ? '' : ' explorer-item--inactive'}`
      const menuId = `context-effect-handler-menu-${index}`
      const encodedPattern = encodeURIComponent(pattern)
      const selectAction = `Playground.selectContextEffectHandler(decodeURIComponent('${encodedPattern}'))`
      const renameAction = `Playground.renameContextEffectHandler(decodeURIComponent('${encodedPattern}'))`
      const removeAction = `Playground.removeContextEffectHandler(decodeURIComponent('${encodedPattern}'))`
      const toggleAction = `Playground.toggleContextEffectHandlerActive(decodeURIComponent('${encodedPattern}'))`
      const menuItems: EditorMenuItem[] = [
        { action: `Playground.closeExplorerMenus();${renameAction}`, icon: ICONS.edit, label: 'Rename' },
        { action: `Playground.closeExplorerMenus();${removeAction}`, danger: true, icon: ICONS.trash, label: 'Remove' },
      ]

      items.push(`
        <div class="explorer-item${itemClass}" onmousedown="event.preventDefault();${selectAction}" title="${escapeHtml(pattern)}">
          <input class="explorer-item__checkbox" type="checkbox" ${isActive ? 'checked' : ''} onmousedown="event.preventDefault();event.stopPropagation();${toggleAction}" aria-label="Toggle ${escapeHtml(pattern)}">
          <span class="explorer-item__name">${escapeHtml(pattern)}</span>
          ${hasParseError ? `<span class="explorer-item__warning" title="Effect handler is invalid">${ICONS.warning}</span>` : ''}
          <span class="explorer-item__actions" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
            <button class="explorer-item__btn" onmousedown="event.preventDefault();event.stopPropagation();Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
            ${renderEditorMenu({ id: menuId, items: menuItems })}
          </span>
        </div>`)
    })
  }

  elements.contextEntryList.innerHTML = items.join('')
}

function commitContextDetailEdits(showError = false): boolean {
  if (isSyncingContextDetail || !activeContextBindingName)
    return true

  if (activeContextEntryKind === 'effect-handler') {
    try {
      compileContextEffectHandlerSource(elements.contextDetailTextArea.value)
      const context = getParsedContext()
      const handlers = getContextEffectHandlers(context).filter(({ pattern }) => pattern !== activeContextBindingName)
      handlers.push({ pattern: activeContextBindingName, handler: elements.contextDetailTextArea.value })
      context[CONTEXT_EFFECT_HANDLERS_KEY] = sortContextEffectHandlers(handlers)
      updateContextEffectHandlerUiEntry(context, activeContextBindingName, entry => {
        delete entry.invalidHandler
        return entry
      })
      const nextContext = formatContextJson(context)
      contextDetailHasParseError = false
      if (nextContext !== getState('context'))
        updateContextState(nextContext, true, undefined, false)
      else
        renderContextEntryList()
      syncContextDetailValidity(true)
      return true
    } catch (error) {
      const context = getParsedContext()
      const handlers = getContextEffectHandlers(context).filter(({ pattern }) => pattern !== activeContextBindingName)
      if (handlers.length > 0)
        context[CONTEXT_EFFECT_HANDLERS_KEY] = sortContextEffectHandlers(handlers)
      else
        delete context[CONTEXT_EFFECT_HANDLERS_KEY]
      updateContextEffectHandlerUiEntry(context, activeContextBindingName, entry => {
        entry.invalidHandler = elements.contextDetailTextArea.value
        return entry
      })
      const nextContext = formatContextJson(context)
      contextDetailHasParseError = true
      if (nextContext !== getState('context'))
        updateContextState(nextContext, true, undefined, false)
      else
        renderContextEntryList()
      syncContextDetailValidity(false)
      if (showError)
        showToast((error as Error).message || 'Effect handler is invalid', { severity: 'error' })
      return false
    }
  }

  try {
    const parsedValue = JSON.parse(elements.contextDetailTextArea.value) as unknown
    const context = getParsedContext()
    const bindings = { ...getContextBindings(context) }
    bindings[activeContextBindingName] = parsedValue
    context.bindings = bindings
    updateContextBindingUiEntry(context, activeContextBindingName, entry => {
      delete entry.invalidJson
      return entry
    })
    const nextContext = formatContextJson(context)
    contextDetailHasParseError = false
    if (nextContext !== getState('context'))
      updateContextState(nextContext, true, undefined, false)
    else
      renderContextEntryList()
    syncContextDetailValidity(true)
    return true
  } catch (_error) {
    const context = getParsedContext()
    const bindings = { ...getContextBindings(context) }
    delete bindings[activeContextBindingName]
    context.bindings = bindings
    updateContextBindingUiEntry(context, activeContextBindingName, entry => {
      entry.invalidJson = elements.contextDetailTextArea.value
      return entry
    })
    const nextContext = formatContextJson(context)
    contextDetailHasParseError = true
    if (nextContext !== getState('context'))
      updateContextState(nextContext, true, undefined, false)
    else
      renderContextEntryList()
    syncContextDetailValidity(false)
    if (showError)
      showToast('Binding JSON is invalid', { severity: 'error' })
    return false
  }
}

export function selectContextBinding(name: string) {
  activeContextEntryKind = 'binding'
  if (activeContextBindingName === name) {
    focusContext()
    return
  }

  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  activeContextBindingName = name
  persistActiveContextSelection()
  syncContextDetailEditor()
  renderContextEntryList()
  syncCodePanelView('context')
  updateCSS()
  focusContext()
}

export function selectContextEffectHandler(pattern: string) {
  activeContextEntryKind = 'effect-handler'
  if (activeContextBindingName === pattern) {
    focusContext()
    return
  }

  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  activeContextBindingName = pattern
  persistActiveContextSelection()
  syncContextDetailEditor()
  renderContextEntryList()
  syncCodePanelView('context')
  updateCSS()
  focusContext()
}

export function toggleContextBindingActive(name: string) {
  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  const context = getParsedContext()
  setContextBindingActive(context, name, !isContextBindingActive(context, name))
  updateContextState(formatContextJson(context), true)
}

export function toggleContextEffectHandlerActive(pattern: string) {
  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  const context = getParsedContext()
  setContextEffectHandlerActive(context, pattern, !isContextEffectHandlerActive(context, pattern))
  updateContextState(formatContextJson(context), true)
}

export function removeContextBinding(name: string) {
  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  const context = getParsedContext()
  const bindings = { ...getContextBindings(context) }
  delete bindings[name]
  context.bindings = bindings

  const bindingUiState = { ...getContextBindingUiState(context) }
  delete bindingUiState[name]
  const uiState = { ...getContextUiState(context) }
  if (Object.keys(bindingUiState).length > 0)
    uiState.bindings = bindingUiState
  else
    delete uiState.bindings

  if (Object.keys(uiState).length > 0)
    context[CONTEXT_UI_STATE_KEY] = uiState
  else
    delete context[CONTEXT_UI_STATE_KEY]

  if (activeContextBindingName === name)
    activeContextBindingName = null

  updateContextState(formatContextJson(context), true)
}

export function removeContextEffectHandler(pattern: string) {
  if (!contextDetailHasParseError && !commitContextDetailEdits(true))
    return

  const context = getParsedContext()
  const handlers = getContextEffectHandlers(context).filter(entry => entry.pattern !== pattern)
  if (handlers.length > 0)
    context[CONTEXT_EFFECT_HANDLERS_KEY] = handlers
  else
    delete context[CONTEXT_EFFECT_HANDLERS_KEY]

  const effectHandlerUiState = { ...getContextEffectHandlerUiState(context) }
  delete effectHandlerUiState[pattern]
  const uiState = { ...getContextUiState(context) }
  if (Object.keys(effectHandlerUiState).length > 0)
    uiState.effectHandlers = effectHandlerUiState
  else
    delete uiState.effectHandlers

  if (Object.keys(uiState).length > 0)
    context[CONTEXT_UI_STATE_KEY] = uiState
  else
    delete context[CONTEXT_UI_STATE_KEY]

  if (activeContextBindingName === pattern)
    activeContextBindingName = null

  updateContextState(formatContextJson(context), true)
}

export function renameContextBinding(name: string) {
  const hasInvalidActiveBinding = contextDetailHasParseError
  if (activeContextBindingName !== name && !hasInvalidActiveBinding && !commitContextDetailEdits(true))
    return

  showNameInputModal('Rename binding', name, newName => {
    if (newName === name)
      return

    const context = getParsedContext()
    if (getContextBindingNames(context).includes(newName)) {
      showToast(`Binding "${newName}" already exists`, { severity: 'error' })
      setTimeout(() => renameContextBinding(name), 0)
      return
    }

    const bindings = { ...getContextBindings(context) }
    if (Object.prototype.hasOwnProperty.call(bindings, name)) {
      bindings[newName] = bindings[name]
      delete bindings[name]
      context.bindings = bindings
    }

    const bindingUiState = { ...getContextBindingUiState(context) }
    if (Object.prototype.hasOwnProperty.call(bindingUiState, name)) {
      bindingUiState[newName] = bindingUiState[name]
      delete bindingUiState[name]
    }

    const uiState = { ...getContextUiState(context) }
    if (Object.keys(bindingUiState).length > 0)
      uiState.bindings = bindingUiState
    else
      delete uiState.bindings

    if (Object.keys(uiState).length > 0)
      context[CONTEXT_UI_STATE_KEY] = uiState
    else
      delete context[CONTEXT_UI_STATE_KEY]

    if (activeContextBindingName === name)
      activeContextBindingName = newName

    updateContextState(formatContextJson(context), true)
    focusContext()
  })
}

export function renameContextEffectHandler(pattern: string) {
  const hasInvalidActiveBinding = contextDetailHasParseError
  if (activeContextBindingName !== pattern && !hasInvalidActiveBinding && !commitContextDetailEdits(true))
    return

  showNameInputModal('Rename effect handler', pattern, newPattern => {
    if (newPattern === pattern)
      return

    const context = getParsedContext()
    if (getContextEffectHandlerNames(context).includes(newPattern)) {
      showToast(`Effect handler "${newPattern}" already exists`, { severity: 'error' })
      setTimeout(() => renameContextEffectHandler(pattern), 0)
      return
    }

    const handlers = getContextEffectHandlers(context).map(entry => {
      if (entry.pattern !== pattern)
        return entry

      return { ...entry, pattern: newPattern }
    })

    if (handlers.length > 0)
      context[CONTEXT_EFFECT_HANDLERS_KEY] = sortContextEffectHandlers(handlers)
    else
      delete context[CONTEXT_EFFECT_HANDLERS_KEY]

    const effectHandlerUiState = { ...getContextEffectHandlerUiState(context) }
    if (Object.prototype.hasOwnProperty.call(effectHandlerUiState, pattern)) {
      effectHandlerUiState[newPattern] = effectHandlerUiState[pattern]
      delete effectHandlerUiState[pattern]
    }

    const uiState = { ...getContextUiState(context) }
    if (Object.keys(effectHandlerUiState).length > 0)
      uiState.effectHandlers = effectHandlerUiState
    else
      delete uiState.effectHandlers

    if (Object.keys(uiState).length > 0)
      context[CONTEXT_UI_STATE_KEY] = uiState
    else
      delete context[CONTEXT_UI_STATE_KEY]

    if (activeContextBindingName === pattern)
      activeContextBindingName = newPattern

    updateContextState(formatContextJson(context), true)
    focusContext()
  }, undefined, { prefix: '@' })
}

export function promptAddContextBinding() {
  const hasInvalidActiveBinding = contextDetailHasParseError
  if (!hasInvalidActiveBinding && !commitContextDetailEdits(true))
    return

  showNameInputModal('Add binding', '', name => {
    const context = getParsedContext()
    const bindings = { ...getContextBindings(context) }
    if (getContextBindingNames(context).includes(name)) {
      showToast(`Binding "${name}" already exists`, { severity: 'error' })
      setTimeout(() => promptAddContextBinding(), 0)
      return
    }

    bindings[name] = {}
    context.bindings = bindings
    if (!hasInvalidActiveBinding) {
      activeContextEntryKind = 'binding'
      activeContextBindingName = name
    }

    updateContextState(formatContextJson(context), true, undefined, !hasInvalidActiveBinding)

    if (hasInvalidActiveBinding)
      showToast(`Added binding "${name}"`)

    focusContext()
  })
}

export function promptAddContextEffectHandler() {
  const hasInvalidActiveEntry = contextDetailHasParseError
  if (!hasInvalidActiveEntry && !commitContextDetailEdits(true))
    return

  showNameInputModal('Add effect handler', '', pattern => {
    const context = getParsedContext()
    if (getContextEffectHandlerNames(context).includes(pattern)) {
      showToast(`Effect handler "${pattern}" already exists`, { severity: 'error' })
      setTimeout(() => promptAddContextEffectHandler(), 0)
      return
    }

    const handlers = getContextEffectHandlers(context)
    handlers.push({ pattern, handler: DEFAULT_CONTEXT_EFFECT_HANDLER_SOURCE })
    context[CONTEXT_EFFECT_HANDLERS_KEY] = sortContextEffectHandlers(handlers)

    if (!hasInvalidActiveEntry) {
      activeContextEntryKind = 'effect-handler'
      activeContextBindingName = pattern
    }

    updateContextState(formatContextJson(context), true, undefined, !hasInvalidActiveEntry)

    if (hasInvalidActiveEntry)
      showToast(`Added effect handler "${pattern}"`)

    focusContext()
  }, undefined, { prefix: '@' })
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
    activeContextEntryKind = 'binding'
    activeContextBindingName = name
    updateContextState(formatContextJson(context), true)

    closeAddContextMenu()
  } catch (_e) {
    elements.newContextError.textContent = 'Invalid JSON'
    elements.newContextError.style.display = 'block'
    elements.newContextValue.focus()
  }

  clearState('new-context-name')
  clearState('new-context-value')
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
    { pattern: 'host.greet', handler: 'async ({ arg, resume }) => { const [name] = Array.isArray(arg) ? arg : [arg]; resume(`Hello, ${name}!`) }' },
    { pattern: 'host.add', handler: 'async ({ arg, resume }) => { const [a, b] = Array.isArray(arg) ? arg : [arg]; resume(a + b) }' },
    { pattern: 'host.delay', handler: `async ({ arg, resume }) => {
  const [ms] = Array.isArray(arg) ? arg : [arg];
  await new Promise(resolve => setTimeout(resolve, ms));
  resume(ms);
}` },
  ]

  const existing = (context.effectHandlers ?? []) as { pattern: string; handler: string }[]
  const existingPatterns = new Set(existing.map(h => h.pattern))
  context.effectHandlers = [...existing, ...sampleEffectHandlers.filter(h => !existingPatterns.has(h.pattern))]

  updateContextState(formatContextJson(context), true)
}

export function newFile() {
  flushPendingAutoSave()
  if (isScratchActive())
    persistScratchFromCurrentState()
  const id = createUntitledFile()
  saveState({
    'active-side-tab': 'files',
    'dvala-code': '',
    'current-file-id': id,
    'dvala-code-edited': false,
    'dvala-code-selection-start': 0,
    'dvala-code-selection-end': 0,
    'dvala-code-scroll-top': 0,
  }, false)
  activateCurrentFileHistory(true)
  elements.dvalaTextArea.value = ''
  syntaxOverlay.update()
  showSideTab('files')
  updateCSS()
  populateSavedFilesList()
  focusDvalaCode()
}

/**
 * Sets the code in the editor.
 * When `onProceed` is provided the entire operation (code change + callback) is
 * run inside `guardCodeReplacement`, so callers never need to add the guard manually.
 */
function setDvalaCode(value: string, pushToHistory: boolean, scroll?: 'top' | 'bottom', onProceed?: () => void) {
  if (onProceed !== undefined) {
    guardCodeReplacement(() => {
      saveState({ 'current-file-id': null, 'dvala-code-edited': false }, false)
      activateCurrentFileHistory(true)
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
    }, false)
    pushActiveDvalaCodeHistoryEntry()
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
  saveState({ 'current-file-id': null, 'dvala-code-edited': false, 'scratch-code': '', 'scratch-context': '' }, false)
  activateCurrentFileHistory(true)
  setDvalaCode('', true)
  updateContextState('', true)
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
  populateSidebarVersion()
  await initSnapshotStorage()
  await initFileHistories()
  await initFiles()
  pruneFileHistories(['<scratch>', ...getSavedFiles().map(file => file.id)])
  initExecutionControlBar()
  syntaxOverlay = new SyntaxOverlay('dvala-textarea')

  syncDvalaCodeHistoryButtons()

  document.addEventListener('click', onDocumentClick, true)

  elements.mainPanel.addEventListener('scroll', () => {
    closeContextMenu()
  })

  window.addEventListener('resize', () => {
    closeMoreMenu()
    closeContextMenu()
  })

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
      startMoveY: event.clientY,
      percentBeforeMove: getState('resize-divider-2-percent'),
    }
  }

  window.onresize = layout
  window.onmouseup = () => {
    document.body.classList.remove('no-select')
    if (moveParams !== null) {
      if (moveParams.id === 'resize-divider-1')
        saveState({ 'resize-divider-1-percent': getState('resize-divider-1-percent') }, false)
      else if (moveParams.id === 'resize-divider-2')
        saveState({ 'resize-divider-2-percent': getState('resize-divider-2-percent') }, false)
    }
    moveParams = null
  }

  window.onmousemove = (event: MouseEvent) => {
    const { windowWidth, windowHeight } = calculateDimensions()
    if (moveParams === null)
      return

    if (moveParams.id === 'resize-divider-1') {
      let resizeDivider1XPercent
        = moveParams.percentBeforeMove + ((event.clientX - moveParams.startMoveX) / windowWidth) * 100
      if (resizeDivider1XPercent < 10)
        resizeDivider1XPercent = 10

      if (resizeDivider1XPercent > 50)
        resizeDivider1XPercent = 50

      updateState({ 'resize-divider-1-percent': resizeDivider1XPercent })
      applyLayout()
    } else if (moveParams.id === 'resize-divider-2') {
      const tabPlayground = document.getElementById('tab-editor')
      const tabHeight = tabPlayground?.clientHeight ?? windowHeight
      let resizeDivider2YPercent
        = moveParams.percentBeforeMove + ((event.clientY - moveParams.startMoveY) / tabHeight) * 100
      if (resizeDivider2YPercent < 10)
        resizeDivider2YPercent = 10
      if (resizeDivider2YPercent > 90)
        resizeDivider2YPercent = 90

      updateState({ 'resize-divider-2-percent': resizeDivider2YPercent })
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
      if (document.activeElement === elements.dvalaTextArea && !elements.dvalaTextArea.readOnly) {
        evt.preventDefault()
        undoDvalaCodeHistory()
      }
    }
    if (((isMac() && evt.metaKey) || (!isMac && evt.ctrlKey)) && evt.shiftKey && evt.key === 'z') {
      if (document.activeElement === elements.dvalaTextArea && !elements.dvalaTextArea.readOnly) {
        evt.preventDefault()
        redoDvalaCodeHistory()
      }
    }
  })
  elements.contextTextArea.addEventListener('keydown', evt => {
    keydownHandler(evt, () => updateContextState(elements.contextTextArea.value, true))
  })
  elements.contextTextArea.addEventListener('input', () => {
    updateContextState(elements.contextTextArea.value, true)
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
  elements.contextDetailTextArea.addEventListener('keydown', evt => {
    keydownHandler(evt, () => {
      commitContextDetailEdits(false)
    })
  })
  elements.contextDetailTextArea.addEventListener('input', () => {
    commitContextDetailEdits(false)
  })
  elements.contextDetailTextArea.addEventListener('focusin', () => {
    saveState({ 'focused-panel': 'context' })
    updateCSS()
  })
  elements.contextDetailTextArea.addEventListener('focusout', () => {
    commitContextDetailEdits(false)
    saveState({ 'focused-panel': null })
    updateCSS()
  })

  elements.dvalaTextArea.addEventListener('keydown', evt => {
    keydownHandler(evt, () => {
      setDvalaCode(elements.dvalaTextArea.value, true)
      if (getState('current-file-id') === null) scheduleScratchEditedClear()
      else saveState({ 'dvala-code-edited': true })
      updateCSS()
    })
  })
  elements.dvalaTextArea.addEventListener('input', () => {
    setDvalaCode(elements.dvalaTextArea.value, true)
    if (getState('current-file-id') === null) scheduleScratchEditedClear()
    else saveState({ 'dvala-code-edited': true })
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
  populateSavedFilesList()

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
  const activeView = normalizeSideTab(urlParams.get('view'))
  saveState({ 'active-side-tab': activeView }, false)

  const urlBindingName = urlParams.get('bindingName')
  const urlContextEntryKind = urlParams.get('contextEntryKind') === 'effect-handler' ? 'effect-handler' : 'binding'
  if (activeView === 'context') {
    activeContextBindingName = urlBindingName ?? getState('current-context-binding-name')
    activeContextEntryKind = urlBindingName ? urlContextEntryKind : getState('current-context-entry-kind')
    saveState({
      'current-context-binding-name': activeContextBindingName,
      'current-context-entry-kind': activeContextEntryKind,
    }, false)
  }

  const urlFileId = urlParams.get('fileId')
  if (activeView === 'files' && urlFileId && getState('current-file-id') !== urlFileId) {
    const file = getSavedFiles().find(entry => entry.id === urlFileId)
    if (file) {
      if (isScratchActive())
        persistScratchFromCurrentState()
      saveState({
        'context': file.context,
        'current-file-id': file.id,
        'dvala-code': file.code,
        'dvala-code-edited': false,
        'dvala-code-scroll-top': 0,
        'dvala-code-selection-end': 0,
        'dvala-code-selection-start': 0,
      }, false)
    }
  }

  const urlSnapshotId = urlParams.get('snapshotId')
  if (activeView === 'snapshots' && urlSnapshotId && getActiveSnapshotUrlId() !== urlSnapshotId) {
    const savedIndex = getSavedSnapshots().findIndex(entry => entry.snapshot.id === urlSnapshotId)
    if (savedIndex >= 0) {
      activeSnapshotKey = `saved:${savedIndex}`
    } else {
      const terminalIndex = getTerminalSnapshots().findIndex(entry => entry.snapshot.id === urlSnapshotId)
      activeSnapshotKey = terminalIndex >= 0 ? `terminal:${terminalIndex}` : null
    }
  }

  const urlState = urlParams.get('state')
  if (urlState) {
    // Always clean the URL immediately so a refresh doesn't re-trigger
    urlParams.delete('state')
    history.replaceState(null, '', `${location.pathname}${urlParams.toString() ? '?' : ''}${urlParams.toString()}`)

    // Decode the incoming state to check for context
    let incomingState: Record<string, unknown>
    try {
      incomingState = JSON.parse(decodeURIComponent(atob(urlState))) as Record<string, unknown>
    } catch {
      showToast('Invalid state URL parameter', { severity: 'error' })
      return
    }

    const incomingContext = typeof incomingState['context'] === 'string' ? incomingState['context'].trim() : ''
    const currentContext = getState('context').trim()

    const applyImport = (contextMode: 'ignore' | 'replace' | 'append') => {
      guardCodeReplacement(() => {
        // Handle context based on user choice
        if (contextMode === 'ignore') {
          delete incomingState['context']
        } else if (contextMode === 'append' && currentContext) {
          // Merge context: parse both as JSON, merge bindings and handlers
          try {
            const current = JSON.parse(currentContext) as Record<string, unknown>
            const incoming = JSON.parse(incomingContext) as Record<string, unknown>
            const merged: Record<string, unknown> = {}
            // Merge bindings
            const currentBindings = (current.bindings ?? {}) as Record<string, unknown>
            const incomingBindings = (incoming.bindings ?? {}) as Record<string, unknown>
            merged.bindings = { ...currentBindings, ...incomingBindings }
            // Merge effect handlers
            const currentHandlers = (current.effectHandlers ?? []) as unknown[]
            const incomingHandlers = (incoming.effectHandlers ?? []) as unknown[]
            merged.effectHandlers = [...currentHandlers, ...incomingHandlers]
            incomingState['context'] = JSON.stringify(merged, null, 2)
          } catch {
            // If merge fails, just replace
            incomingState['context'] = incomingContext
          }
        }
        // Apply the state
        saveState({ 'current-file-id': null, 'dvala-code-edited': false }, false)
        activateCurrentFileHistory(true)
        if (applyEncodedState(btoa(encodeURIComponent(JSON.stringify(incomingState)))))
          showToast('State loaded from URL')
        else
          showToast('Failed to apply state', { severity: 'error' })
        applyState()
      })
    }

    // If incoming state has context AND current state has context, ask the user
    if (incomingContext && currentContext) {
      const { panel, body } = createModalPanel({
        size: 'small',
        footerActions: [
          { label: 'Ignore context', action: () => { popModal(); applyImport('ignore') } },
          { label: 'Replace', action: () => { popModal(); applyImport('replace') } },
          { label: 'Append', primary: true, action: () => { popModal(); applyImport('append') } },
        ],
      })
      const msg = document.createElement('div')
      msg.className = 'modal-body-row'
      msg.textContent = 'The shared link includes context data, and you already have context. What should happen with the incoming context?'
      body.appendChild(msg)
      pushPanel(panel, 'Import context')
    } else {
      // No conflict — just apply (replace or no context)
      applyImport('replace')
    }
    return
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
  // chapter pages
  if (pageId.startsWith('chapter-')) return `/book/${pageId.slice(8)}`
  // special static pages — map to router paths expected by routeToPath
  if (pageId === 'settings-page') return '/settings'
  // reference pages: pageId is the linkName like 'collection-map'
  return `/ref/${pageId}`
}

/** Static page IDs that live as real DOM elements (show/hide via active-content). */
const STATIC_PAGES = new Set(['settings-page'])

// ─── Tab state memory ─────────────────────────────────────────────────────────

// Remembers the last visited path per top-level tab so switching back restores position.
const lastTabPath: Record<string, string> = {
  ref: '/ref',
  examples: '/examples',
  book: '/book',
  settings: '/settings',
  home: '/',
}

/** Navigate to the last remembered path for a top-level tab section. */
export function navigateToTab(section: string): void {
  router.navigate(lastTabPath[section] ?? `/${section}`)
}

/**
 * Route to the given app-relative path.
 * Dynamic content pages render HTML into #dynamic-page.
 * Static pages (settings) use the old show/hide mechanism.
 */
/** Switch the visible tab pane. */
function activateTab(tabId: string): void {
  document.querySelectorAll('.tab-pane').forEach(el => {
    (el as HTMLElement).style.display = 'none'
  })
  const pane = document.getElementById(`tab-${tabId}`)
  if (pane) pane.style.display = ''
  // Re-apply layout when switching to playground so panels resize correctly
  if (tabId === 'editor') applyLayout()
}

/** Highlight the active tab button. */
function highlightTabButton(buttonId: string): void {
  document.querySelectorAll('.tab-bar__tab').forEach(el => el.classList.remove('tab-bar__tab--active'))
  const btn = document.getElementById(`tab-btn-${buttonId}`)
  if (btn) btn.classList.add('tab-bar__tab--active')
}

/** Map a route path to a tab ID (pane). All non-editor routes share the home pane. */
function getTabForPath(path: string): string {
  if (path === 'editor') return 'editor'
  return 'home'
}

/** Map a route path to the tab button to highlight. */
function getTabButtonForPath(path: string): string {
  if (path === 'editor') return 'editor'
  if (path.startsWith('book')) return 'book'
  if (path.startsWith('examples')) return 'examples'
  if (path.startsWith('ref')) return 'ref'
  if (path === 'settings' || path.startsWith('settings/')) return 'settings'
  return 'home'
}

function routeToPath(appPath: string): void {
  const path = appPath.replace(/^\//, '')

  // Activate the correct tab pane and highlight the tab button
  activateTab(getTabForPath(path))
  const tabButton = getTabButtonForPath(path)
  highlightTabButton(tabButton)

  // Remember the last visited path for this tab section (used by navigateToTab)
  if (tabButton !== 'editor' && tabButton in lastTabPath)
    lastTabPath[tabButton] = appPath || '/'

  // Editor tab doesn't need dynamic content rendering — just re-sync the URL to reflect
  // the current side panel state (e.g. ?view=context), which is lost when navigating away.
  if (path === 'editor') {
    document.title = 'Editor | Dvala'
    syncPlaygroundUrlState(normalizeSideTab(getState('active-side-tab')))
    return
  }

  // Determine if this is a static page that already exists in the DOM
  let staticPageId: string | null = null
  if (path === 'settings' || path.startsWith('settings/')) staticPageId = 'settings-page'

  if (staticPageId && STATIC_PAGES.has(staticPageId)) {
    // Clear any dynamic page content, then show the static page
    const dynPage = document.getElementById('dynamic-page')
    if (dynPage) dynPage.innerHTML = ''
    const tab = path.startsWith('settings/') ? path.slice(9) : undefined
    showPage(staticPageId, 'instant', 'none', tab)
    document.title = 'Settings | Dvala'
    return
  }

  // Legacy routes — redirect before rendering
  if (path === 'core' || path === 'modules') {
    router.navigate('/ref', true)
    return
  }

  // For all other paths, render dynamically into #dynamic-page
  inactivateAll()
  closeSearch()
  elements.mainPanel.scrollTo({ top: 0 })

  const dynPage = document.getElementById('dynamic-page')
  if (!dynPage) return

  // Determine which sidebar link to highlight
  let sidebarLinkId: string | null = null // eslint-disable-line no-useless-assignment
  let pageTitle = 'Dvala'

  if (!path || path === '/') {
    dynPage.innerHTML = renderStartPage()
    sidebarLinkId = 'home-page_link'
    pageTitle = 'Dvala - Suspendable Functional Language for JavaScript'
  } else if (path === 'ref') {
    dynPage.innerHTML = renderReferenceIndexPage()
    sidebarLinkId = 'ref-page_link'
    pageTitle = 'Reference | Dvala'
  } else if (path === 'examples') {
    dynPage.innerHTML = renderExampleIndexPage()
    sidebarLinkId = 'example-page_link'
    pageTitle = 'Examples | Dvala'
  } else if (path.startsWith('examples/')) {
    const exId = path.slice('examples/'.length)
    dynPage.innerHTML = renderExampleDetailPage(exId)
    sidebarLinkId = 'example-page_link'
    const data = window.referenceData
    const ex = data?.examples.find(e => e.id === exId)
    pageTitle = ex ? `${ex.name} | Dvala Examples` : 'Examples | Dvala'
  } else if (path === 'book') {
    dynPage.innerHTML = renderBookIndexPage()
    sidebarLinkId = 'book-page_link'
    pageTitle = 'The Book | Dvala'
  } else if (path.startsWith('book/')) {
    const chapId = path.slice('book/'.length)
    dynPage.innerHTML = renderChapterPage(chapId)
    sidebarLinkId = 'book-page_link'
    const chapter = allChapters.find(t => t.id === chapId)
    pageTitle = chapter ? `${chapter.title} | The Dvala Book` : 'The Dvala Book'
    // Scroll to anchor if URL has a hash (e.g. on page reload)
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1))
      if (target) target.scrollIntoView()
    }
  } else if (path.startsWith('ref/')) {
    const subPath = path.slice('ref/'.length)
    sidebarLinkId = 'ref-page_link'
    // Check if it's a section page (core, modules, effects, playground)
    const section = REF_SECTIONS.find(s => s.id === subPath)
    if (section) {
      dynPage.innerHTML = renderReferenceSectionPage(subPath)
      pageTitle = `${section.title} | Dvala Reference`
    } else if (subPath.startsWith('modules/')) {
      // Module detail page: /ref/modules/:name
      const moduleName = subPath.slice('modules/'.length)
      dynPage.innerHTML = renderReferenceModulePage(moduleName)
      pageTitle = `${moduleName} | Dvala Reference`
    } else {
      // Individual doc page
      dynPage.innerHTML = renderDocPage(subPath)
      const data = window.referenceData
      if (data) {
        const entry = data.searchEntries.find(e => e.linkName === subPath)
        pageTitle = entry ? `${entry.title} | Dvala Reference` : 'Reference | Dvala'
      }
    }
  } else {
    dynPage.innerHTML = renderStartPage()
    sidebarLinkId = 'home-page_link'
    pageTitle = 'Dvala - A Suspendable Runtime with Algebraic Effects'
  }

  document.title = pageTitle

  // Highlight the sidebar link
  if (sidebarLinkId) {
    const link = document.getElementById(sidebarLinkId)
    if (link) link.classList.add('active-sidebar-entry')
  }
}

export async function run() {
  addOutputSeparator()
  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Run selection' : 'Run'

  appendOutput(title, 'comment')

  const startTime = performance.now()
  document.body.classList.add('dvala-running')
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

  // Execution timeout: 5 seconds, paused while a host effect handler is running.
  // This prevents async handlers (like dvala.io.read waiting for user input) from
  // triggering the timeout.
  const TIMEOUT_MS = 5000
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let rejectTimeout: ((err: Error) => void) | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectTimeout = reject
    timeoutId = setTimeout(() => reject(new Error('Execution timed out (5s). Infinite loop?')), TIMEOUT_MS)
  })
  const pauseTimeout = () => {
    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null }
  }
  const resetTimeout = () => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => rejectTimeout?.(new Error('Execution timed out (5s). Infinite loop?')), TIMEOUT_MS)
  }
  // Wrap each effect handler: pause timeout during handler, resume after
  const wrappedHandlers = dvalaParams.effectHandlers.map(reg => ({
    ...reg,
    handler: (ctx: EffectContext) => {
      pauseTimeout()
      const result = reg.handler(ctx)
      // If handler returns a Promise (async), resume timeout when it settles
      if (result instanceof Promise) {
        return result.finally(() => resetTimeout())
      }
      resetTimeout()
      return result
    },
  }))

  const hijacker = hijackConsole()
  try {
    const pure = getState('pure')
    const disableAutoCheckpoint = getState('disable-auto-checkpoint')
    const runResult = await Promise.race([
      getDvala().runAsync(code, pure
        ? { bindings: dvalaParams.bindings, pure: true, disableAutoCheckpoint, terminalSnapshot: true }
        : { bindings: dvalaParams.bindings, effectHandlers: wrappedHandlers, disableAutoCheckpoint, terminalSnapshot: true },
      ),
      timeoutPromise,
    ])
    if (runResult.type === 'error') {
      if (runResult.snapshot) {
        saveTerminalSnapshot(runResult.snapshot, 'error')
      }
      throw runResult.error
    }
    if (runResult.type === 'suspended') {
      appendOutput('File suspended', 'comment')
      void openSnapshotModal(runResult.snapshot)
      return
    }
    if (runResult.type === 'halted') {
      appendOutput('File halted', 'comment')
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
    const elapsed = performance.now() - startTime
    appendOutput(elapsed < 1000 ? `${Math.round(elapsed)}ms` : `${(elapsed / 1000).toFixed(2)}s`, 'comment')
    if (timeoutId !== null) clearTimeout(timeoutId)
    document.body.classList.remove('dvala-running')
    // Restore UI state modified by playground effects
    if (getState('dvala-code') !== uiSnapshot.dvalaCode) {
      elements.dvalaTextArea.value = uiSnapshot.dvalaCode
      syntaxOverlay.update()
      saveState({ 'dvala-code': uiSnapshot.dvalaCode }, false)
    }
    if (getState('context') !== uiSnapshot.context) {
      updateContextState(uiSnapshot.context, false)
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

  appendOutput(title, 'comment')

  const startTime = performance.now()
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
    const elapsed = performance.now() - startTime
    appendOutput(elapsed < 1000 ? `${Math.round(elapsed)}ms` : `${(elapsed / 1000).toFixed(2)}s`, 'comment')
    hijacker.releaseConsole()
    focusDvalaCode()
  }
}

export function analyze() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Analyze selection' : 'Analyze'

  appendOutput(title, 'comment')

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

export function showFeatureCard(id: string) {
  const card = getFeatureCard(id)
  if (!card) return
  const { panel } = createModalPanel({
    size: 'medium',
    icon: card.icon,
    markdown: card.markdown,
    onClose: () => { popModal() },
  })
  pushPanel(panel, card.title)
}

export function parse() {
  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Parse selection' : 'Parse'

  try {
    const tokens = tokenizeSource(code, true) // always debug for source map positions
    const ast = parseTokenStream(tokens)
    console.log(ast)
    showAstTreeModal(ast, title)
  } catch (error) {
    addOutputSeparator()
    appendOutput(title, 'comment')
    appendOutput(error, 'error')
    focusDvalaCode()
  }
}

function showAstTreeModal(ast: Ast, title: string) {
  const { panel, body } = createModalPanel({
    size: 'large',
    onClose: () => { popModal(); focusDvalaCode() },
  })

  const treeViewer = createAstTreeViewer({ ast })

  body.style.minHeight = '0'
  body.appendChild(treeViewer)

  pushPanel(panel, title)
}

export function tokenize() {
  addOutputSeparator()

  const selectedCode = getSelectedDvalaCode()
  const code = selectedCode.code || getState('dvala-code')
  const title = selectedCode.code ? 'Tokenize selection' : 'Tokenize'

  appendOutput(`${title}${getState('debug') ? ' (debug)' : ''}`, 'comment')

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

  appendOutput(title, 'comment')

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
  elements.contextDetailTextArea.focus()
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
    if (entry.icon) {
      span.innerHTML = `<span class="breadcrumb-icon">${entry.icon}</span> ${entry.label}`
    } else {
      span.textContent = entry.label
    }
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
    ref('effectName').textContent = snapshot.effectName

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
    metaContainer.innerHTML = '<span style="font-size:0.75rem; color: var(--color-text-faintest); font-style: italic;">(no metadata)</span>'
  } else {
    const metaJson = JSON.stringify(snapshot.meta, null, 2)
    metaContainer.innerHTML = renderCodeBlock({ code: metaJson, language: 'json', noRun: true, noEdit: true })
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
  const { panel, body } = createModalPanel({ size: 'large' })

  // Build the snapshot body content
  body.innerHTML = `
    <div class="snapshot-panel__columns">
      <div class="snapshot-panel__col">
        <div class="snapshot-panel__section">
          <span class="snapshot-panel__section-label">Metadata</span>
          <div data-ref="meta-container"></div>
        </div>
        <div data-ref="suspended-effect-section" class="snapshot-panel__section">
          <span class="snapshot-panel__section-label">Effect</span>
          <div class="snapshot-panel__field">
            <span class="snapshot-panel__field-label">Name</span>
            <code data-ref="effectName" class="snapshot-panel__effect-name"></code>
          </div>
          <div data-ref="effect-args" class="snapshot-panel__effect-args fancy-scroll"></div>
        </div>
        <div class="snapshot-panel__section">
          <span class="snapshot-panel__section-label">Technical</span>
          <div data-ref="tech" class="snapshot-panel__tech"></div>
        </div>
      </div>
      <div class="snapshot-panel__col">
        <div class="snapshot-panel__section">
          <span class="snapshot-panel__section-label">Checkpoints (<span data-ref="cp-count">0</span>)</span>
          <div data-ref="checkpoints" class="snapshot-panel__checkpoints fancy-scroll"></div>
        </div>
      </div>
    </div>
  `

  // Build the footer with action buttons
  const footer = document.createElement('div')
  footer.className = 'modal-panel__footer'
  footer.style.justifyContent = 'space-between'
  footer.innerHTML = `
    <div class="snapshot-panel__buttons-left">
      <button data-ref="save-btn" class="button">${saveIcon} Save</button>
      <button data-ref="share-btn" class="button">${shareIcon} Share</button>
      <button data-ref="download-btn" class="button">${downloadIcon} Download</button>
      <button data-ref="copy-json-btn" class="button">${copyIcon} Copy JSON</button>
    </div>
    <button data-ref="resume-btn" class="button button--primary">Run</button>
  `
  panel.appendChild(footer)

  const q = (ref: string) => panel.querySelector(`[data-ref="${ref}"]`) as HTMLElement

  q('resume-btn').addEventListener('click', () => { void resumeSnapshot() })

  q('save-btn').addEventListener('click', () => {
    const snap = currentSnapshot
    if (!snap) return
    pushSavePanel((name: string) => {
      const existing = getSavedSnapshots().filter(s => s.snapshot.id !== snap.id)
      existing.unshift({ kind: 'saved', snapshot: snap, savedAt: Date.now(), locked: false, name: name || undefined })
      setSavedSnapshots(existing)

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
  modalStack.push({ panel, label, icon: panel.dataset.icon, snapshot: snapshot ?? (currentSnapshot ?? null), isEffect })
  buildBreadcrumbs(panel)

  if (!isRoot) {
    // Slide in from right
    panel.animate(
      [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      { duration: 250, easing: 'ease', fill: 'forwards' },
    )
  } else {
    const size = panel.dataset.size as ModalSize | undefined
    elements.snapshotPanelContainer.style.maxWidth = isEffect ? '480px' : size ? modalSizeMap[size] : ''
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
type ModalSize = 'small' | 'medium' | 'large'

const modalSizeMap: Record<ModalSize, string> = {
  small: '480px',
  medium: '800px',
  large: '1200px',
}

interface ModalPanelOptions {
  title?: string
  icon?: string
  size?: ModalSize
  markdown?: string
  hamburgerItems?: { label: string; action: () => void }[]
  footerActions?: { label: string; primary?: boolean; action: () => void }[]
  noClose?: boolean
  onClose?: () => void
}

function createModalPanel(options?: ModalPanelOptions): { panel: HTMLElement; body: HTMLElement; footer: HTMLElement | null } {
  const panel = document.createElement('div')
  panel.className = 'modal-panel'
  if (options?.size) {
    panel.dataset.size = options.size
  }
  if (options?.icon) {
    panel.dataset.icon = options.icon
  }

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
  if (options?.markdown) {
    body.innerHTML = `<div class="book-page">${renderDvalaMarkdown(options.markdown)}</div>`
  }
  panel.appendChild(body)

  let footer: HTMLElement | null = null
  if (options?.footerActions?.length) {
    footer = document.createElement('div')
    footer.className = 'modal-panel__footer'
    for (const action of options.footerActions) {
      const btn = document.createElement('button')
      btn.className = action.primary ? 'button button--primary' : 'button'
      btn.textContent = action.label
      btn.addEventListener('click', () => action.action())
      footer.appendChild(btn)
    }
    panel.appendChild(footer)
  }

  return { panel, body, footer }
}

/** Slide in a "Save As" form panel within the snapshot modal. */
function pushSavePanel(onSave: (name: string) => void) {
  const panel = document.createElement('div')
  panel.className = 'modal-panel'
  panel.innerHTML = `
    <div class="modal-header">
      <div data-ref="breadcrumbs" class="snapshot-panel__breadcrumbs"></div>
    </div>
    <div class="modal-panel__body" style="display:flex;flex-direction:column;gap:var(--space-2);">
      <label for="save-snapshot-name" class="snapshot-panel__section-label">Name (optional)</label>
      <input id="save-snapshot-name" type="text" class="readline-input" placeholder="My snapshot…" style="width:100%;box-sizing:border-box;">
    </div>
    <div class="modal-panel__footer">
      <button class="button cancel-btn">Cancel</button>
      <button class="button button--primary save-btn" style="margin-left:auto;">Save</button>
    </div>
  `
  const input = panel.querySelector('input') as HTMLInputElement
  const dismissSavePanel = () => popModal()
  const doSave = () => { onSave(input.value.trim()); dismissSavePanel() }
  panel.querySelector('.cancel-btn')!.addEventListener('click', dismissSavePanel)
  panel.querySelector('.save-btn')!.addEventListener('click', doSave)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave()
    else if (e.key === 'Escape') dismissSavePanel()
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

// ─── Inline snapshot view (in code panel) ────────────────────────────────────

interface SnapshotBreadcrumb {
  label: string
  snapshot: Snapshot
}

const snapshotViewStack: SnapshotBreadcrumb[] = []

function renderSnapshotBreadcrumbs() {
  const container = document.getElementById('dvala-header-snapshot')
  if (!container) return

  container.innerHTML = snapshotViewStack.map((bc, i) => {
    const isLast = i === snapshotViewStack.length - 1
    if (isLast) {
      return `<span class="snapshot-breadcrumbs__current">${escapeHtml(bc.label)}</span>`
    }
    return `<a class="snapshot-breadcrumbs__link" href="#" onclick="event.preventDefault();Playground.navigateSnapshotBreadcrumb(${i})">${escapeHtml(bc.label)}</a><span class="snapshot-breadcrumbs__sep">›</span>`
  }).join('')
}

function syncSnapshotExecutionControls() {
  if (!snapshotExecutionControlsVisible || !currentSnapshot) {
    hideExecutionControlBar()
    return
  }

  if (currentSnapshot.terminal === true) {
    showExecutionControlBarTerminal()
  } else {
    showExecutionControlBarPaused()
  }
}

function showSnapshotInPanel(snapshot: Snapshot, showExecutionControls = snapshotExecutionControlsVisible) {
  const content = document.getElementById('snapshot-content')
  const footerHost = document.getElementById('snapshot-footer')
  if (!content || !footerHost) return

  // Set current snapshot for the control bar and other functions
  currentSnapshot = snapshot
  snapshotExecutionControlsVisible = showExecutionControls

  // Render the snapshot panel content (reuse existing panel builder)
  const error = getSnapshotError(snapshot)
  const panel = createSnapshotPanel(snapshot, error)
  // Extract just the body content from the panel (skip modal header/footer)
  const body = panel.querySelector('.modal-panel__body')
  const footer = panel.querySelector('.modal-panel__footer')
  content.innerHTML = ''
  footerHost.innerHTML = ''
  if (body) content.appendChild(body)
  if (footer) footerHost.appendChild(footer)

  // Update breadcrumbs and sync the panel view
  renderSnapshotBreadcrumbs()
  syncCodePanelView('snapshots')
  syncSnapshotExecutionControls()
}

function replaceSnapshotView(snapshot: Snapshot, label = 'Snapshot') {
  snapshotViewStack.splice(0)
  snapshotViewStack.push({ label, snapshot })
  showSnapshotInPanel(snapshot, false)
}

export function openSnapshotModal(snapshot: Snapshot): Promise<void> {
  // Push onto the breadcrumb stack and render in the code panel
  const label = snapshotViewStack.length === 0 ? 'Snapshot' : `Checkpoint ${snapshotViewStack.length}`
  snapshotViewStack.push({ label, snapshot })
  showSnapshotInPanel(snapshot, true)

  return new Promise<void>(resolve => {
    resolveSnapshotModal = resolve
  })
}

export function navigateSnapshotBreadcrumb(index: number) {
  // Pop back to the given breadcrumb level
  while (snapshotViewStack.length > index + 1) {
    snapshotViewStack.pop()
  }
  const bc = snapshotViewStack[index]
  if (bc) showSnapshotInPanel(bc.snapshot)
}

export function closeSnapshotView() {
  // Clear stack and active snapshot
  snapshotViewStack.splice(0)
  activeSnapshotKey = null
  populateSideSnapshotsList()
  currentSnapshot = null
  snapshotExecutionControlsVisible = false
  resolveSnapshotModal?.()
  resolveSnapshotModal = null
  hideExecutionControlBar()

  // Sync view — will show empty or editor depending on side tab
  syncCodePanelView()
  syncPlaygroundUrlState(normalizeSideTab(getCurrentSideTab()))
}

export function slideBackSnapshotModal() {
  if (modalStack.length <= 1) return
  popModal()
}

function restoreInlineSnapshotContext() {
  currentSnapshot = snapshotViewStack[snapshotViewStack.length - 1]?.snapshot ?? null
  if (getCurrentSideTab() === 'snapshots' && currentSnapshot && snapshotExecutionControlsVisible) {
    syncSnapshotExecutionControls()
    return
  }
  hideExecutionControlBar()
}

/** Pop the current panel. Last panel fades out; sub-panels slide out. */
export function popModal() {
  if (modalStack.length === 0) return

  if (modalStack.length === 1) {
    // Clear state immediately so follow-up effects see a clean stack
    const dyingPanel = modalStack[0]!.panel
    modalStack.length = 0
    resolveSnapshotModal?.()
    resolveSnapshotModal = null
    restoreInlineSnapshotContext()

    // Fade out overlay and panel together
    const overlay = elements.snapshotModal
    const container = elements.snapshotPanelContainer
    overlayCloseAnimation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease' })
    overlayCloseAnimation.onfinish = () => {
      overlayCloseAnimation = null
      overlay.style.display = 'none'
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
  restoreInlineSnapshotContext()
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
  const actions: ModalPanelOptions['footerActions'] = []
  if (onConfirm) {
    actions.push({ label: 'Cancel', action: () => dismissInfoModal() })
  }
  actions.push({ label: 'OK', primary: true, action: () => closeInfoModal() })

  const { panel, body } = createModalPanel({
    size: 'small',
    footerActions: actions,
  })

  const messageEl = document.createElement('div')
  messageEl.className = 'modal-body-row'
  messageEl.textContent = message
  body.appendChild(messageEl)

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
  const includeFiles = elements.exportOptSavedFiles.checked

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
    ...(includeFiles ? { savedFiles: getSavedFiles() } : {}),
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
  savedFiles?: SavedFile[]
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
        const hasFiles = (parsed.savedFiles?.length ?? 0) > 0

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
        setup(elements.importOptSavedFiles, elements.importOptSavedFilesLabel, hasFiles)

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

  const payloadFiles = payload.savedFiles
  if (elements.importOptSavedFiles.checked && payloadFiles) {
    const existingIds = new Set(getSavedFiles().map(p => p.id))
    const existingNames = new Set(getSavedFiles().map(p => p.name))
    const toAdd = payloadFiles
      .filter(p => !existingIds.has(p.id))
      .map(file => {
        const normalizedName = getUniqueSavedFileName(file.name, existingNames)
        existingNames.add(normalizedName)
        return { ...file, name: normalizedName }
      })
    const conflicts = payloadFiles.length - toAdd.length
    if (toAdd.length > 0) {
      setSavedFiles([...getSavedFiles(), ...toAdd])
      imported.push(`${toAdd.length} saved file${toAdd.length !== 1 ? 's' : ''}`)
    }
    if (conflicts > 0)
      skipped.push(`${conflicts} saved file${conflicts !== 1 ? 's' : ''} (already exist)`)
  }

  populateSnapshotsList()
  populateSavedFilesList()
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
  populateSnapshotsList({ animateNewTerminal: true })
  const toastMessages = { completed: 'File completed — snapshot captured', error: 'File failed — snapshot captured', halted: 'File halted — snapshot captured' }
  showToast(toastMessages[resultType], resultType === 'error' ? { severity: 'error' } : undefined)
}

export async function clearTerminalSnapshot(index: number): Promise<void> {
  await animateCardRemoval('terminal', index)
  const entries = getTerminalSnapshots()
  entries.splice(index, 1)
  setTerminalSnapshots(entries)
  populateSnapshotsList()
}

function promptSnapshotName(onSave: (name: string) => void | Promise<void>) {
  // Footer action references the input, so we build it after creating the body content
  const { panel, body } = createModalPanel({ size: 'small' })

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

  // Manually add footer since action depends on input value
  const footer = document.createElement('div')
  footer.className = 'modal-panel__footer'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'button button--primary'
  saveBtn.textContent = 'Save'
  saveBtn.addEventListener('click', doSave)
  footer.appendChild(saveBtn)
  panel.appendChild(footer)

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
      appendOutput('File suspended', 'comment')
      void openSnapshotModal(runResult.snapshot)
      return
    }
    if (runResult.type === 'halted') {
      appendOutput('File halted', 'comment')
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
  if (ctx.effectName === 'dvala.io.readStdin' || ctx.effectName.startsWith('dvala.random') || ctx.effectName.startsWith('dvala.time') || ctx.effectName === 'dvala.sleep') {
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

  const { panel, body } = createModalPanel({ size: 'small', noClose: true })
  effectPanelBodyEl = body
  // Effect modal dynamically populates footer — create it manually
  const footer = document.createElement('div')
  footer.className = 'modal-panel__footer'
  panel.appendChild(footer)
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

  const failEffect = makeFailHelper(ctx, resolve)

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
      if (failEffect.renderFooterOverride(el))
        return
      const failBtn = document.createElement('button')
      failBtn.className = 'button button--danger'
      failBtn.textContent = 'Fail…'
      failBtn.addEventListener('click', failEffect.enter)
      const btn = document.createElement('button')
      btn.className = 'button button--primary'
      btn.textContent = 'Resume'
      btn.addEventListener('click', submit)
      el.appendChild(failBtn)
      el.appendChild(btn)
    },
    onKeyDown(evt) {
      if (failEffect.onKeyDown(evt))
        return true
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

/**
 * Reusable fail-input helper for standard effect modals.
 * Call `enter()` to switch to the fail-input UI, and delegate `renderFooterOverride` / `onKeyDown` from the host entry.
 */
function makeFailHelper(ctx: EffectContext, resolve: () => void) {
  let active = false
  let inputEl: HTMLTextAreaElement | null = null

  const rerender = () => {
    if (!effectPanelFooterEl)
      return
    effectPanelFooterEl.innerHTML = ''
    const current = pendingEffects[pendingEffects.length - 1]
    current?.renderFooter(effectPanelFooterEl)
    if (active)
      void Promise.resolve().then(() => inputEl?.focus())
  }

  const enter = () => {
    active = true
    rerender()
  }

  const cancel = () => {
    active = false
    inputEl = null
    rerender()
  }

  const confirm = () => {
    const raw = inputEl?.value.trim() ?? ''
    ctx.fail(raw || undefined)
    resolve()
    resolveCurrentEffect()
  }

  /** If active, renders the fail-input UI into `el` and returns true. Otherwise returns false. */
  const renderFooterOverride = (el: HTMLElement): boolean => {
    if (!active) {
      el.style.flexDirection = ''
      el.style.alignItems = ''
      return false
    }
    el.style.flexDirection = 'column'
    el.style.alignItems = 'stretch'

    const label = document.createElement('label')
    label.className = 'effect-modal__input-label'
    label.textContent = 'Error message (optional)'

    inputEl = document.createElement('textarea')
    inputEl.rows = 4
    inputEl.className = 'effect-modal__textarea'
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        confirm()
      }
    })

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'button'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', cancel)

    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'button button--danger'
    confirmBtn.textContent = 'Confirm'
    confirmBtn.addEventListener('click', confirm)

    const btnRow = document.createElement('div')
    btnRow.className = 'modal-btn-row'
    btnRow.style.marginTop = 'var(--space-2)'
    btnRow.style.alignSelf = 'flex-end'
    btnRow.appendChild(cancelBtn)
    btnRow.appendChild(confirmBtn)

    el.appendChild(label)
    el.appendChild(inputEl)
    el.appendChild(btnRow)
    return true
  }

  const onKeyDown = (evt: KeyboardEvent): boolean => {
    if (active && evt.key === 'Escape') {
      evt.preventDefault()
      cancel()
      return true
    }
    return false
  }

  return { enter, renderFooterOverride, onKeyDown }
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
        const failBtn = document.createElement('button')
        failBtn.className = 'button button--danger'
        failBtn.textContent = 'Fail…'
        failBtn.addEventListener('click', () => enterInputMode('fail'))
        const mockBtn = document.createElement('button')
        mockBtn.className = 'button button--primary'
        mockBtn.textContent = 'Mock response…'
        mockBtn.addEventListener('click', () => enterInputMode('resume'))
        el.appendChild(ignoreBtn)
        el.appendChild(failBtn)
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

    const failEffect = makeFailHelper(ctx, resolve)

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
        if (failEffect.renderFooterOverride(el))
          return
        const failBtn = document.createElement('button')
        failBtn.className = 'button button--danger'
        failBtn.textContent = 'Fail…'
        failBtn.addEventListener('click', failEffect.enter)
        const btn = document.createElement('button')
        btn.className = 'button button--primary'
        btn.textContent = 'Submit'
        btn.addEventListener('click', submit)
        el.appendChild(failBtn)
        el.appendChild(btn)
      },
      onKeyDown(evt) {
        if (failEffect.onKeyDown(evt))
          return true
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

// Non-blocking print handler — appends to output panel and resumes immediately
function outputPrintHandler(ctx: EffectContext): void {
  const value = ctx.arg
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  appendOutput(text, 'output')
  ctx.resume(value)
}

function ioErrorHandler(ctx: EffectContext): Promise<void> {
  return new Promise<void>(resolve => {
    const value = ctx.arg
    const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)

    const submit = () => {
      ctx.resume(value)
      resolve()
      resolveCurrentEffect()
      focusDvalaCode()
    }

    const failEffect = makeFailHelper(ctx, resolve)

    registerPendingEffect({
      ctx,
      title: 'Error output',
      renderBody(el) {
        const outputWrap = document.createElement('div')
        outputWrap.className = 'println-output'
        const pre = document.createElement('pre')
        pre.className = 'println-content error-content'
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
        if (failEffect.renderFooterOverride(el))
          return
        const failBtn = document.createElement('button')
        failBtn.className = 'button button--danger'
        failBtn.textContent = 'Fail…'
        failBtn.addEventListener('click', failEffect.enter)
        const btn = document.createElement('button')
        btn.className = 'button button--primary'
        btn.textContent = 'OK'
        btn.addEventListener('click', submit)
        el.appendChild(failBtn)
        el.appendChild(btn)
      },
      onKeyDown(evt) {
        if (failEffect.onKeyDown(evt))
          return true
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
    const argRaw = ctx.arg
    const items: string[] = Array.isArray(argRaw) ? argRaw as string[] : (argRaw as { items: string[] }).items
    const options = Array.isArray(argRaw) ? undefined : (argRaw as { options?: { prompt?: string; default?: number } }).options
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

    const failEffect = makeFailHelper(ctx, resolve)

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
      renderFooter(el) {
        if (failEffect.renderFooterOverride(el))
          return
        const failBtn = document.createElement('button')
        failBtn.className = 'button button--danger'
        failBtn.textContent = 'Fail…'
        failBtn.addEventListener('click', failEffect.enter)
        el.appendChild(failBtn)
      },
      onKeyDown(evt) {
        if (failEffect.onKeyDown(evt))
          return true
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

    const failEffect = makeFailHelper(ctx, resolve)

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
      renderFooter(el) {
        if (failEffect.renderFooterOverride(el))
          return
        const failBtn = document.createElement('button')
        failBtn.className = 'button button--danger'
        failBtn.textContent = 'Fail…'
        failBtn.addEventListener('click', failEffect.enter)
        el.appendChild(failBtn)
      },
      onKeyDown(evt) {
        if (failEffect.onKeyDown(evt))
          return true
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

function syncIoErrorHandler(ctx: EffectContext): void {
  const value = ctx.arg
  const text = typeof value === 'string' ? value : stringifyValue(value as Any, false)
  window.alert(`Error: ${text}`)
  ctx.resume(value)
}

function syncDefaultEffectHandler(ctx: EffectContext): void {
  if (ctx.effectName === 'dvala.checkpoint') {
    ctx.next()
    return
  }
  // Pass through to standard handlers for non-interactive standard effects
  if (ctx.effectName === 'dvala.io.readStdin' || ctx.effectName.startsWith('dvala.random') || ctx.effectName.startsWith('dvala.time') || ctx.effectName === 'dvala.sleep') {
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
    { pattern: 'dvala.io.error', handler: syncIoErrorHandler },
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

    const runtimeContext = getRuntimeContextObject(parsedContext)
    const parsedHandlers = (runtimeContext.effectHandlers ?? []) as { pattern: string; handler: unknown }[]
    const bindings = getContextBindings(runtimeContext)

    const effectHandlers: HandlerRegistration[] = parsedHandlers.map(({ pattern, handler: value }) => {
      if (typeof value !== 'string') {
        throw new TypeError(`Invalid handler value. "${pattern}" should be a javascript function string`)
      }

      return { pattern, handler: compileContextEffectHandlerSource(value) }
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
      effectHandlers.push({ pattern: 'dvala.io.print', handler: outputPrintHandler })
    if (!hasPattern('dvala.io.error'))
      effectHandlers.push({ pattern: 'dvala.io.error', handler: ioErrorHandler })

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

  updateContextState(getState('context'), false)
  elements.contextTextArea.selectionStart = contextTextAreaSelectionStart
  elements.contextTextArea.selectionEnd = contextTextAreaSelectionEnd

  setDvalaCode(getState('dvala-code'), false, scrollToTop ? 'top' : undefined)
  elements.dvalaTextArea.selectionStart = dvalaTextAreaSelectionStart
  elements.dvalaTextArea.selectionEnd = dvalaTextAreaSelectionEnd

  if (activeDvalaCodeHistoryFileId !== getState('current-file-id'))
    activateCurrentFileHistory(false)

  showSideTab(getState('active-side-tab'), { persist: false, syncUrl: false })
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
  elements.dvalaPanelDebugInfo?.classList.toggle('active', debug)

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

  const currentFileId = getState('current-file-id')
  const currentFile = currentFileId ? getSavedFiles().find(entry => entry.id === currentFileId) : null
  const isLocked = currentFile?.locked ?? false
  const isContextTab = getCurrentSideTab() === 'context'
  const context = isContextTab ? getParsedContext() : null
  const contextBindings = context ? getContextBindings(context) : null
  const contextEffectHandler = activeContextBindingName && context ? getContextEffectHandler(context, activeContextBindingName) : null
  const contextTitle = activeContextBindingName && context && (
    (activeContextEntryKind === 'binding' && ((contextBindings && Object.prototype.hasOwnProperty.call(contextBindings, activeContextBindingName))
      || getContextBindingInvalidDraft(context, activeContextBindingName) !== null))
    || (activeContextEntryKind === 'effect-handler' && (contextEffectHandler !== null || getContextEffectHandlerInvalidDraft(context, activeContextBindingName) !== null))
  )
    ? activeContextBindingName
    : ''
  const currentFileTitle = currentFile
    ? currentFile.name
    : SCRATCH_TITLE
  const showCodePendingIndicator = !isContextTab && !isLocked && (autoSaveTimer !== null || (currentFileId === null && scratchEditedTimer !== null))
  const showSaveScratchButton = currentFileId === null && hasScratchContent() && getCurrentSideTab() !== 'snapshots'
  // Title string: only shown for context tab (shows binding/handler name)
  elements.dvalaCodeTitleString.textContent = isContextTab ? contextTitle : ''
  elements.dvalaCodeTitleString.style.display = isContextTab ? '' : 'none'
  elements.editorToolbarTitle.textContent = currentFileTitle
  // Context entry names (bindings, effect handlers) also use monospace
  const fileTitleFontFamily = (!isContextTab || contextTitle) ? 'var(--font-mono)' : ''
  elements.dvalaCodeTitleString.style.fontFamily = fileTitleFontFamily
  elements.dvalaCodeTitleInput.style.fontFamily = fileTitleFontFamily
  elements.editorToolbarTitle.style.fontFamily = !isContextTab ? 'var(--font-mono)' : ''
  elements.dvalaTextArea.readOnly = isLocked
  elements.dvalaTextArea.classList.toggle('panel-textarea--locked', isLocked)
  elements.dvalaCodeLockedIndicator.style.display = isLocked ? 'inline-flex' : 'none'
  elements.saveScratchButton.style.display = showSaveScratchButton ? 'inline-flex' : 'none'
  syncDvalaCodeHistoryButtons()
  // Pending indicator: only shown for context tab (file edits tracked via toolbar pill)
  elements.dvalaCodePendingIndicator.style.display = (isContextTab && showCodePendingIndicator) ? 'inline-block' : 'none'
  if (elements.contextTitle) elements.contextTitle.style.color = (getState('focused-panel') === 'context') ? 'white' : ''

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
    if (link) {
      link.classList.add('active-sidebar-entry')
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
  openScratchInEditor({ code, context: '', focusCode: true, navigateToPlayground: true, toast: 'Code loaded in editor' })
}

export function setPlayground(name: string, encodedExample: string) {
  const example = JSON.parse(decodeURIComponent(atob(encodedExample))) as Example
  const context = example.context
    ? formatContextJson(example.context as Record<string, unknown>)
    : ''
  const code = example.code ? example.code : ''
  const size = Math.max(name.length + 10, 40)
  const paddingLeft = Math.floor((size - name.length) / 2)
  const paddingRight = Math.ceil((size - name.length) / 2)

  openScratchInEditor({
    code: `
/*${'*'.repeat(size)}**
 *${' '.repeat(paddingLeft)}${name}${' '.repeat(paddingRight)} *
 *${'*'.repeat(size)}**/

${code}
`.trimStart(),
    context,
    focusCode: true,
    navigateToPlayground: true,
    toast: `Example loaded: ${name}`,
  })
}

export function loadCode(code: string) {
  openScratchInEditor({ code, context: '', focusCode: true, navigateToPlayground: true, toast: 'Code loaded' })
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
