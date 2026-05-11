import { describe, expect, it } from 'vitest'

import type { WorkspaceFile } from './fileStorage'
import { resumePlaygroundSnapshotThroughBackend, runPlaygroundSessionThroughBackend } from './runtimeBackend'

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
})
