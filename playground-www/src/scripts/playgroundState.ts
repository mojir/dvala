// Shared mutable state for the playground scripts.
// API choice: a single mutable singleton object — produces the smallest diff in
// callers (each `foo` reference becomes `state.foo`, no helper functions needed).

import type { EffectContext, Snapshot } from '../../../src/evaluator/effectTypes'

export interface PendingEffect {
  ctx: EffectContext
  title: string
  renderBody: (el: HTMLElement) => void
  renderFooter: (el: HTMLElement) => void
  onKeyDown?: (evt: KeyboardEvent) => boolean
  resolve: () => void
}

interface ModalStackEntry {
  panel: HTMLElement
  label: string
  icon?: string
  snapshot: Snapshot | null
  isEffect?: boolean
}

interface SnapshotBreadcrumb {
  label: string
  snapshot: Snapshot
}

export const state: {
  pendingEffects: PendingEffect[]
  currentEffectIndex: number
  effectBatchScheduled: boolean
  currentSnapshot: Snapshot | null
  currentCheckpointSnapshot: Snapshot | null
  modalStack: ModalStackEntry[]
  snapshotViewStack: SnapshotBreadcrumb[]
  resolveInfoModal: (() => void) | null
  infoModalOnConfirm: (() => void | Promise<void>) | null
  resolveSnapshotModal: (() => void) | null
  snapshotExecutionControlsVisible: boolean
  activeSnapshotKey: string | null
  sideSnapshotsShowAll: boolean
  autoSaveTimer: ReturnType<typeof setTimeout> | null
  scratchEditedTimer: ReturnType<typeof setTimeout> | null
} = {
  pendingEffects: [],
  currentEffectIndex: 0,
  effectBatchScheduled: false,
  currentSnapshot: null,
  currentCheckpointSnapshot: null,
  modalStack: [],
  snapshotViewStack: [],
  resolveInfoModal: null,
  infoModalOnConfirm: null,
  resolveSnapshotModal: null,
  snapshotExecutionControlsVisible: false,
  activeSnapshotKey: null,
  sideSnapshotsShowAll: false,
  autoSaveTimer: null,
  scratchEditedTimer: null,
}
