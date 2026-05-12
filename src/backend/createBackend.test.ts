import { describe, expect, it } from 'vitest'

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

  it('includes unresolved-symbol diagnostics from the backend-owned index', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: 'missingValue + 1', version: 1 })

    const result = await backend.requestDiagnostics({
      requestId: 2,
      path: 'main.dvala',
      version: 1,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 2,
        path: 'main.dvala',
        version: 1,
      }),
    )

    if (result.ok) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          message: "Undefined symbol 'missingValue'",
          source: 'dvala',
          severity: 'error',
        }),
      )
    }
  })

  it('resolves imported bindings before emitting backend-owned unresolved-symbol diagnostics', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }],
    })
    await backend.openDocument({
      path: 'main.dvala',
      source: 'let { exported } = import("./lib"); exported',
      version: 1,
    })

    const result = await backend.requestDiagnostics({
      requestId: 3,
      path: 'main.dvala',
      version: 1,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 3,
        path: 'main.dvala',
        version: 1,
      }),
    )

    if (result.ok) {
      expect(result.diagnostics.filter(diag => diag.message.includes('Undefined symbol'))).toEqual([])
    }
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

  it('computes imported hover information through the backend-owned workspace state', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }],
    })

    const source = 'let { exported } = import("./lib"); exported'
    const result = await backend.requestHover({
      requestId: 14,
      path: 'main.dvala',
      source,
      version: 5,
      line: 1,
      column: 37,
      startColumn: 37,
      endColumn: 45,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 14,
        path: 'main.dvala',
        version: 5,
      }),
    )
    if (result.ok) {
      expect(result.inferredType).toMatch(/Integer|1/)
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

  it('uses the backend-owned workspace snapshot for import path completions when callers omit workspaceFiles', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'utils/math.dvala', code: 'let value = 1' }],
    })

    const result = await backend.requestCompletion({
      requestId: 18,
      path: 'main.dvala',
      source: 'let lib = import("./u")',
      version: 6,
      line: 1,
      column: 22,
      prefix: '',
      importPrefix: './u',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 18,
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

  it('uses the backend-owned workspace snapshot for import definition navigation when callers omit workspaceFiles', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }],
    })

    const definition = await backend.requestNavigation({
      requestId: 20,
      kind: 'definition',
      path: 'main.dvala',
      source: 'let lib = import("./lib")',
      version: 7,
      line: 1,
      column: 20,
    })

    expect(definition).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 20,
        kind: 'definition',
        path: 'main.dvala',
        version: 7,
      }),
    )
    if (definition.ok) {
      expect(definition.locations).toEqual([
        {
          file: 'lib.dvala',
          line: 1,
          column: 1,
          endColumn: 1,
        },
      ])
    }
  })

  it('computes signature help through the backend', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: 'let add = (a, b) -> a + b\nadd(', version: 9 })

    const result = await backend.requestSignatureHelp({
      requestId: 22,
      path: 'main.dvala',
      source: 'let add = (a, b) -> a + b\nadd(',
      version: 9,
      line: 2,
      column: 5,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 22,
        path: 'main.dvala',
        version: 9,
        activeParameter: 0,
      }),
    )
    if (result.ok) {
      expect(result.signatures).toEqual([{ label: 'add(a, b)', parameters: ['a', 'b'] }])
    }
  })

  it('returns document symbols through the backend', async () => {
    const backend = createBackend()
    await backend.openDocument({
      path: 'main.dvala',
      source: 'let answer = 42;\nlet add = (a, b) -> a + b;',
      version: 10,
    })

    const result = await backend.requestDocumentSymbols({
      requestId: 23,
      path: 'main.dvala',
      source: 'let answer = 42;\nlet add = (a, b) -> a + b;',
      version: 10,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 23,
        path: 'main.dvala',
        version: 10,
      }),
    )
    if (result.ok) {
      expect(result.symbols).toEqual(
        expect.arrayContaining([
          { name: 'answer', kind: 'variable', line: 1, column: 5 },
          { name: 'add', kind: 'function', line: 2, column: 5 },
        ]),
      )
    }
  })

  it('returns workspace symbols through the backend-owned state', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }],
    })
    await backend.openDocument({ path: 'main.dvala', source: 'let answer = 42', version: 11 })

    const result = await backend.requestWorkspaceSymbols({
      requestId: 24,
      query: 'exp',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 24,
      }),
    )
    if (result.ok) {
      expect(result.symbols).toEqual([{ file: 'lib.dvala', name: 'exported', kind: 'variable', line: 1, column: 5 }])
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
      pure: true,
      terminalSnapshot: true,
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
        snapshot: expect.any(Object),
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

  it('preserves debug-mode source locations for runtime errors', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 28,
      path: 'main.dvala',
      source: 'assert(false, "boom")',
      pure: true,
      debug: true,
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 28,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok) return

    expect(started.runResult.type).toBe('error')
    if (started.runResult.type === 'error') {
      expect(started.runResult.error.message).toContain('main.dvala')
    }
  })

  it('starts a suspended session with provided effect handlers and resumes it through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 24,
      path: 'main.dvala',
      source: 'let x = perform(@my.ask); x + 1',
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 24,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok) return

    expect(started.runResult.type).toBe('suspended')
    if (started.runResult.type !== 'suspended') return

    const startedInspection = await backend.inspectSession(started.sessionId)
    expect(startedInspection).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: started.sessionId,
        status: 'suspended',
        lastUpdatedAt: expect.any(Number),
      }),
    )

    const resumed = await backend.resumeSnapshot({
      requestId: 25,
      snapshot: started.runResult.snapshot,
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
        ok: true,
        requestId: 25,
        sessionId: expect.any(String),
      }),
    )
    if (!resumed.ok) return

    expect(resumed.runResult).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
        snapshot: expect.any(Object),
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

  it('inspects checkpoint snapshots through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 29,
      path: 'main.dvala',
      source: 'perform(@dvala.checkpoint, "before"); let x = perform(@my.ask); x + 1',
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 29,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok || started.runResult.type !== 'suspended') return

    const inspection = await backend.inspectSnapshot({
      requestId: 30,
      snapshot: started.runResult.snapshot,
    })

    expect(inspection).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 30,
      }),
    )
    if (inspection.ok) {
      expect(inspection.checkpointSnapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'before',
          }),
        ]),
      )
    }
  })

  it('uses backend-owned workspace overlays when starting a session', async () => {
    const backend = createBackend()

    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let value = 1; { value }' }],
    })
    await backend.openDocument({ path: 'lib.dvala', source: 'let value = 41; { value }', version: 2 })

    const result = await backend.startSession({
      requestId: 26,
      path: 'main.dvala',
      source: 'let { value } = import("./lib"); value + 1',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 26,
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

  it('inspects snapshot bindings through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 31,
      path: 'main.dvala',
      source: 'let answer = 42; let local = "ok"; let x = perform(@my.ask); x + answer',
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 31,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok || started.runResult.type !== 'suspended') return

    const inspection = await backend.inspectSnapshotBindings({
      requestId: 32,
      snapshot: started.runResult.snapshot,
    })

    expect(inspection).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 32,
      }),
    )
    if (inspection.ok) {
      expect(inspection.bindings).toEqual({
        answer: 42,
        local: 'ok',
      })
    }
  })

  it('validates imported snapshots through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 33,
      path: 'main.dvala',
      source: 'let x = perform(@my.ask); x + 1',
      effectHandlers: [
        {
          pattern: 'my.ask',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 33,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok || started.runResult.type !== 'suspended') return

    const validation = await backend.validateSnapshot({
      requestId: 34,
      value: started.runResult.snapshot,
    })

    expect(validation).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 34,
        snapshot: started.runResult.snapshot,
      }),
    )
  })

  it('rejects invalid imported snapshots through the backend', async () => {
    const backend = createBackend()

    const validation = await backend.validateSnapshot({
      requestId: 35,
      value: { id: 'bad', message: 'oops' },
    })

    expect(validation).toEqual({
      ok: false,
      requestId: 35,
      error: {
        kind: 'invalid-request',
        message: 'Not a valid snapshot object.',
      },
    })
  })

  it('rejects imported snapshots with malformed continuation blobs through the backend', async () => {
    const backend = createBackend()

    const validation = await backend.validateSnapshot({
      requestId: 36,
      value: {
        id: 'bad',
        continuation: {},
        timestamp: 0,
        index: 0,
        executionId: 'run-1',
        message: 'snapshot',
      },
    })

    expect(validation).toEqual({
      ok: false,
      requestId: 36,
      error: {
        kind: 'invalid-request',
        message: 'Not a valid snapshot object.',
      },
    })
  })

  it('rejects imports into the playground state folder for runtime sessions', async () => {
    const backend = createBackend()

    await backend.replaceWorkspaceSnapshot({
      files: [{ path: '.dvala-playground/secret.dvala', code: '41' }],
    })

    const result = await backend.startSession({
      requestId: 27,
      path: 'main.dvala',
      source: 'import("./.dvala-playground/secret")',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 27,
        sessionId: expect.any(String),
        runResult: expect.objectContaining({
          type: 'error',
        }),
      }),
    )
    if (result.ok) {
      expect(result.runResult.type).toBe('error')
      if (result.runResult.type === 'error') {
        expect(result.runResult.error.message).toContain('.dvala-playground/')
      }
    }
  })
})
