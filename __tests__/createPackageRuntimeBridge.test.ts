import { describe, expect, it } from 'vitest'

import { createPackageRuntimeBridge } from '../src/runtime/createPackageRuntimeBridge'
import type { HandlerRegistration, Snapshot } from '../src/evaluator/effectTypes'
import type { DvalaBundle } from '../src/bundler/interface'
import type { ProgramArtifactEnvelope, SnapshotArtifactEnvelope } from '../packages/dvala-runtime/src/artifacts/types'
import type { RuntimeHost, RuntimeIdentity } from '../packages/dvala-runtime/src/types/runtime'

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

function createSnapshotArtifact(): SnapshotArtifactEnvelope {
  return {
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
      canonicalBytes: new Uint8Array([4, 5, 6]),
    },
    signature: {
      format: 'cose-sign1',
      bytes: new Uint8Array([8, 8]),
    },
  }
}

function createHost(effectHandlers?: HandlerRegistration[]): RuntimeHost {
  return {
    identity: {
      version: 'host-version',
      fingerprint: 'host-fingerprint',
      schemaVersion: 'schema-v1',
    },
    policy: { allowedEffects: ['test.ask'], mode: 'development' },
    resolveEffect(name: string): unknown {
      return effectHandlers?.find(handler => handler.pattern === name)
    },
    async verifySignature(): Promise<boolean> {
      return true
    },
    async loadBuiltinModule(): Promise<string> {
      return 'module'
    },
  }
}

describe('createPackageRuntimeBridge', () => {
  it('verifies and starts a program artifact through the bridge', async () => {
    const programArtifact = createProgramArtifact()
    let decodeCalls = 0

    const runtime = createPackageRuntimeBridge({
      identity,
      artifactBridge: {
        decodeProgramArtifact: (artifact): string | DvalaBundle => {
          decodeCalls += 1
          expect(artifact).toBe(programArtifact)
          return '1 + 2'
        },
        decodeSnapshotArtifact: (): Snapshot => {
          throw new Error('decodeSnapshotArtifact should not be called in startProgram test')
        },
        encodeSnapshotArtifact: async (): Promise<SnapshotArtifactEnvelope> => {
          throw new Error('encodeSnapshotArtifact should not be called in startProgram test')
        },
      },
    })

    const bound = runtime.bindHost(createHost())
    const verified = await bound.verifyProgram(programArtifact)
    const session = await bound.startProgram(verified)
    const result = await session.run()

    expect(decodeCalls).toBe(1)
    expect(result).toMatchObject({ type: 'completed', value: 3, scope: {} })
    expect(session.inspect()).toMatchObject({ status: 'completed' })
  })

  it('resumes a snapshot artifact through the bridge using the supplied resume value', async () => {
    const snapshotArtifact = createSnapshotArtifact()
    let decodeCalls = 0

    const runtime = createPackageRuntimeBridge({
      identity,
      artifactBridge: {
        decodeProgramArtifact: (): string => {
          throw new Error('decodeProgramArtifact should not be called in resumeSnapshot test')
        },
        decodeSnapshotArtifact: (artifact): Snapshot => {
          decodeCalls += 1
          expect(artifact).toBe(snapshotArtifact)
          return {
            id: 'snapshot-1',
            continuation: { __test: true },
            timestamp: Date.now(),
            index: 0,
            executionId: 'exec-1',
            message: 'resume me',
          }
        },
        encodeSnapshotArtifact: async (): Promise<SnapshotArtifactEnvelope> => {
          throw new Error('encodeSnapshotArtifact should not be called in resumeSnapshot test')
        },
        getResumeValue: () => 41,
      },
      hostToHandlers: () => [
        {
          pattern: 'test.ask',
          handler: ({ resume }) => resume(42),
        },
      ],
    })

    const bound = runtime.bindHost(createHost())
    const verified = await bound.verifySnapshot(snapshotArtifact)
    const session = await bound.resumeSnapshot(verified)

    await expect(session.run()).resolves.toMatchObject({ type: 'error' })
    expect(decodeCalls).toBe(1)
  })

  it('exports a suspended snapshot through the provided encoder', async () => {
    const programArtifact = createProgramArtifact()
    const exportedSnapshot = createSnapshotArtifact()
    let encodedSnapshotId: string | undefined

    const runtime = createPackageRuntimeBridge({
      identity,
      artifactBridge: {
        decodeProgramArtifact: (): string => 'perform(@test.ask)',
        decodeSnapshotArtifact: (): Snapshot => {
          throw new Error('decodeSnapshotArtifact should not be called in suspend export test')
        },
        encodeSnapshotArtifact: async (snapshot): Promise<SnapshotArtifactEnvelope> => {
          encodedSnapshotId = snapshot.id
          return exportedSnapshot
        },
      },
      hostToHandlers: () => [
        {
          pattern: 'test.ask',
          handler: ({ suspend }) => suspend({ exported: true }),
        },
      ],
    })

    const bound = runtime.bindHost(createHost())
    const verified = await bound.verifyProgram(programArtifact)
    const session = await bound.startProgram(verified)
    const result = (await session.run()) as { type: 'suspended'; snapshot: Snapshot }

    expect(result.type).toBe('suspended')
    const exported = await session.suspend()
    expect(encodedSnapshotId).toBe(result.snapshot.id)
    expect(exported).toBe(exportedSnapshot)
    expect(session.inspect()).toMatchObject({ status: 'suspended', snapshotCount: 1 })
  })
})
