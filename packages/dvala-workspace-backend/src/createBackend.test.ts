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
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let exported = 1; { exported }' } })
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
        message: 'Backend document mirror missing or stale for main.dvala',
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
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let exported = 1; { exported }' } })

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
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let value = 2\n{ value }' } })

    const result = await backend.requestCompletion({
      requestId: 15,
      path: 'main.dvala',
      source: 'let value = 1\nlet lib = import("./lib")\nval',
      version: 5,
      line: 3,
      column: 4,
      prefix: 'val',
      importPrefix: null,
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
    await backend.persistFile({ file: { path: 'utils/math.dvala', code: 'let value = 1' } })

    const result = await backend.requestCompletion({
      requestId: 17,
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

  it('uses the backend-owned workspace snapshot for import path completions', async () => {
    const backend = createBackend()
    await backend.persistFile({ file: { path: 'utils/math.dvala', code: 'let value = 1' } })

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

  it('uses the backend-owned workspace snapshot for import definition navigation', async () => {
    const backend = createBackend()
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let exported = 1; { exported }' } })

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

  it('uses unsaved open documents for cross-file rename', async () => {
    const backend = createBackend()
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let stale = 1\n{ stale }' } })
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

  it('uses the open document source instead of the persisted file when both exist', async () => {
    const backend = createBackend()

    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let stale = 1\n{ stale }' } })
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

  describe('requestSemanticTokens', () => {
    it('emits tokens with kinds derived from the symbol table', async () => {
      const backend = createBackend()
      const source = 'let answer = 42;\nlet add = (a, b) -> a + b;\nadd(answer, 1)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSemanticTokens({
        requestId: 80,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Defs: `answer` (variable, decl), `add` (function, decl), `a` (parameter, decl), `b` (parameter, decl).
      // Refs: `add` (function), `answer` (variable), `a` (parameter), `b` (parameter).
      // Tokens are sorted by (line, column).
      const summary = result.tokens.map(t => ({
        line: t.line,
        col: t.startColumn,
        type: t.tokenType,
        decl: t.modifiers.includes('declaration'),
      }))
      expect(summary).toEqual([
        { line: 1, col: 5, type: 'variable', decl: true }, // let answer
        { line: 2, col: 5, type: 'function', decl: true }, // let add
        { line: 2, col: 12, type: 'parameter', decl: true }, // (a, …)
        { line: 2, col: 15, type: 'parameter', decl: true }, // (…, b)
        { line: 2, col: 21, type: 'parameter', decl: false }, // a in a + b
        { line: 2, col: 25, type: 'parameter', decl: false }, // b in a + b
        { line: 3, col: 1, type: 'function', decl: false }, // add(...)
        { line: 3, col: 5, type: 'variable', decl: false }, // answer in arg
      ])
    })

    it('colors a whole-import binding as namespace', async () => {
      const backend = createBackend()
      const source = 'let math = import("math");\nmath'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSemanticTokens({
        requestId: 81,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const mathDef = result.tokens.find(t => t.line === 1 && t.startColumn === 5)
      expect(mathDef?.tokenType).toBe('namespace')
      expect(mathDef?.modifiers).toContain('declaration')
    })

    it('refines a destructured-import binding via type info (Position E)', async () => {
      // `sin` from the math module is a Function — color as `function`,
      // NOT `namespace`. The whole-module-binding case above stays
      // `namespace` because there's no destructured key.
      const backend = createBackend()
      const source = 'let { sin } = import("math");\nsin(0)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSemanticTokens({
        requestId: 82,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const sinDef = result.tokens.find(t => t.line === 1 && t.startColumn === 7)
      expect(sinDef?.tokenType).toBe('function')
      expect(sinDef?.modifiers).toContain('declaration')
    })

    it('returns resync-required when the document mirror is stale', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestSemanticTokens({
        requestId: 83,
        path: 'main.dvala',
        version: 99,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('resync-required')
    })
  })

  describe('requestInlayHints', () => {
    it('emits parameter-name hints at user-function call sites', async () => {
      const backend = createBackend()
      const source = 'let add = (a, b) -> a + b;\nadd(1, 2)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestInlayHints({
        requestId: 90,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // `add(1, 2)` — both args get hints; line 2, columns 5 (`1`) and 8 (`2`).
      expect(result.hints).toEqual([
        { line: 2, column: 5, label: 'a:' },
        { line: 2, column: 8, label: 'b:' },
      ])
    })

    it('skips self-documenting arguments (arg name matches param name)', async () => {
      const backend = createBackend()
      const source = 'let add = (a, b) -> a + b;\nlet a = 1;\nlet b = 2;\nadd(a, b)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestInlayHints({
        requestId: 91,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Both args are Sym refs matching their param names — no hints.
      expect(result.hints).toEqual([])
    })

    it('emits hints for builtin function calls using the reference catalog', async () => {
      const backend = createBackend()
      const source = 'max(3, 7)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestInlayHints({
        requestId: 92,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // `max` is a builtin; its first variant has argumentNames. Expect at
      // least one hint with a `:`-suffixed label.
      expect(result.hints.length).toBeGreaterThan(0)
      for (const hint of result.hints) {
        expect(hint.label).toMatch(/:$/)
      }
    })

    // B1 regression: function calls inside a match case body were
    // invisible to the inlay-hints walker pre-walkAst. The helper hint
    // here lives inside a `case _ then add(...)` body.
    it('emits hints for call sites inside match case bodies', async () => {
      const backend = createBackend()
      const source = 'let add = (a, b) -> a + b;\nlet f = (x: Number) -> match x\n  case _ then add(1, 2)\nend;\nf(5)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestInlayHints({
        requestId: 94,
        path: 'main.dvala',
        version: 1,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // `add(1, 2)` inside the case body — both args should get hints.
      const insideCase = result.hints.filter(h => h.line === 3)
      expect(insideCase).toHaveLength(2)
      expect(insideCase.map(h => h.label)).toEqual(['a:', 'b:'])
    })

    it('returns resync-required when the document mirror is stale', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestInlayHints({
        requestId: 93,
        path: 'main.dvala',
        version: 99,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('resync-required')
    })
  })

  describe('requestCodeActions', () => {
    it("offers an 'insert catchall' quick-fix for a Non-exhaustive match diagnostic", async () => {
      const backend = createBackend()
      const source = 'let f = (n: Number) -> match n\n  case 0 then 0\n  case 1 then 1\nend;\nf(5)'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 200,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 24,
        endLine: 1,
        endColumn: 31,
        diagnostics: [
          {
            message: 'Non-exhaustive match — cannot prove every value of Number is covered',
            startLine: 1,
            startColumn: 24,
            endLine: 1,
            endColumn: 31,
          },
        ],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // The selection passed alongside the diagnostic is non-empty, so
      // extract-variable / extract-function may also fire — filter to the
      // quickfix we're actually asserting on.
      const quickfixes = result.actions.filter(a => a.kind === 'quickfix')
      expect(quickfixes).toHaveLength(1)
      const action = quickfixes[0]!
      expect(action.title).toContain('catchall')
      expect(action.fixesDiagnostics?.[0]?.message).toContain('Non-exhaustive match')
      expect(action.edits).toHaveLength(1)
      const edit = action.edits[0]!
      // The edit inserts before the line containing `end` (line 4, column 1).
      expect(edit.startLine).toBe(4)
      expect(edit.startColumn).toBe(1)
      expect(edit.endLine).toBe(4)
      expect(edit.endColumn).toBe(1)
      expect(edit.newText).toMatch(/case _ then perform\(@dvala\.error, "unhandled match case"\)\n$/)
      expect(edit.newText).toMatch(/^  /) // two-space indent for the new case
    })

    it('returns no actions when the diagnostic message is not a Non-exhaustive match', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 201,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
        diagnostics: [{ message: 'Some other diagnostic', startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.actions).toHaveLength(0)
    })

    it('returns no actions when the diagnostic position is not inside any match', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 202,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
        diagnostics: [{ message: 'Non-exhaustive match', startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.actions).toHaveLength(0)
    })

    // Regression for B1: prior to extracting the shared `walkAst` helper,
    // the per-site walker only descended two payload levels. A `MatchCase`
    // tuple `[BindingTarget, body, guard]` sits at depth 3 from the outer
    // Match's payload, so case body AstNodes — including any nested Match
    // inside them — were never visited. The quick-fix would either target
    // the outer match (if one existed) or return no action, never the
    // inner non-exhaustive match the user was actually working on.
    it('finds the innermost match when a non-exhaustive match is nested inside another case body', async () => {
      const backend = createBackend()
      const source = [
        'let f = (x: Number) -> match x',
        '  case 0 then 0',
        '  case _ then match x',
        '    case 1 then 1',
        '  end',
        'end;',
        'f(2)',
      ].join('\n')
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 204,
        path: 'main.dvala',
        version: 1,
        // Position on the inner match's `case 1` line (line 4). The inner
        // match starts on line 3 at the `match x` after `then`.
        startLine: 4,
        startColumn: 5,
        endLine: 4,
        endColumn: 5,
        diagnostics: [
          {
            message: 'Non-exhaustive match — cannot prove every value of Number is covered',
            startLine: 4,
            startColumn: 5,
            endLine: 4,
            endColumn: 10,
          },
        ],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.actions).toHaveLength(1)
      const edit = result.actions[0]!.edits[0]!
      // The catchall must insert at the INNER match's `end` (line 5), not
      // the outer match's `end` (line 6). The inner end is indented by 2.
      expect(edit.startLine).toBe(5)
      expect(edit.newText).toMatch(/^    /) // outer indent (2) + case indent (2) = 4 spaces
    })

    it('offers an extract-variable refactor for an expression selection', async () => {
      const backend = createBackend()
      const source = 'let answer = 1 + 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      // Select `1 + 2` (columns 14..19 exclusive end). No diagnostics.
      const result = await backend.requestCodeActions({
        requestId: 205,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 19,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Both extract-variable and extract-function fire on a non-empty
      // selection; filter to the variable one. The user picks from the
      // Cmd+. menu which they want.
      const extractActions = result.actions.filter(a => a.kind === 'refactor.extract' && a.title.includes('variable'))
      expect(extractActions).toHaveLength(1)
      const action = extractActions[0]!
      expect(action.title).toContain('Extract')
      expect(action.edits).toHaveLength(2)
      // First edit: insert `let extracted = 1 + 2;\n` above line 1.
      expect(action.edits[0]).toMatchObject({
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
        newText: 'let extracted = 1 + 2;\n',
      })
      // Second edit: replace the selection with `extracted`.
      expect(action.edits[1]).toMatchObject({
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 19,
        newText: 'extracted',
      })
    })

    it('offers an inline-variable refactor when the cursor is on a let binding name', async () => {
      const backend = createBackend()
      const source = 'let answer = 42;\nanswer + 1'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 207,
        path: 'main.dvala',
        version: 1,
        // Cursor on `answer` def site (line 1, column 5).
        startLine: 1,
        startColumn: 5,
        endLine: 1,
        endColumn: 5,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const inlineActions = result.actions.filter(a => a.kind === 'refactor.inline')
      expect(inlineActions).toHaveLength(1)
      const action = inlineActions[0]!
      expect(action.title).toBe("Inline variable 'answer'")
      // First edit removes the let line. Subsequent edits replace each
      // reference with the value text (`42` — numeric literal, no parens).
      expect(action.edits[0]).toMatchObject({
        startLine: 1,
        startColumn: 1,
        endLine: 2,
        endColumn: 1,
        newText: '',
      })
      const refEdits = action.edits.slice(1)
      expect(refEdits).toHaveLength(1)
      expect(refEdits[0]).toMatchObject({ newText: '42' })
    })

    it('does not offer inline-variable when the binding has zero references', async () => {
      const backend = createBackend()
      const source = 'let unused = 42'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 208,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 5,
        endLine: 1,
        endColumn: 5,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const inlineActions = result.actions.filter(a => a.kind === 'refactor.inline')
      expect(inlineActions).toHaveLength(0)
    })

    it('does not offer inline-variable for destructuring bindings (v1 restriction)', async () => {
      const backend = createBackend()
      const source = 'let { x } = obj;\nx + 1'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 209,
        path: 'main.dvala',
        version: 1,
        // Cursor on `x` inside the destructure.
        startLine: 1,
        startColumn: 7,
        endLine: 1,
        endColumn: 7,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const inlineActions = result.actions.filter(a => a.kind === 'refactor.inline')
      expect(inlineActions).toHaveLength(0)
    })

    it('offers an extract-function refactor for a selection with no free variables', async () => {
      const backend = createBackend()
      const source = 'let answer = 1 + 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 210,
        path: 'main.dvala',
        version: 1,
        // Select `1 + 2` (cols 14..19, end exclusive).
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 19,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const fnActions = result.actions.filter(a => a.kind === 'refactor.extract' && a.title.includes('function'))
      expect(fnActions).toHaveLength(1)
      const action = fnActions[0]!
      // First edit: insert the let extracted = () -> do ... end; line.
      expect(action.edits[0]?.newText).toBe('let extracted = () -> do\n  1 + 2\nend;\n')
      // Second edit: replace selection with a parameterless call.
      expect(action.edits[1]?.newText).toBe('extracted()')
    })

    it('extracts free variables as function parameters and call arguments', async () => {
      const backend = createBackend()
      // `x` and `y` are function parameters. Selecting `x + y` should
      // turn them into params of the extracted function (their defs live
      // outside the selection, at the lambda signature).
      const source = 'let f = (x, y) -> x + y'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 211,
        path: 'main.dvala',
        version: 1,
        // Select `x + y` (cols 19..24, end exclusive).
        startLine: 1,
        startColumn: 19,
        endLine: 1,
        endColumn: 24,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const fnActions = result.actions.filter(a => a.kind === 'refactor.extract' && a.title.includes('function'))
      expect(fnActions).toHaveLength(1)
      const action = fnActions[0]!
      expect(action.edits[0]?.newText).toContain('let extracted = (x, y) -> do')
      expect(action.edits[1]?.newText).toBe('extracted(x, y)')
    })

    it('dedupes repeated free-variable refs by name (one ref per name in params)', async () => {
      const backend = createBackend()
      // `x` is the only param; it appears twice inside the selection. The
      // extracted function should take a single `x` parameter, not two.
      const source = 'let f = (x) -> x * x'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 212,
        path: 'main.dvala',
        version: 1,
        // Select `x * x` (cols 16..21, end exclusive).
        startLine: 1,
        startColumn: 16,
        endLine: 1,
        endColumn: 21,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const fnActions = result.actions.filter(a => a.kind === 'refactor.extract' && a.title.includes('function'))
      expect(fnActions).toHaveLength(1)
      const action = fnActions[0]!
      // Single `x` param, single `x` arg — not `(x, x)` / `(x, x)`.
      expect(action.edits[0]?.newText).toContain('let extracted = (x) -> do')
      expect(action.edits[1]?.newText).toBe('extracted(x)')
    })

    it('excludes refs whose def lives inside the selection from the free-vars list', async () => {
      const backend = createBackend()
      // `inner` is both defined AND referenced inside the selection — it
      // is local to the extracted body, NOT a free variable. The
      // extracted function should be parameterless.
      const source = 'let outer = do let inner = 42; inner + 1 end'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 213,
        path: 'main.dvala',
        version: 1,
        // Select `let inner = 42; inner + 1` (cols 16..41, end exclusive).
        startLine: 1,
        startColumn: 16,
        endLine: 1,
        endColumn: 41,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const fnActions = result.actions.filter(a => a.kind === 'refactor.extract' && a.title.includes('function'))
      expect(fnActions).toHaveLength(1)
      const action = fnActions[0]!
      // No params: the def-inside-selection check kept `inner` out of the
      // free-vars list.
      expect(action.edits[0]?.newText).toContain('let extracted = () -> do')
      expect(action.edits[1]?.newText).toBe('extracted()')
    })

    it('does not offer extract-variable for a zero-width cursor (no selection)', async () => {
      const backend = createBackend()
      const source = 'let answer = 1 + 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      // Cursor without a selection — extract has nothing to act on. We
      // intentionally trust whatever the user selected for v1 (the
      // Dvala AST source-map quirk for binary ops makes AST-aligned
      // extraction unreliable; see project_parser_source_map_ranges
      // memory). Zero-width selection is the one case we still
      // reliably reject.
      const result = await backend.requestCodeActions({
        requestId: 206,
        path: 'main.dvala',
        version: 1,
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 14,
        diagnostics: [],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const extractActions = result.actions.filter(a => a.kind === 'refactor.extract')
      expect(extractActions).toHaveLength(0)
    })

    it('returns resync-required when the document mirror is stale', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestCodeActions({
        requestId: 203,
        path: 'main.dvala',
        version: 99,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
        diagnostics: [],
      })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('resync-required')
    })
  })

  describe('requestSelectionRange', () => {
    it('returns containment chain innermost → outermost', async () => {
      const backend = createBackend()
      const source = 'let answer = 1 + 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      // Position on the `1` literal. Expect: literal `1` → call `1 + 2` → let → top-level.
      const result = await backend.requestSelectionRange({
        requestId: 100,
        path: 'main.dvala',
        version: 1,
        positions: [{ line: 1, column: 14 }],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ranges).toHaveLength(1)
      const chain = result.ranges[0]!
      expect(chain.length).toBeGreaterThan(1)
      // First range covers (or starts at) the literal `1`; last range spans
      // the whole document. Innermost must be a subset of every outer range.
      for (let i = 1; i < chain.length; i++) {
        const inner = chain[i - 1]!
        const outer = chain[i]!
        const innerSize = (inner.endLine - inner.startLine) * 1000 + (inner.endColumn - inner.startColumn)
        const outerSize = (outer.endLine - outer.startLine) * 1000 + (outer.endColumn - outer.startColumn)
        expect(outerSize).toBeGreaterThanOrEqual(innerSize)
      }
    })

    it('returns one chain per requested position', async () => {
      const backend = createBackend()
      const source = 'let a = 1;\nlet b = 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 101,
        path: 'main.dvala',
        version: 1,
        positions: [
          { line: 1, column: 9 }, // on `1`
          { line: 2, column: 9 }, // on `2`
        ],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ranges).toHaveLength(2)
      expect(result.ranges[0]!.length).toBeGreaterThan(0)
      expect(result.ranges[1]!.length).toBeGreaterThan(0)
    })

    it('returns an empty chain for a position outside any AST node', async () => {
      // Position on a blank line — no node spans it. Tests the empty-chain
      // path that the VS Code adapter falls back to a cursor-anchored
      // zero-width range for.
      const backend = createBackend()
      const source = 'let x = 1;\n\nlet y = 2'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 103,
        path: 'main.dvala',
        version: 1,
        positions: [{ line: 2, column: 1 }], // blank line
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ranges).toHaveLength(1)
      expect(result.ranges[0]).toEqual([])
    })

    it('handles deeply nested expressions with strict-containment ordering', async () => {
      // `f(g(h(1)))` at the `1` literal — chain should be at least 4 deep
      // (Literal, h-call, g-call, f-call) and each outer must strictly
      // contain the next inner.
      const backend = createBackend()
      const source = 'let f = (x) -> x;\nlet g = (x) -> x;\nlet h = (x) -> x;\nf(g(h(1)))'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 104,
        path: 'main.dvala',
        version: 1,
        positions: [{ line: 4, column: 8 }], // on `1`
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const chain = result.ranges[0]!
      expect(chain.length).toBeGreaterThanOrEqual(4)
      // Strict containment: each outer range must wholly enclose its inner.
      for (let i = 1; i < chain.length; i++) {
        const inner = chain[i - 1]!
        const outer = chain[i]!
        const outerStartsBefore =
          outer.startLine < inner.startLine ||
          (outer.startLine === inner.startLine && outer.startColumn <= inner.startColumn)
        const outerEndsAfter =
          outer.endLine > inner.endLine || (outer.endLine === inner.endLine && outer.endColumn >= inner.endColumn)
        expect(outerStartsBefore && outerEndsAfter).toBe(true)
      }
    })

    // Same B1 regression as the code-actions nested-match test: the
    // shared `walkAst` helper now descends into Match case body AstNodes,
    // so selection-range chains correctly include nodes from inside case
    // bodies. Pre-fix, a cursor on a `1` inside a nested case body would
    // skip every AST node deeper than two payload levels.
    it('includes nodes from inside nested match case bodies in the containment chain', async () => {
      const backend = createBackend()
      const source = 'let f = (x: Number) -> match x\n  case _ then match x\n    case 1 then 1\n  end\nend'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 106,
        path: 'main.dvala',
        version: 1,
        positions: [{ line: 3, column: 18 }], // on the trailing `1` literal
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const chain = result.ranges[0]!
      // The chain should include nodes inside the inner case body — at
      // minimum the innermost literal, the case body, the inner match,
      // and the outer match. Pre-walkAst fix, this chain was empty or
      // had only the outermost let.
      expect(chain.length).toBeGreaterThanOrEqual(3)
    })

    it('returns a chain when the cursor is at the first column of a node', async () => {
      // Boundary test: cursor sits exactly on a node's start. `positionContains`
      // uses `>=` for the start side; this must hit, not miss.
      const backend = createBackend()
      const source = 'let answer = 42'
      await backend.openDocument({ path: 'main.dvala', source, version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 105,
        path: 'main.dvala',
        version: 1,
        positions: [{ line: 1, column: 1 }], // first char of `let`
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ranges[0]!.length).toBeGreaterThan(0)
    })

    it('returns resync-required when the document mirror is stale', async () => {
      const backend = createBackend()
      await backend.openDocument({ path: 'main.dvala', source: 'let x = 1', version: 1 })

      const result = await backend.requestSelectionRange({
        requestId: 102,
        path: 'main.dvala',
        version: 99,
        positions: [{ line: 1, column: 1 }],
      })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('resync-required')
    })
  })

  it('returns the symbol at a position through the backend', async () => {
    const backend = createBackend()
    const source = 'let answer = 42;\nlet add = (a, b) -> a + b;'
    await backend.openDocument({ path: 'main.dvala', source, version: 1 })

    const onDef = await backend.requestSymbolAtPosition({
      requestId: 50,
      path: 'main.dvala',
      source,
      version: 1,
      line: 1,
      column: 5,
    })
    expect(onDef).toEqual(expect.objectContaining({ ok: true, requestId: 50, path: 'main.dvala', version: 1 }))
    if (onDef.ok) expect(onDef.symbol).toEqual({ name: 'answer' })

    const onRef = await backend.requestSymbolAtPosition({
      requestId: 51,
      path: 'main.dvala',
      source,
      version: 1,
      line: 2,
      column: 21,
    })
    if (onRef.ok) expect(onRef.symbol).toEqual({ name: 'a' })

    const onWhitespace = await backend.requestSymbolAtPosition({
      requestId: 52,
      path: 'main.dvala',
      source,
      version: 1,
      line: 1,
      column: 1,
    })
    if (onWhitespace.ok) expect(onWhitespace.symbol).toBeUndefined()
  })

  it('returns workspace symbols through the backend-owned state', async () => {
    const backend = createBackend()
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let exported = 1; { exported }' } })
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
    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let fresh = 1\n{ fresh }' } })

    const result = await backend.requestNavigation({
      requestId: 21,
      kind: 'references',
      path: 'main.dvala',
      source: 'let { fresh } = import("./lib"); fresh',
      version: 8,
      line: 1,
      column: 7,
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

    await backend.persistFile({ file: { path: 'lib.dvala', code: 'let value = 1; { value }' } })
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

    await backend.persistFile({ file: { path: '.dvala-playground/secret.dvala', code: '41' } })

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
      error: {
        kind: 'cancelled',
        message: 'Backend session start request cancelled',
        path: 'main.dvala',
      },
    })

    expect(start).not.toHaveBeenCalled()
  })
})
