# Monorepo Package Boundary Strategy

Three-phase plan for evolving the 5 internal packages + playground-www app toward proper independence.

**Why:** Deep relative imports like `../../../../../../src/builtin/interface` are a symptom of packages that aren't truly independent. The endgame is separately publishable packages with clean import boundaries.

---

## Phase 1 — Correct logical boundaries (DONE, PR #190, reviewed + pushed 2026-05-26)

Route all cross-package `../../../src/` deep imports through the correct boundary:
- Tooling utilities (parser, typechecker, LS, completions, etc.) → `dvala-core-tooling/src`
- Public API types (DvalaModule, Arity, Any, UnknownRecord, fromJS/toJS, etc.) → `src/index.ts`
- Evaluator internals needed by adapters → `src/internal.ts`
- Bundler facade → `src/bundler.ts`
- Reference data initializer → `src/initReferenceData` (direct, intentionally NOT in `src/index.ts`)

**Why `initReferenceData` is not in `src/index.ts`:** Exporting it there would statically pull the entire reference data tree (~1 MB of docs) into the minimal bundle. `src/index.ts` is the minimal bundle entry; callers import `src/initReferenceData` directly. `src/full.ts` calls it automatically.

Intentional exceptions (CLI-specific, not routing through packages):
- `src/testFramework` — test runner, CLI-only
- `src/config` — dvala.json config parsing, CLI-only

**How to apply:** Any new cross-package import of `../../../src/deep/path` should be routed through one of the facades above.

---

## Phase 1.5 — Workspace wiring (DONE, PR #191)

Add proper `package.json` wiring so the dependency graph is explicit in tooling:
- Add `"name": "@mojir/dvala-core-tooling"` etc. to each package's `package.json`
- Add `"exports"` fields pointing to source (or dist)
- Add `"@mojir/dvala-core-tooling": "workspace:*"` to consuming packages' `package.json`
- `tsconfig` project references: `composite: true` added to `dvala-runtime` (self-contained); other packages blocked until Phase 2 removes back-references to root `src/`

This makes imports by package name (e.g. `import { WorkspaceIndex } from '@mojir/dvala-core-tooling'`) work natively via pnpm workspace symlinks, eliminating the relative path strings.

**Note:** `@mojir/dvala-runtime` is already published on npm and uses this pattern. Other packages should follow.

---

## Phase 2 — Structural independence (DONE, PR #192)

Replace all remaining `../../../src/` relative imports in subpackages with proper package-name imports:

- `@mojir/dvala/tooling` — added as a new subpath export from the root package (rolldown bundle + tsconfig paths + vite alias)
- `dvala-core-tooling/src/index.ts` reduced to a single `export * from '@mojir/dvala/tooling'`
- `dvala-cli` source files now import from `@mojir/dvala`, `@mojir/dvala/bundler`, `@mojir/dvala-core-tooling`
- `dvala-mcp-server` now imports from `@mojir/dvala`, `@mojir/dvala-core-tooling`
- Intentional exceptions remain: `src/initReferenceData`, `src/testFramework`, `src/config` (CLI-specific, not in public surface)

**Result:** No subpackage imports from `../../../src/` except intentional exceptions. All workspace deps declared explicitly in each package's `package.json`.

Note: Each package still compiles as part of the root TypeScript project (not independently via `composite: true`). Full project-reference independence (separate `dist/` per package, publishable standalone) is future work.
