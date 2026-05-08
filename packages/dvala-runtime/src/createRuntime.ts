import type { ProgramArtifactEnvelope, SnapshotArtifactEnvelope } from './artifacts/types'
import type { BoundRuntime, DvalaRuntime, RuntimeExecutor, RuntimeHost, RuntimeIdentity } from './types/runtime'
import type { VerifiedProgram, VerifiedSnapshot } from './types/runtime'

function verificationFailure(reason: string): never {
  throw new Error(`dvala-runtime: ${reason}`)
}

async function verifyProgramArtifact(
  artifact: ProgramArtifactEnvelope,
  host: RuntimeHost,
  identity: RuntimeIdentity,
): Promise<VerifiedProgram> {
  const signatureOk = await host.verifySignature(artifact)
  if (!signatureOk) verificationFailure('program artifact signature verification failed')
  if (artifact.manifest.schemaVersion !== identity.schemaVersion) {
    verificationFailure('program artifact schema version does not match bound runtime')
  }
  if (artifact.manifest.runtimeFingerprint !== identity.fingerprint) {
    verificationFailure('program artifact runtime fingerprint does not match bound runtime')
  }
  return {
    artifact,
    verifiedAt: Date.now(),
    hostFingerprint: host.identity.fingerprint,
  }
}

async function verifySnapshotArtifact(
  artifact: SnapshotArtifactEnvelope,
  host: RuntimeHost,
  identity: RuntimeIdentity,
): Promise<VerifiedSnapshot> {
  const signatureOk = await host.verifySignature(artifact)
  if (!signatureOk) verificationFailure('snapshot artifact signature verification failed')
  if (artifact.manifest.schemaVersion !== identity.schemaVersion) {
    verificationFailure('snapshot artifact schema version does not match bound runtime')
  }
  if (artifact.manifest.runtimeFingerprint !== identity.fingerprint) {
    verificationFailure('snapshot artifact runtime fingerprint does not match bound runtime')
  }
  return {
    artifact,
    verifiedAt: Date.now(),
    hostFingerprint: host.identity.fingerprint,
  }
}

export function createRuntime(identity: RuntimeIdentity, executor: RuntimeExecutor): DvalaRuntime {
  return {
    getIdentity(): RuntimeIdentity {
      return identity
    },
    bindHost(host: RuntimeHost): BoundRuntime {
      return {
        getIdentity(): RuntimeIdentity {
          return identity
        },
        async verifyProgram(artifact: ProgramArtifactEnvelope): Promise<VerifiedProgram> {
          return verifyProgramArtifact(artifact, host, identity)
        },
        async startProgram(artifact: VerifiedProgram) {
          return executor.startProgram(artifact, host)
        },
        async verifySnapshot(artifact: SnapshotArtifactEnvelope): Promise<VerifiedSnapshot> {
          return verifySnapshotArtifact(artifact, host, identity)
        },
        async resumeSnapshot(artifact: VerifiedSnapshot) {
          return executor.resumeSnapshot(artifact, host)
        },
      }
    },
  }
}
