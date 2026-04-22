# Aliased Destructuring

**Status:** Draft — needs language-design review
**Created:** 2026-04-21
**Related:** `design/archive/2026-04-21_cross-file-rename.md` (shipped PR #70), `design/archive/2026-04-21_transitive-reexports.md` (shipped PR #72)

## Goal

Allow destructuring patterns to bind a key to a differently-named local, the way most modern languages do:

```dvala
let { pi: p, e: euler } = import("./math")
```

Currently the parser rejects this syntax (`ParseError: Expected object or array` on the `:`). Only shorthand `let { pi, e } = import("./math")` is accepted, which forces the local binding name to match the exported key.

## Motivation

Three concrete pressures:

1. **Name collisions across modules.** Two imported modules export the same name — today the user has to wrap one in `let m = import("./m"); m.name`, foregoing destructuring entirely.
2. **Better rename ergonomics in importers.** With shorthand, renaming the local name *is* renaming the export key. Aliasing separates the two concerns — users can rename a local freely without triggering a cross-file rename of the origin.
3. **Alignment with the JS/TS destructuring conventions** most Dvala users arrive from.

## Non-goals

- Changing function-parameter destructuring or match-pattern destructuring in this PR, beyond what's needed for parser uniformity. If `let { k: v } = ...` parses, it is natural for function params and match patterns to follow, but the rename semantics only matter for imports. Scope decision below.
- Default values interacting with aliasing (`{ pi: p = 3.14 }`). Defaults exist in other binding contexts — the design carries them through but the details land with the language-design review.
- Re-alias-through-re-export chains (`let { pi } = import("./A"); { alpha: pi }`). Covered by the transitive re-exports design doc once aliasing lands.

## Today's representation

From `src/languageService/SymbolTableBuilder.ts` and the parser's binding-target structure:

- Object binding target payload is `[Record<string, BindingTarget>, defaultExpr?]`.
- The JS string key in `Record<string, BindingTarget>` **is** the destructuring key.
- The nested `BindingTarget` is always `[symbol, [[Sym, <name>, nodeId], null]]` for shorthand — same name, same token.
- No source location is carried for the destructuring key itself; the assumption throughout the codebase is that the key and the binding share a single token.

With aliasing, the key and the binding are **different tokens** at different source positions. The AST needs a place to remember where the key token lives.

## Proposed design

### Syntax

```dvala
let { pi: p } = import("./math")
let { pi: p, e: euler } = import("./math")
let { pi: p = 3.14 } = import("./math")       # default value (inherits from shorthand today)
```

Shorthand stays valid: `let { pi } = import("./math")` is sugar for `let { pi: pi } = ...`.

### Parser

`src/parser/bindingTargets/parseObject.ts` (or wherever object binding targets are handled) learns to accept:

```
objectBindingTarget ::= '{' objectEntry (',' objectEntry)* '}'
objectEntry         ::= keyName (':' bindingTarget)? ('=' defaultExpr)?
```

When `: bindingTarget` is absent, default to `[symbol, [[Sym, keyName, keyNodeId], null]]` as today. When present, use the parsed target.

**Blast radius:** binding targets are used for `let`, function params, handler params, match object patterns, for-bindings, and loop-bindings. Proposal: allow the new syntax uniformly in all contexts where object binding targets are already accepted, because the parser shares a single entry point. Document which semantics apply where (rename-propagation is only relevant for import destructuring; elsewhere aliasing is a pure local-naming choice).

### AST change

Change the object binding target payload from:

```ts
[object, [Record<string, BindingTarget>, defaultExpr?]]
```

to:

```ts
[object, [ObjectEntry[], defaultExpr?]]
// where
interface ObjectEntry {
  key: string           // the exported/destructured key name
  keyNodeId: number     // source location of the KEY token (for rename)
  target: BindingTarget // local binding (may be nested)
}
```

Using an array of entries instead of a `Record` keeps key insertion order stable (matters for formatting) and gives each entry its own node id.

### Symbol table

Two additions to `SymbolDef` in `src/languageService/types.ts`:

```ts
interface SymbolDef {
  // ...existing fields...

  /**
   * For destructured bindings, the external key this binding was
   * destructured from. For shorthand, `importedName === name`.
   */
  importedName?: string

  /**
   * Source location of the KEY token (distinct from `location`, which
   * points at the binding token). For shorthand, the two locations
   * coincide; for aliased, they differ.
   */
  keyLocation?: SymbolLocation
}
```

Populated by `SymbolTableBuilder` when walking object binding targets — available from the new `ObjectEntry` shape.

Alternative: push this onto a separate sibling map (`importedNames: Map<SymbolDef, { name, location }>`) to avoid bloating `SymbolDef`. Probably cleaner; landing question for the implementer.

### Rename semantics

Rename splits into three distinct "edit modes" depending on which token the cursor is on:

| Cursor on | What changes |
|---|---|
| `pi` in `let pi = …` (origin) | Origin def + origin's export key + every importer's destructuring **key** (never the importer's local binding, if aliased) + every use-site in the origin file that resolves to that def |
| `p` in `let { pi: p } = import(…)` (aliased local) | Only the local binding + refs that resolve to it. Nothing in the origin file. |
| `pi` in `let { pi: p } = import(…)` (aliased key) | Same as "cursor on `pi` in origin" — rename originates from the key. |
| `pi` in `let { pi } = import(…)` (shorthand) | Ambiguous — one token represents both the key and the local binding. Default to origin-rename (matches today's behavior and the most common intent). If the user wants to rename only the local, they should first alias it. |

This means `findAllOccurrences` needs to grow beyond "return a flat list of locations" — it needs to tag each occurrence so the rename provider can filter:

```ts
interface Occurrence {
  file: string
  line: number
  column: number
  nameLength: number
  role: 'origin-def' | 'origin-export-key' | 'origin-ref'
      | 'import-key' | 'import-binding' | 'import-ref'
}
```

The rename provider then picks which `role`s to edit based on where the cursor sits.

### `resolveCanonicalFile` changes

Today: `resolveCanonicalFile` follows the `importPath` on the cursor's resolvedDef, returning the origin file. That behavior stays for "rename from an import key" and "rename from a use-site".

New: when the cursor is on an aliased **local binding** (`p` in `let { pi: p } = ...`), we must *not* follow back to the origin — the user's intent is a local-only rename. The distinguishing signal: the cursor sits on the binding's name token, which has `keyLocation !== location`. In that case, `resolveCanonicalFile` returns `{ file: currentFile, name: localName }`.

## Migration / back-compat

- Shorthand keeps working exactly as before; behavior for shorthand-only codebases is unchanged.
- Existing serialized ASTs that use the `Record<string, BindingTarget>` shape need migration. The AST is memory-only (not persisted across Dvala runs except via `quote`), so the blast radius is limited to the `ast` module's constructors/predicates and `prettyPrint`. Both live in `src/builtin/modules/ast/` and `src/prettyPrint.ts` and will need matching updates.
- No changes to the bytecode, evaluator frames, or snapshot format — aliasing is a pure parse/resolution concern.

## Scope estimate

Largest single sub-task: **rewriting rename semantics around tagged occurrences**. ~3–4 days when done carefully, with tests. Parser + AST changes are smaller but ripple through the ast module, prettyPrint, and formatter. Total ballpark: ~1 week implementation + review.

## Testing

Layered:

1. **Parser**: add cases for aliased destructuring to the parser tests. Confirm rejection of malformed variants (`{ : p }`, `{ pi: }`).
2. **AST module**: update `ast/prettyPrint` to render aliased entries. Round-trip tests.
3. **Symbol table**: builder emits distinct `keyLocation` for aliased entries.
4. **Workspace index**: rename scenarios — shorthand unchanged, aliased key-rename hits the origin, aliased local-rename stays local.
5. **VS Code integration**: manual smoke test on a workspace that mixes shorthand and aliased imports; confirm rename previews.

## Questions for language-design review

Before implementation starts, decide:

1. **Is aliasing allowed in all binding contexts** (let, function params, handler params, match, for), or only in `let`?  *Recommendation:* uniformly, because it flows from one parser entry point and users will expect it.
2. **Does the aliased form compose with defaults**? `{ pi: p = 3.14 }` — yes, natural extension of existing default syntax.
3. **Do we want a "rest" catch-all**? `let { pi, ...rest } = import(…)`. Out of scope here; flag as possible follow-up.
4. **Do we want to support this in the export object too**? `{ pi: somePi }` is already allowed at export sites (I verified: `Str "pi"` key + `Sym "somePi"` value). That syntax already exists — the missing piece is only the import side.

Answers to (1)–(3) unblock the spec; (4) is already settled.

## Sequencing against other work

- **Can land independently of transitive re-exports**, but the two compound: once aliasing exists, re-exporter detection grows a case ("does B re-export A's `pi` under a different name?") that the transitive-re-exports doc punts on. If both ship, revisit the re-export detection rules.
- **No dependency on** bundle-type-metadata or KMP work.
