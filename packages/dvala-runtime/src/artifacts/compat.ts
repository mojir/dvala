import type { ProgramArtifactEnvelope, SnapshotArtifactEnvelope } from './types'

export type ArtifactCompatibilityBridge<ProgramValue = unknown, SnapshotValue = unknown, ResumeContext = unknown> = {
  decodeProgramArtifact: (artifact: ProgramArtifactEnvelope) => ProgramValue
  decodeSnapshotArtifact: (artifact: SnapshotArtifactEnvelope) => SnapshotValue
  encodeSnapshotArtifact: (snapshot: SnapshotValue) => SnapshotArtifactEnvelope | Promise<SnapshotArtifactEnvelope>
  getResumeValue?: (artifact: SnapshotArtifactEnvelope, context: ResumeContext) => unknown
}
