import { describe, expect, it } from 'vitest'

import type { WorkspaceFile } from './fileStorage'
import {
  inspectPlaygroundSnapshotBindingsThroughBackend,
  inspectPlaygroundSnapshotThroughBackend,
  resumePlaygroundSnapshotThroughBackend,
  runPlaygroundSessionThroughBackend,
} from './runtimeBackend'

function workspaceFile(overrides: Partial<WorkspaceFile> & Pick<WorkspaceFile, 'path' | 'code'>): WorkspaceFile {
  return {
    id: overrides.id ?? overrides.path,
    path: overrides.path,
    code: overrides.code,
    context: overrides.context ?? '',
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  }
}

describe('runtimeBackend', () => {
  it('runs code through the backend using the workspace snapshot and runtime options', async () => {
    const result = await runPlaygroundSessionThroughBackend({
      path: 'main.dvala',
      source: 'let { value } = import("./lib"); value + 1',
      workspaceFiles: [workspaceFile({ path: 'lib.dvala', code: 'let value = 41; { value }' })],
      terminalSnapshot: true,
    })

    expect(result).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
        snapshot: expect.any(Object),
      }),
    )
  })

  it('resumes snapshots through the backend by retriggering provided handlers', async () => {
    const started = await runPlaygroundSessionThroughBackend({
      path: 'main.dvala',
      source: 'let x = perform(@my.ask); x + 1',
      workspaceFiles: [],
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started.type).toBe('suspended')
    if (started.type !== 'suspended') return

    const resumed = await resumePlaygroundSnapshotThroughBackend({
      snapshot: started.snapshot,
      workspaceFiles: [],
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ resume }) => {
            resume(41)
          },
        },
      ],
      terminalSnapshot: true,
    })

    expect(resumed).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
        snapshot: expect.any(Object),
      }),
    )
  })

  it('inspects checkpoint snapshots through the backend', async () => {
    const started = await runPlaygroundSessionThroughBackend({
      path: 'main.dvala',
      source: 'perform(@dvala.checkpoint, "before"); let x = perform(@my.ask); x + 1',
      workspaceFiles: [],
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started.type).toBe('suspended')
    if (started.type !== 'suspended') return

    const checkpoints = await inspectPlaygroundSnapshotThroughBackend({ snapshot: started.snapshot })

    expect(checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'before',
        }),
      ]),
    )
  })

  it('inspects snapshot bindings through the backend', async () => {
    const started = await runPlaygroundSessionThroughBackend({
      path: 'main.dvala',
      source: 'let answer = 42; let local = "ok"; let x = perform(@my.ask); x + answer',
      workspaceFiles: [],
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started.type).toBe('suspended')
    if (started.type !== 'suspended') return

    const bindings = await inspectPlaygroundSnapshotBindingsThroughBackend({ snapshot: started.snapshot })

    expect(bindings).toEqual({
      answer: 42,
      local: 'ok',
    })
  })
})
