import type { ProgramArtifactEnvelope, SnapshotArtifactEnvelope } from '../artifacts/types'

import type { CapabilityPolicy } from './capability'

export type RuntimeIdentity = {
  version: string
  fingerprint: string
  schemaVersion: string
}

export type VerifiedProgram = {
  artifact: ProgramArtifactEnvelope
  verifiedAt: number
  hostFingerprint: string
}

export type VerifiedSnapshot = {
  artifact: SnapshotArtifactEnvelope
  verifiedAt: number
  hostFingerprint: string
}

export type RuntimeVerificationResult = { ok: true } | { ok: false; reason: string }

export type RuntimeSessionState = {
  status: 'idle' | 'running' | 'suspended' | 'completed' | 'failed'
  snapshotCount?: number
}

export interface RuntimeHost {
  readonly identity: RuntimeIdentity
  readonly policy: CapabilityPolicy
  resolveEffect(name: string): unknown
  verifySignature(artifact: ProgramArtifactEnvelope | SnapshotArtifactEnvelope): Promise<boolean>
  loadBuiltinModule(name: string): Promise<Uint8Array | string>
}

export interface RuntimeSession {
  id: string
  run(): Promise<unknown>
  suspend(): Promise<SnapshotArtifactEnvelope>
  inspect(): RuntimeSessionState
  close(): Promise<void>
}

export interface RuntimeExecutor {
  startProgram(artifact: VerifiedProgram, host: RuntimeHost): Promise<RuntimeSession>
  resumeSnapshot(artifact: VerifiedSnapshot, host: RuntimeHost): Promise<RuntimeSession>
}

export interface DvalaRuntime {
  getIdentity(): RuntimeIdentity
  bindHost(host: RuntimeHost): BoundRuntime
}

export interface BoundRuntime {
  getIdentity(): RuntimeIdentity
  verifyProgram(artifact: ProgramArtifactEnvelope): Promise<VerifiedProgram>
  startProgram(artifact: VerifiedProgram): Promise<RuntimeSession>
  verifySnapshot(artifact: SnapshotArtifactEnvelope): Promise<VerifiedSnapshot>
  resumeSnapshot(artifact: VerifiedSnapshot): Promise<RuntimeSession>
}
