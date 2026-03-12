import type { UnknownRecord } from '../../src/interface'
import type { HistoryEntry, HistoryStatus } from './StateHistory'
import { StateHistory } from './StateHistory'

export const defaultState = {
  'sidebar-width': 350 as number,
  'playground-height': 350 as number,
  'resize-divider-1-percent': 20 as number,
  'resize-divider-2-percent': 60 as number,
  'context': '' as string,
  'context-scroll-top': 0 as number,
  'context-selection-start': 0 as number,
  'context-selection-end': 0 as number,
  'dvala-code': '' as string,
  'dvala-code-scroll-top': 0 as number,
  'dvala-code-selection-start': 0 as number,
  'dvala-code-selection-end': 0 as number,
  'output': '' as string,
  'output-scroll-top': 0 as number,
  'new-context-name': '' as string,
  'new-context-value': '' as string,
  'debug': false as boolean,
  'pure': false as boolean,
  'intercept-checkpoint': false as boolean,
  'intercept-error': false as boolean,
  'disable-playground-handlers': false as boolean,
  'disable-auto-checkpoint': false as boolean,
  'focused-panel': null as 'dvala-code' | 'context' | null,
  'current-program-id': null as string | null,
} as const

type State = {
  -readonly [K in keyof typeof defaultState]: typeof defaultState[K]
}

type Key = keyof typeof defaultState
type StorageKey = `playground-${Key}`

let contextHistoryListener: undefined | ((status: HistoryStatus) => void)
let dvalaCodeHistoryListener: undefined | ((status: HistoryStatus) => void)

const state: State = {
  ...defaultState,
}

;(Object.keys(defaultState) as Key[]).forEach((key: Key) => {
  const value = localStorage.getItem(getStorageKey(key))

  ;(state as UnknownRecord)[key] = typeof value === 'string' ? JSON.parse(value) : defaultState[key]
})

const contextHistory = new StateHistory(createContextHistoryEntry(), status => {
  contextHistoryListener?.(status)
})

const dvalaCodeHistory = new StateHistory(createDvalaCodeHistoryEntry(), status => {
  dvalaCodeHistoryListener?.(status)
})

function createContextHistoryEntry(): HistoryEntry {
  return {
    text: state.context,
    selectionStart: state['context-selection-start'],
    selectionEnd: state['context-selection-end'],
  }
}

function createDvalaCodeHistoryEntry(): HistoryEntry {
  return {
    text: state['dvala-code'],
    selectionStart: state['dvala-code-selection-start'],
    selectionEnd: state['dvala-code-selection-end'],
  }
}

function pushHistory() {
  contextHistory.push(createContextHistoryEntry())
  dvalaCodeHistory.push(createDvalaCodeHistoryEntry())
}

export function setContextHistoryListener(listener: (status: HistoryStatus) => void) {
  contextHistoryListener = listener
}

export function setDvalaCodeHistoryListener(listener: (status: HistoryStatus) => void) {
  dvalaCodeHistoryListener = listener
}

export function updateState(newState: Partial<State>) {
  Object.entries(newState).forEach(entry => {
    const key = entry[0] as keyof State
    setState(key, entry[1])
  })
}

export function saveState(newState: Partial<State>, pushToHistory = true) {
  Object.entries(newState).forEach(entry => {
    const key = entry[0] as keyof State
    const value = entry[1]
    setState(key, value)
    localStorage.setItem(getStorageKey(key), JSON.stringify(value))
  })
  if (pushToHistory) {
    pushHistory()
  }
}

function setState<T extends keyof State>(key: T, value: State[T]) {
  state[key] = value
}

export function clearAllStates() {
  localStorage.clear()
  Object.assign(state, defaultState)
  dvalaCodeHistory.reset(createDvalaCodeHistoryEntry())
  contextHistory.reset(createContextHistoryEntry())
}

export function clearState(...keys: Key[]) {
  keys.forEach(key => {
    localStorage.removeItem(getStorageKey(key))
    ;(state as UnknownRecord)[key] = defaultState[key]
  })
  pushHistory()
}

export function getState<T extends keyof State>(key: T): State[T] {
  return state[key]
}

export function encodeState() {
  const sharedState: Partial<State> = {
    'dvala-code': state['dvala-code'],
    'context': state.context,
    'debug': state.debug,
    'pure': state.pure,
    'intercept-checkpoint': state['intercept-checkpoint'],
    'intercept-error': state['intercept-error'],
    'disable-playground-handlers': state['disable-playground-handlers'],
    'disable-auto-checkpoint': state['disable-auto-checkpoint'],
  }
  return btoa(encodeURIComponent(JSON.stringify(sharedState)))
}

export function applyEncodedState(encodedState: string): boolean {
  try {
    saveState(JSON.parse(decodeURIComponent(atob(encodedState))) as Partial<State>, true)
    return true
  } catch (_error) {
    return false
  }
}

export function undoContext() {
  try {
    const historyEntry = contextHistory.undo()
    saveState({
      'context': historyEntry.text,
      'context-selection-start': historyEntry.selectionStart,
      'context-selection-end': historyEntry.selectionEnd,
    }, false)
    return true
  } catch {
    return false
  }
}

export function redoContext() {
  try {
    const historyEntry = contextHistory.redo()
    saveState({
      'context': historyEntry.text,
      'context-selection-start': historyEntry.selectionStart,
      'context-selection-end': historyEntry.selectionEnd,
    }, false)
    return true
  } catch {
    return false
  }
}

export function undoDvalaCode() {
  try {
    const historyEntry = dvalaCodeHistory.undo()
    saveState({
      'dvala-code': historyEntry.text,
      'dvala-code-selection-start': historyEntry.selectionStart,
      'dvala-code-selection-end': historyEntry.selectionEnd,
    }, false)
    return true
  } catch {
    return false
  }
}

export function redoDvalaCode() {
  try {
    const historyEntry = dvalaCodeHistory.redo()
    saveState({
      'dvala-code': historyEntry.text,
      'dvala-code-selection-start': historyEntry.selectionStart,
      'dvala-code-selection-end': historyEntry.selectionEnd,
    }, false)
    return true
  } catch {
    return false
  }
}

function getStorageKey(key: Key): StorageKey {
  return `playground-${key}`
}
