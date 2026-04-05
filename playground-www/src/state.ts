import type { UnknownRecord } from '../../src/interface'

export const defaultState = {
  'sidebar-width': 350 as number,
  'playground-height': 350 as number,
  'resize-divider-1-percent': 20 as number,
  'resize-divider-2-percent': 70 as number,
  'active-side-tab': 'programs' as 'programs' | 'snapshots' | 'context',
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
  'intercept-effects': false as boolean,
  'intercept-checkpoint': false as boolean,
  'intercept-error': false as boolean,
  'intercept-unhandled': true as boolean,
  'disable-standard-handlers': false as boolean,
  'disable-playground-effects': false as boolean,
  'disable-auto-checkpoint': false as boolean,
  'playground-developer': false as boolean,
  'focused-panel': null as 'dvala-code' | 'context' | null,
  'current-program-id': null as string | null,
  'dvala-code-edited': false as boolean,
} as const

type State = {
  -readonly [K in keyof typeof defaultState]: typeof defaultState[K]
}

type Key = keyof typeof defaultState
type StorageKey = `playground-${Key}`

const state: State = {
  ...defaultState,
}

;(Object.keys(defaultState) as Key[]).forEach((key: Key) => {
  const value = localStorage.getItem(getStorageKey(key))

  ;(state as UnknownRecord)[key] = typeof value === 'string' ? JSON.parse(value) : defaultState[key]
})

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
  void pushToHistory
}

function setState<T extends keyof State>(key: T, value: State[T]) {
  state[key] = value
}

export function clearAllStates() {
  localStorage.clear()
  Object.assign(state, defaultState)
}

export function clearState(...keys: Key[]) {
  keys.forEach(key => {
    localStorage.removeItem(getStorageKey(key))
    ;(state as UnknownRecord)[key] = defaultState[key]
  })
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
    'disable-standard-handlers': state['disable-standard-handlers'],
    'disable-playground-effects': state['disable-playground-effects'],
    'disable-auto-checkpoint': state['disable-auto-checkpoint'],
  }
  return btoa(encodeURIComponent(JSON.stringify(sharedState)))
}

export function applyEncodedState(encodedState: string): boolean {
  try {
    saveState(JSON.parse(decodeURIComponent(atob(encodedState))) as Partial<State>, false)
    return true
  } catch (_error) {
    return false
  }
}

function getStorageKey(key: Key): StorageKey {
  return `playground-${key}`
}
