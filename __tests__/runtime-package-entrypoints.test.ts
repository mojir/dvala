import { describe, expect, it } from 'vitest'

import { createPackageRuntimeBridge } from '@mojir/dvala-runtime'
import * as runtimePackage from '@mojir/dvala-runtime'
import * as runtimeArtifactsPackage from '@mojir/dvala-runtime/artifacts'
import type { CreatePackageRuntimeBridgeOptions, RuntimeHost, RuntimeIdentity } from '@mojir/dvala-runtime'
import type { ProgramArtifactEnvelope, SnapshotArtifactEnvelope } from '@mojir/dvala-runtime/artifacts'

const identity: RuntimeIdentity = {
  version: 'test-version',
  fingerprint: 'runtime-fingerprint',
  schemaVersion: 'schema-v1',
}

function createProgramArtifact(): ProgramArtifactEnvelope {
  return {
    manifest: {
      kind: 'program',
      schemaVersion: identity.schemaVersion,
      runtimeFingerprint: identity.fingerprint,
      moduleHash: 'module-hash',
      capabilityPolicy: { allowedEffects: ['test.ask'], mode: 'development' },
      coreSections: ['semantic-ir'],
    },
    semanticIr: {
      payloadFormat: 'cbor',
      canonicalBytes: new Uint8Array([1, 2, 3]),
    },
    signature: {
      format: 'cose-sign1',
      bytes: new Uint8Array([9, 9]),
    },
  }
}

function createHost(): RuntimeHost {
  return {
    identity: {
      version: 'host-version',
      fingerprint: 'host-fingerprint',
      schemaVersion: 'schema-v1',
    },
    policy: { allowedEffects: ['test.ask'], mode: 'development' },
    resolveEffect(): unknown {
      return undefined
    },
    async verifySignature(): Promise<boolean> {
      return true
    },
    async loadBuiltinModule(): Promise<string> {
      return 'module'
    },
  }
}

describe('@mojir/dvala-runtime package entrypoints', () => {
  it('exposes createPackageRuntimeBridge from the package entrypoint', async () => {
    const options: CreatePackageRuntimeBridgeOptions<string> = {
      identity,
      artifactBridge: {
        decodeProgramArtifact: () => '1 + 2',
        decodeSnapshotArtifact: () => ({
          id: 'snapshot-1',
          continuation: { __test: true },
          timestamp: Date.now(),
          index: 0,
          executionId: 'exec-1',
          message: 'resume me',
        }),
        encodeSnapshotArtifact: async (snapshot): Promise<SnapshotArtifactEnvelope> => ({
          manifest: {
            kind: 'snapshot',
            schemaVersion: identity.schemaVersion,
            runtimeFingerprint: identity.fingerprint,
            moduleHash: 'module-hash',
            capabilityPolicy: { allowedEffects: ['test.ask'], mode: 'development' },
            coreSections: ['program-reference', 'machine-state'],
          },
          program: {
            programArtifactId: 'program-1',
            moduleHash: 'module-hash',
            runtimeFingerprint: identity.fingerprint,
          },
          machineState: {
            payloadFormat: 'cbor',
            canonicalBytes: snapshot.id === 'snapshot-1' ? new Uint8Array([4, 5, 6]) : new Uint8Array([7, 8, 9]),
          },
          signature: {
            format: 'cose-sign1',
            bytes: new Uint8Array([8, 8]),
          },
        }),
      },
      runProgram: async source => ({ type: 'completed', value: source.length, scope: {} }),
      resumeProgram: async () => ({ type: 'completed', value: 'resumed', scope: {} }),
    }

    const runtime = createPackageRuntimeBridge(options)
    const bound = runtime.bindHost(createHost())
    const session = await bound.startProgram(await bound.verifyProgram(createProgramArtifact()))

    await expect(session.run()).resolves.toMatchObject({ type: 'completed', value: 5 })
    expect(runtimePackage.createPackageRuntimeBridge).toBe(createPackageRuntimeBridge)
  })

  it('resolves the artifacts subpath as a separate package entrypoint', () => {
    const artifact: ProgramArtifactEnvelope = createProgramArtifact()

    expect(Object.keys(runtimeArtifactsPackage)).toEqual([])
    expect(runtimeArtifactsPackage[Symbol.toStringTag]).toBe('Module')
    expect(artifact.manifest.kind).toBe('program')
    expect(artifact.semanticIr.payloadFormat).toBe('cbor')
  })
})
