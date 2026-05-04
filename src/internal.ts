/**
 * Tooling-only introspection entry point. NOT part of the stable public API
 * — breaking changes are allowed without notice.
 *
 * What lives here: engine internals that tooling consumers (the playground,
 * the LS Web Worker, future LSP servers) need to read but end users of the
 * `dvala` package should never depend on. AST node types, walkers, type-
 * system internals, snapshot/replay machinery, evaluator hooks, the
 * typechecker — all fair game.
 *
 * **Worker safety rule:** nothing exported from this module may transitively
 * import DOM APIs, `window`, `document`, or any browser-only module. The LS
 * worker imports from here; a DOM dependency breaks the worker bundle.
 *
 * See `design/active/2026-04-26_playground-monaco-tree-ls-cli.md` for the
 * two-surface API discipline.
 */

// ── Typechecker ──────────────────────────────────────────────────────────
// Needed by the LS worker (diagnostics, hover) and the playground
// (typecheck-and-report).
export { typecheck, typecheckExpr } from './typechecker/typecheck'
export type { TypeDiagnostic, TypecheckResult } from './typechecker/typecheck'
