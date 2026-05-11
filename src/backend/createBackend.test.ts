import { describe, expect, it } from 'vitest'

import { createDvala } from '../createDvala'
import { createBackend } from './createBackend'

describe('createBackend', () => {
  it('returns diagnostics from the backend-owned open document mirror', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: '1 + 2', version: 1 })

    const result = await backend.requestDiagnostics({
      requestId: 1,
      path: 'main.dvala',
      version: 1,
    })

    expect(result).toEqual({
      ok: true,
      requestId: 1,
      path: 'main.dvala',
      version: 1,
      diagnostics: [],
    })
  })

  it('requests resync when diagnostics are requested for a missing mirror', async () => {
    const backend = createBackend()

    const result = await backend.requestDiagnostics({
      requestId: 7,
      path: 'main.dvala',
      version: 1,
    })

    expect(result).toEqual({
      ok: false,
      requestId: 7,
      path: 'main.dvala',
      version: 1,
      error: {
        kind: 'resync-required',
        message: 'Backend document mirror missing or stale for main.dvala',
        path: 'main.dvala',
      },
    })
  })

  it('requests resync when diagnostics target a stale version', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: '1 + 2', version: 2 })

    const result = await backend.requestDiagnostics({
      requestId: 9,
      path: 'main.dvala',
      version: 1,
    })

    expect(result).toEqual({
      ok: false,
      requestId: 9,
      path: 'main.dvala',
      version: 1,
      error: {
        kind: 'resync-required',
        message: 'Backend document mirror missing or stale for main.dvala',
        path: 'main.dvala',
      },
    })
  })

  it('formats a source snapshot through the backend', async () => {
    const backend = createBackend()

    const result = await backend.requestFormatting({
      requestId: 11,
      path: 'main.dvala',
      source: 'let x=1',
      version: 3,
    })

    expect(result).toEqual({
      ok: true,
      requestId: 11,
      path: 'main.dvala',
      version: 3,
      formatted: expect.any(String),
    })
    if (result.ok) {
      expect(result.formatted).not.toBe('let x=1')
    }
  })

  it('computes hover information through the backend', async () => {
    const backend = createBackend()

    const result = await backend.requestHover({
      requestId: 13,
      path: 'main.dvala',
      source: 'let answer = 42',
      version: 4,
      line: 1,
      column: 5,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 13,
        path: 'main.dvala',
        version: 4,
      }),
    )
    if (result.ok) {
      expect(result.inferredType).toMatch(/Integer|42/)
    }
  })

  it('deduplicates completion labels across local scope and imported exports through the backend', async () => {
    const backend = createBackend()

    const result = await backend.requestCompletion({
      requestId: 15,
      path: 'main.dvala',
      source: 'let value = 1\nlet lib = import("./lib")\nval',
      version: 5,
      line: 3,
      column: 4,
      prefix: 'val',
      importPrefix: null,
      workspaceFiles: [{ path: 'lib.dvala', code: 'let value = 2\n{ value }' }],
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 15,
        path: 'main.dvala',
        version: 5,
      }),
    )
    if (result.ok) {
      expect(result.items.filter(item => item.label === 'value')).toHaveLength(1)
    }
  })

  it('returns workspace import path completions through the backend', async () => {
    const backend = createBackend()

    const result = await backend.requestCompletion({
      requestId: 17,
      path: 'main.dvala',
      source: 'let lib = import("./u")',
      version: 6,
      line: 1,
      column: 22,
      prefix: '',
      importPrefix: './u',
      workspaceFiles: [{ path: 'utils/math.dvala', code: 'let value = 1' }],
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 17,
        path: 'main.dvala',
        version: 6,
      }),
    )
    if (result.ok) {
      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: './utils/', detail: 'folder' }),
          expect.objectContaining({ label: './utils/math', detail: 'workspace file' }),
        ]),
      )
    }
  })

  it('resolves definition and rename navigation through the backend', async () => {
    const backend = createBackend()

    const definition = await backend.requestNavigation({
      requestId: 19,
      kind: 'definition',
      path: 'main.dvala',
      source: 'let answer = 42; answer',
      version: 7,
      line: 1,
      column: 19,
      workspaceFiles: [],
    })

    expect(definition).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 19,
        kind: 'definition',
        path: 'main.dvala',
        version: 7,
      }),
    )
    if (definition.ok) {
      expect(definition.locations).toEqual([
        expect.objectContaining({
          file: 'main.dvala',
          line: 1,
          column: 5,
        }),
      ])
    }

    const rename = await backend.requestNavigation({
      requestId: 20,
      kind: 'rename',
      path: 'main.dvala',
      source: 'let answer = 42; answer',
      version: 7,
      line: 1,
      column: 19,
      newName: 'result',
      workspaceFiles: [],
    })

    expect(rename).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 20,
        kind: 'rename',
        path: 'main.dvala',
        version: 7,
      }),
    )
    if (rename.ok) {
      expect(rename.edits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: 'main.dvala',
            text: 'result',
            range: expect.objectContaining({ startLine: 1, startColumn: 5 }),
          }),
        ]),
      )
    }
  })

  it('resolves cross-file references through the backend workspace snapshot', async () => {
    const backend = createBackend()

    const result = await backend.requestNavigation({
      requestId: 21,
      kind: 'references',
      path: 'main.dvala',
      source: 'let { fresh } = import("./lib"); fresh',
      version: 8,
      line: 1,
      column: 7,
      workspaceFiles: [{ path: 'lib.dvala', code: 'let fresh = 1\n{ fresh }' }],
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 21,
        kind: 'references',
        path: 'main.dvala',
        version: 8,
      }),
    )
    if (result.ok) {
      expect(result.locations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'lib.dvala' }),
          expect.objectContaining({ file: 'main.dvala' }),
        ]),
      )
    }
  })

  it('starts a completed session and inspects it through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 23,
      path: 'main.dvala',
      source: '41 + 1',
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 23,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok) return

    expect(started.runResult).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
      }),
    )

    const startedInspection = await backend.inspectSession(started.sessionId)
    expect(startedInspection).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: started.sessionId,
        status: 'completed',
        lastUpdatedAt: expect.any(Number),
      }),
    )
  })

  it('resumes an existing snapshot and inspects the resumed backend session', async () => {
    const backend = createBackend()
    const dvala = createDvala()

    const suspended = await dvala.runAsync('let x = perform(@my.ask); x + 1', {
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(suspended.type).toBe('suspended')
    if (suspended.type !== 'suspended') return

    const resumed = await backend.resumeSnapshot({
      requestId: 24,
      snapshot: suspended.snapshot,
      value: 41,
    })

    expect(resumed).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 24,
        sessionId: expect.any(String),
      }),
    )
    if (!resumed.ok) return

    expect(resumed.runResult).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
      }),
    )

    const resumedInspection = await backend.inspectSession(resumed.sessionId)
    expect(resumedInspection).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: resumed.sessionId,
        status: 'completed',
        lastUpdatedAt: expect.any(Number),
      }),
    )
  })

  it('uses backend-owned workspace overlays when starting a session', async () => {
    const backend = createBackend()

    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let value = 1; { value }' }],
    })
    await backend.openDocument({ path: 'lib.dvala', source: 'let value = 41; { value }', version: 2 })

    const result = await backend.startSession({
      requestId: 25,
      path: 'main.dvala',
      source: 'let { value } = import("./lib"); value + 1',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 25,
        sessionId: expect.any(String),
      }),
    )
    if (result.ok) {
      expect(result.runResult).toEqual(
        expect.objectContaining({
          type: 'completed',
          value: 42,
        }),
      )
    }
  })
})
