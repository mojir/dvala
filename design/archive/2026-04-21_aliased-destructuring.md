# Aliased Destructuring — Rename-Aware Key Tracking

**Status:** Draft — ready for implementation scoping
**Created:** 2026-04-21
**Related:** `design/archive/2026-04-21_cross-file-rename.md` (shipped PR #70), `design/archive/2026-04-21_transitive-reexports.md` (shipped PR #72)

## Starting point

Dvala **already supports aliased destructuring today** via the `as` keyword:

```dvala
let { pi as p } = import("./math")
let { pi as p, e as euler } = import("./math")
```

See [parseBindingTarget.ts:213-224](../../src/parser/subParsers/parseBindingTarget.ts#L213-L224). The syntax parses, binds, and evaluates correctly. What's missing is **rename awareness**: the symbol table treats an aliased entry as a single token, so there's no way to rename the key and the local independently.

This design covers the rename-semantics work — not a new feature.

## Why not `:` instead of `as`?

Decided: **keep `as`**. `:` collides with existing grammar:

- **Type annotations.** `let { pi: Number }` — is `Number` a local binding name, or a type annotation for key `pi`? Today `:` after a symbol in a binding target introduces a type ([parseBindingTarget.ts:109](../../src/parser/subParsers/parseBindingTarget.ts#L109)). Using `:` for alias too would force nested forms like `{ pi: p: Number }`.
- **Match patterns.** `match x with { name: "Alice" } ->` uses `:` to match a literal. Adding alias-via-colon creates ambiguity (`{ name: n }` — literal or binding?).
- **JS/TS alignment is a weak motivator.** Dvala already diverges from JS in bigger ways (effects, macros, evaluation model). Paying grammar complexity for shallow familiarity isn't worth it.

`as` is unambiguous in every binding-target context, already reserved, and reads left-to-right as English.

## Goal

Give the language service enough information to power three distinct rename modes on aliased imports:

1. Rename **the origin** → propagates the new name to the import key everywhere; aliased locals stay untouched, shorthand locals rename along with the key.
2. Rename **the aliased local** → local-only; nothing changes outside the current file.
3. Rename **the import key** of an aliased binding (cursor on `pi` in `{ pi as p }`) → treated as a rename of the origin.

All three are already conceptually supported; none work today because the parser discards the key's source location.

## Non-goals

- Adding the `:` spelling as an alternative to `as`. See decision above.
- Default values interacting with aliasing. Already works today (`{ pi as p = 3.14 }`) — no change needed.
- Re-alias-through-re-export chains (`let { pi } = import("./A"); { pi as alpha }` exported again). Covered by the transitive-re-exports work once this lands.
- Changing AST evaluation semantics. Aliasing is a parse/resolution concern; evaluator, frames, and snapshot format are untouched.

## Today's representation

From [parseBindingTarget.ts:196-284](../../src/parser/subParsers/parseBindingTarget.ts#L196-L284):

- Object binding target payload is `[Record<string, BindingTarget>, defaultExpr?]`.
- The JS string key in the record **is** the destructured key.
- The nested `BindingTarget` for an aliased entry is `[symbol, [[Sym, localName, nodeId], null]]` — the `Sym` token carries the **local**'s source position, not the key's.
- The key token is read, its name is used as the record key, and its source position is thrown away.

This is why rename on the key token can't do anything — the symbol table has no record that the key token ever existed.

### Bug worth fixing while we're in here

[parseBindingTarget.ts:219](../../src/parser/subParsers/parseBindingTarget.ts#L219) checks `elements[name[1]]` (local name) for duplicates but assigns to `elements[keyName]` (key). So `{ pi as p, e as p }` passes (both keyed by their external names), while `{ pi as p, q as pi }` falsely errors. Fix as part of this work.

## Proposed design

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
  key: string            // the destructured key name
  keyNodeId: number      // source location of the KEY token (new)
  target: BindingTarget  // local binding (may be nested)
}
```

Using an array instead of a `Record` keeps insertion order stable (formatting) and gives each entry its own node id.

### Parser

Minimal change in the object-binding branch of `parseBindingTarget`:
- Before consuming `as`, capture the key symbol's `nodeId`.
- Emit `ObjectEntry` instead of writing into a `Record`.
- Fix the duplicate-name check to key on the external name consistently.

No grammar change. No new tokens. No migration for source code.

### Symbol table

Two additions to `SymbolDef` in `src/languageService/types.ts`:

```ts
interface SymbolDef {
  // ...existing fields...

  /**
   * For destructured bindings, the external key this binding was
   * destructured from. For shorthand, importedName === name.
   */
  importedName?: string

  /**
   * Source location of the KEY token (distinct from `location`, which
   * points at the binding token). For shorthand, the two coincide;
   * for aliased, they differ.
   */
  keyLocation?: SymbolLocation
}
```

Populated by `SymbolTableBuilder` from the new `ObjectEntry` shape.

Alternative: sibling map (`importedNames: Map<SymbolDef, { name, location }>`) to avoid bloating `SymbolDef`. Probably cleaner; landing question for the implementer.

### Rename semantics

Four distinct behaviors depending on which token the cursor sits on:

| Cursor on | What changes |
|---|---|
| Origin def (`pi` in `let pi = …`) | Origin def + origin's export key + every importer's destructuring **key** (never an aliased local) + every use-site in the origin file |
| Aliased local (`p` in `{ pi as p }`) | Only the local binding + refs that resolve to it. Nothing in the origin file. |
| Aliased key (`pi` in `{ pi as p }`) | Same as cursor-on-origin — rename originates from the key. |
| Shorthand (`pi` in `{ pi }`) | Ambiguous: one token represents both key and local. Default to origin-rename (matches today's behavior and the common intent). To rename only the local, user aliases first. |

### Rename propagation rule (new)

**Origin renames never introduce a new `as` alias.** Following TypeScript:

- **Shorthand importers** (`{ pi }`) — key renames, local renames along with it, use sites rename. `{ pi }` becomes `{ PI }`.
- **Aliased importers** (`{ pi as p }`) — only the key renames. Local and use sites are untouched. `{ pi as p }` becomes `{ PI as p }`.
- **No auto-preservation of old local names.** If a user wants to preserve a local name after a rename, they add `as oldName` manually.

Rationale: auto-inserting aliases on rename turns "I fixed the name" into "I wrapped the old name forever," and causes alias cruft to accumulate. Opt-in is cheap (six characters); opt-out across importers would be a bulk edit with no refactor support.

### `findAllOccurrences` grows `role` tags

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

The rename provider picks which `role`s to edit based on cursor position and the rules above. An importer's `import-binding` only participates when (a) cursor is on it (local-only mode) or (b) it's a shorthand whose key is being renamed.

### `resolveCanonicalFile` changes

Today: follows the cursor's resolved def's `importPath` back to the origin file.

New: when the cursor is on an aliased **local binding** (`p` in `{ pi as p }`), do not follow back to the origin — the user's intent is a local rename. Distinguishing signal: the cursor sits on the binding's name token, which has `keyLocation !== location`. In that case, `resolveCanonicalFile` returns `{ file: currentFile, name: localName }`.

### Nested aliased patterns

`let { config as { host as h } } = ...` — the `ObjectEntry { key, keyNodeId, target }` shape covers nested cases mechanically: `config`'s `keyNodeId` tracks the outer key, and the nested `target` is itself an object binding target with its own `ObjectEntry` list. Rename-on-outer-key and rename-on-inner-key are independent and each behave as the four-way table describes.

## Migration / back-compat

- All existing Dvala source continues to parse and evaluate identically — no syntax change.
- Existing in-memory ASTs using `Record<string, BindingTarget>` need migration. The AST is memory-only (not persisted except via `quote`), so the blast radius is:
  - `src/builtin/modules/ast/` — constructors and predicates
  - `src/prettyPrint.ts`
  - `src/evaluator/` — grep for `bindingTargetTypes.object` consumers
  - Formatter (CST path)
  - Any macro that walks binding targets
- No changes to bytecode, evaluator frames, or snapshot format.

## Scope estimate

- Parser + AST shape change: 1 day. Mechanical.
- Symbol table + `keyLocation` + `importedName`: 1 day.
- Rename semantics (tagged occurrences, four-way table, propagation rule): 2–3 days including tests.
- AST-module / prettyPrint / formatter ripple: 1 day.
- Language-service integration and `resolveCanonicalFile` carve-out: 1 day.
- Buffer for the inevitable CST / formatter surprises: 1–2 days.

**Total: ~1 week.**

## Testing

1. **Parser** — the duplicate-check fix, `ObjectEntry` shape round-trip, shorthand still parses unchanged.
2. **AST module** — `prettyPrint` renders aliased entries identically to today's output.
3. **Symbol table** — builder emits distinct `keyLocation` for aliased entries; `importedName` matches the external key.
4. **Rename — shorthand** — renaming origin `pi → PI` updates `{ pi }` to `{ PI }` and all use sites in the importer.
5. **Rename — aliased** — renaming origin `pi → PI` updates `{ pi as p }` to `{ PI as p }`; local `p` and its use sites untouched.
6. **Rename — aliased local** — cursor on `p` in `{ pi as p }` renames only `p` and its use sites.
7. **Rename — aliased key** — cursor on `pi` in `{ pi as p }` behaves as origin rename.
8. **No-alias-insertion invariant** — a test that asserts rename never introduces a new `as` keyword anywhere. Protects the propagation rule.
9. **VS Code integration** — manual smoke test mixing shorthand and aliased imports; confirm rename preview.

## Open questions

1. **Should an aliased local ever trigger a cross-file rename hint?** For example, cursor on `p` in `{ pi as p }` — VS Code could *offer* "rename origin `pi` instead?" as a refactor option. Out of scope here; flag for future LS polish.
2. **Rest catch-all interaction** (`{ pi, ...rest }`) — today rest can't have an alias ([parseBindingTarget.ts:215](../../src/parser/subParsers/parseBindingTarget.ts#L215)). Leave as-is.

## Sequencing against other work

- **Independent of transitive re-exports** (already shipped in PR #72), but the two compound: an aliased re-export (`export { pi as alpha }`) adds a `reexport-key` role to `Occurrence`, bridging origin and downstream importers. Plumb this carefully — may want a small follow-up PR.
- **No dependency on** bundle-type-metadata or KMP work.
