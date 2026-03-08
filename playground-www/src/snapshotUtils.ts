import type { Snapshot } from '../../src/evaluator/effectTypes'

export function encodeSnapshot(snapshot: Snapshot): string {
  return btoa(encodeURIComponent(JSON.stringify(snapshot)))
}

export function decodeSnapshot(encoded: string): Snapshot | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as Snapshot
  }
  catch {
    return null
  }
}
