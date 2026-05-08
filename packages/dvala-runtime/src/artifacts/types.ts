import type { CapabilityPolicy } from '../types/capability'

import type { CoseSignatureEnvelope } from './signature'

export type ProgramCoreSectionKind = 'semantic-ir' | 'builtin-modules'

export type SnapshotCoreSectionKind = 'embedded-program' | 'program-reference' | 'machine-state'

export type CoreSectionKind = ProgramCoreSectionKind | SnapshotCoreSectionKind

export type ArtifactSectionId = string

export type CompressionFormat = 'gzip' | 'brotli' | 'zstd'

export type CorePayloadFormat = 'cbor'

export type ExtensionPayloadFormat = CorePayloadFormat | 'cose-encrypted' | 'cbor-packed'

export type ArtifactManifest = {
  kind: 'program' | 'snapshot'
  schemaVersion: string
  runtimeFingerprint: string
  moduleHash: string
  capabilityPolicy: CapabilityPolicy
  coreSections: readonly CoreSectionKind[]
  extensionSectionIds?: readonly ArtifactSectionId[]
  compression?: {
    format: CompressionFormat
  }
}

export type ProgramArtifactManifest = Omit<ArtifactManifest, 'kind' | 'coreSections'> & {
  kind: 'program'
  coreSections: readonly ProgramCoreSectionKind[]
}

export type SnapshotArtifactManifest = Omit<ArtifactManifest, 'kind' | 'coreSections'> & {
  kind: 'snapshot'
  coreSections: readonly SnapshotCoreSectionKind[]
}

export type CanonicalSection<TInspection> = {
  payloadFormat: CorePayloadFormat
  canonicalBytes: Uint8Array
  inspectionView?: TInspection
}

export type SemanticIrNodeKind = 'module' | 'function' | 'handler' | 'expression'

export type MachineStateFrameKind = 'sequence' | 'call' | 'handler' | 'parallel' | 'match' | 'resume'

export type SemanticIrInspectionView = {
  summary?: string
  nodeKinds?: readonly SemanticIrNodeKind[]
  entrypointName?: string
}

export type MachineStateInspectionView = {
  summary?: string
  frameKinds?: readonly MachineStateFrameKind[]
  suspendedEffect?: string
}

export type ExtensionInspectionView = {
  summary?: string
  declaredPurpose?: string
  decodedFormAvailable?: boolean
}

export type SemanticIrSection = CanonicalSection<SemanticIrInspectionView>

export type BuiltinModuleSection = CanonicalSection<{
  moduleNames: readonly string[]
}>

export type MachineStateSection = CanonicalSection<MachineStateInspectionView>

export type ArtifactExtensionSection = {
  id: ArtifactSectionId
  payloadFormat: ExtensionPayloadFormat
  canonicalBytes: Uint8Array
  inspectionView?: ExtensionInspectionView
}

export type ProgramReferenceSection = {
  programArtifactId: string
  moduleHash: string
  runtimeFingerprint: string
}

export type ProgramArtifactEnvelope = {
  manifest: ProgramArtifactManifest
  semanticIr: SemanticIrSection
  builtinModules?: BuiltinModuleSection
  extensions?: readonly ArtifactExtensionSection[]
  signature: CoseSignatureEnvelope
}

export type EmbeddedProgramSection = {
  artifact: ProgramArtifactEnvelope
}

export type SnapshotArtifactEnvelope = {
  manifest: SnapshotArtifactManifest
  program: EmbeddedProgramSection | ProgramReferenceSection
  machineState: MachineStateSection
  extensions?: readonly ArtifactExtensionSection[]
  signature: CoseSignatureEnvelope
}
