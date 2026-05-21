import { describe, expect, it, vi } from 'vitest'

import { createBackend } from './createBackend'
import type { BackendSessionResumeRequest } from './requests'
import type { BackendRuntimeAdapter } from './runtime/runtimeAdapter'

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

  it('returns resync-required when updateDocument previousVersion does not match mirror state', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: '1 + 1', version: 2 })

    const result = await backend.updateDocument(
      {
        path: 'main.dvala',
        source: '1 + 2',
        version: 3,
      },
      1,
    )

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'resync-required',
        path: 'main.dvala',
      },
    })
  })

  it('accepts updateDocument when previousVersion matches mirror state', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: '1 + 1', version: 2 })

    const update = await backend.updateDocument(
      {
        path: 'main.dvala',
        source: '1 + 2',
        version: 3,
      },
      2,
    )

    expect(update).toEqual({ ok: true })

    const diagnostics = await backend.requestDiagnostics({
      requestId: 10,
      path: 'main.dvala',
      version: 3,
    })

    expect(diagnostics).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 10,
        path: 'main.dvala',
        version: 3,
      }),
    )
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

  it('formats the mirrored active document through the backend when source is omitted', async () => {
    const backend = createBackend()

    await backend.openDocument({
      path: 'main.dvala',
      source: 'let x=1',
      version: 3,
    })

    const result = await backend.requestFormatting({
      requestId: 12,
      path: 'main.dvala',
      version: 3,
    })

    expect(result).toEqual({
      ok: true,
      requestId: 12,
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

  it('computes hover information from the mirrored active document when source is omitted', async () => {
    const backend = createBackend()

    await backend.openDocument({
      path: 'main.dvala',
      source: 'let answer = 42',
      version: 4,
    })

    const result = await backend.requestHover({
      requestId: 14,
      path: 'main.dvala',
      version: 4,
      line: 1,
      column: 5,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 14,
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

  it('uses unsaved open documents for cross-file rename when callers omit workspaceFiles', async () => {
    const backend = createBackend()
    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let stale = 1\n{ stale }' }],
    })
    await backend.openDocument({
      path: 'lib.dvala',
      source: 'let fresh = 1\n{ fresh }',
      version: 2,
    })

    const rename = await backend.requestNavigation({
      requestId: 21,
      kind: 'rename',
      path: 'main.dvala',
      source: 'let { fresh } = import("./lib"); fresh',
      version: 7,
      line: 1,
      column: 7,
      newName: 'renamed',
    })

    expect(rename).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 21,
        kind: 'rename',
        path: 'main.dvala',
        version: 7,
      }),
    )
    if (rename.ok) {
      expect(rename.edits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'lib.dvala', text: 'renamed' }),
          expect.objectContaining({ file: 'main.dvala', text: 'renamed' }),
        ]),
      )
    }
  })

  it('does not let compatibility workspaceFiles override backend-owned open document state', async () => {
    const backend = createBackend()

    await backend.replaceWorkspaceSnapshot({
      files: [{ path: 'lib.dvala', code: 'let stale = 1\n{ stale }' }],
    })
    await backend.openDocument({
      path: 'lib.dvala',
      source: 'let fresh = 1\n{ fresh }',
      version: 2,
    })

    const rename = await backend.requestNavigation({
      requestId: 22,
      kind: 'rename',
      path: 'main.dvala',
      source: 'let { fresh } = import("./lib"); fresh',
      version: 7,
      line: 1,
      column: 7,
      newName: 'renamed',
      workspaceFiles: [{ path: 'lib.dvala', code: 'let stale = 1\n{ stale }' }],
    })

    expect(rename).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 22,
        kind: 'rename',
        path: 'main.dvala',
        version: 7,
      }),
    )

    if (rename.ok) {
      expect(rename.edits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'lib.dvala', text: 'renamed' }),
          expect.objectContaining({ file: 'main.dvala', text: 'renamed' }),
        ]),
      )
      expect(rename.edits).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: 'stale' })]))
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

  it('rejects imported snapshots with malformed embedded checkpoint snapshots through the backend', async () => {
    const backend = createBackend()

    const started = await backend.startSession({
      requestId: 37,
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
        requestId: 37,
        sessionId: expect.any(String),
      }),
    )
    if (!started.ok || started.runResult.type !== 'suspended') return

    const imported = JSON.parse(JSON.stringify(started.runResult.snapshot)) as {
      continuation: { snapshots?: { continuation: unknown }[] }
    }
    if (imported.continuation.snapshots?.[0]) {
      imported.continuation.snapshots[0].continuation = {}
    }

    const validation = await backend.validateSnapshot({
      requestId: 38,
      value: imported,
    })

    expect(validation).toEqual({
      ok: false,
      requestId: 38,
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

  it('delegates runtime session lifecycle through an injected backend runtime adapter', async () => {
    const start = vi.fn().mockResolvedValue({
      sessionId: 'adapter-start',
      runResult: { type: 'completed', value: 42 },
    })
    const resumeSession = vi.fn().mockResolvedValue({
      sessionId: 'adapter-resume',
      runResult: { type: 'completed', value: 43 },
    })
    const inspect = vi.fn().mockResolvedValue({
      ok: true,
      sessionId: 'adapter-start',
      status: 'completed',
      lastUpdatedAt: 123,
    })
    const inspectSnapshot = vi.fn().mockResolvedValue([{ id: 'checkpoint-1' }])
    const inspectSnapshotBindings = vi.fn().mockResolvedValue({ answer: 42 })
    const validateSnapshot = vi.fn().mockResolvedValue({ id: 'validated-snapshot' })
    const stop = vi.fn().mockResolvedValue(undefined)
    const runtime: BackendRuntimeAdapter = {
      start,
      resume: resumeSession,
      inspectSnapshot,
      inspectSnapshotBindings,
      validateSnapshot,
      inspect,
      stop,
    }

    const backend = createBackend({ runtime })

    const started = await backend.startSession({
      requestId: 39,
      path: 'main.dvala',
      source: '41 + 1',
      pure: true,
    })

    expect(start).toHaveBeenCalledWith({
      requestId: 39,
      path: 'main.dvala',
      source: '41 + 1',
      effectHandlers: undefined,
      debug: undefined,
      pure: true,
      disableAutoCheckpoint: undefined,
      terminalSnapshot: undefined,
    })
    expect(started).toEqual({
      ok: true,
      requestId: 39,
      sessionId: 'adapter-start',
      runResult: { type: 'completed', value: 42 },
    })

    const snapshotSource = { id: 'snap' }
    const snapshot = snapshotSource as unknown as BackendSessionResumeRequest['snapshot']
    const resumed = await backend.resumeSnapshot({
      requestId: 40,
      snapshot,
      value: 7,
    })

    expect(resumeSession).toHaveBeenCalledWith({
      requestId: 40,
      snapshot,
      value: 7,
      effectHandlers: undefined,
      disableAutoCheckpoint: undefined,
      terminalSnapshot: undefined,
    })
    expect(resumed).toEqual({
      ok: true,
      requestId: 40,
      sessionId: 'adapter-resume',
      runResult: { type: 'completed', value: 43 },
    })

    await expect(backend.inspectSession('adapter-start')).resolves.toEqual({
      ok: true,
      sessionId: 'adapter-start',
      status: 'completed',
      lastUpdatedAt: 123,
    })
    expect(inspect).toHaveBeenCalledWith('adapter-start')

    await expect(
      backend.inspectSnapshot({
        requestId: 41,
        snapshot,
      }),
    ).resolves.toEqual({
      ok: true,
      requestId: 41,
      checkpointSnapshots: [{ id: 'checkpoint-1' }],
    })
    expect(inspectSnapshot).toHaveBeenCalledWith({
      requestId: 41,
      snapshot,
    })

    await expect(
      backend.inspectSnapshotBindings({
        requestId: 42,
        snapshot,
      }),
    ).resolves.toEqual({
      ok: true,
      requestId: 42,
      bindings: { answer: 42 },
    })
    expect(inspectSnapshotBindings).toHaveBeenCalledWith({
      requestId: 42,
      snapshot,
    })

    await expect(
      backend.validateSnapshot({
        requestId: 43,
        value: snapshotSource,
      }),
    ).resolves.toEqual({
      ok: true,
      requestId: 43,
      snapshot: { id: 'validated-snapshot' },
    })
    expect(validateSnapshot).toHaveBeenCalledWith({
      requestId: 43,
      value: snapshotSource,
    })

    await backend.stopSession('adapter-start')
    expect(stop).toHaveBeenCalledWith('adapter-start')
  })

  it('returns runtime-failed when the injected runtime adapter throws', async () => {
    const runtime: BackendRuntimeAdapter = {
      start: vi.fn().mockRejectedValue(new Error('adapter boom')),
      resume: vi.fn(),
      inspectSnapshot: vi.fn(),
      inspectSnapshotBindings: vi.fn(),
      validateSnapshot: vi.fn(),
      inspect: vi.fn(),
      stop: vi.fn(),
    }

    const backend = createBackend({ runtime })

    await expect(
      backend.startSession({
        requestId: 44,
        path: 'main.dvala',
        source: '41 + 1',
      }),
    ).resolves.toEqual({
      ok: false,
      requestId: 44,
      path: 'main.dvala',
      error: {
        kind: 'runtime-failed',
        message: 'adapter boom',
        path: 'main.dvala',
      },
    })
  })

  it('returns runtime-failed when validateSnapshot throws from the injected runtime adapter', async () => {
    const runtime: BackendRuntimeAdapter = {
      start: vi.fn(),
      resume: vi.fn(),
      inspectSnapshot: vi.fn(),
      inspectSnapshotBindings: vi.fn(),
      validateSnapshot: vi.fn().mockRejectedValue(new Error('validate boom')),
      inspect: vi.fn(),
      stop: vi.fn(),
    }

    const backend = createBackend({ runtime })

    await expect(
      backend.validateSnapshot({
        requestId: 45,
        value: { id: 'bad' },
      }),
    ).resolves.toEqual({
      ok: false,
      requestId: 45,
      error: {
        kind: 'runtime-failed',
        message: 'validate boom',
      },
    })
  })

  it('returns cancelled when analysis request is pre-cancelled', async () => {
    const backend = createBackend()
    await backend.openDocument({ path: 'main.dvala', source: '1 + 2', version: 1 })

    await backend.cancelRequest(100)
    const cancelled = await backend.requestDiagnostics({
      requestId: 100,
      path: 'main.dvala',
      version: 1,
    })

    expect(cancelled).toEqual({
      ok: false,
      requestId: 100,
      path: 'main.dvala',
      version: 1,
      error: {
        kind: 'cancelled',
        message: 'Backend diagnostics request cancelled',
        path: 'main.dvala',
      },
    })

    const next = await backend.requestDiagnostics({
      requestId: 100,
      path: 'main.dvala',
      version: 1,
    })

    expect(next).toEqual(
      expect.objectContaining({
        ok: true,
        requestId: 100,
        path: 'main.dvala',
        version: 1,
      }),
    )
  })

  it('returns cancelled and stops runtime session when cancellation lands during startSession', async () => {
    let resolveStart:
      | ((value: { sessionId: string; runResult: { type: 'completed'; value: number } }) => void)
      | undefined
    const start = vi.fn().mockImplementation(
      () =>
        new Promise<{ sessionId: string; runResult: { type: 'completed'; value: number } }>(resolve => {
          resolveStart = resolve
        }),
    )
    const stop = vi.fn().mockResolvedValue(undefined)
    const runtime: BackendRuntimeAdapter = {
      start,
      resume: vi.fn(),
      inspectSnapshot: vi.fn(),
      inspectSnapshotBindings: vi.fn(),
      validateSnapshot: vi.fn(),
      inspect: vi.fn(),
      stop,
    }

    const backend = createBackend({ runtime })

    const startedPromise = backend.startSession({
      requestId: 101,
      path: 'main.dvala',
      source: '41 + 1',
    })

    await backend.cancelRequest(101)
    if (typeof resolveStart === 'function') {
      resolveStart({
        sessionId: 'cancelled-session',
        runResult: { type: 'completed', value: 42 },
      })
    }

    await expect(startedPromise).resolves.toEqual({
      ok: false,
      requestId: 101,
      path: 'main.dvala',
      error: {
        kind: 'cancelled',
        message: 'Backend session start request cancelled',
        path: 'main.dvala',
      },
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledWith('cancelled-session')
  })

  it('short-circuits pre-cancelled startSession before runtime adapter invocation', async () => {
    const start = vi.fn()
    const runtime: BackendRuntimeAdapter = {
      start,
      resume: vi.fn(),
      inspectSnapshot: vi.fn(),
      inspectSnapshotBindings: vi.fn(),
      validateSnapshot: vi.fn(),
      inspect: vi.fn(),
      stop: vi.fn(),
    }

    const backend = createBackend({ runtime })
    await backend.cancelRequest(102)

    await expect(
      backend.startSession({
        requestId: 102,
        path: 'main.dvala',
        source: '41 + 1',
      }),
    ).resolves.toEqual({
      ok: false,
      requestId: 102,
      path: 'main.dvala',
      error: {
        kind: 'cancelled',
        message: 'Backend session start request cancelled',
        path: 'main.dvala',
      },
    })

    expect(start).not.toHaveBeenCalled()
  })
})
