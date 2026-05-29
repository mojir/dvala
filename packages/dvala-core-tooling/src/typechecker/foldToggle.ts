/**
 * Typechecker fold toggle. Gates whether `inferExpr` invokes the fold
 * sandbox for pure `Call` nodes. See design docs:
 *  - design/archive/2026-04-16_constant-folding-in-types.md
 *  - design/archive/2026-04-16_fold-toggle-and-differential-tests.md
 *
 * Default: **on**. Set `DVALA_FOLD=0` to opt out. Per-call override is
 * available via `TypecheckOptions.fold`.
 *
 * Runtime semantics: the toggle only affects the typechecker. It must not
 * change evaluator behavior. Any runtime observable difference between
 * enabled/disabled indicates a bug.
 */

/**
 * Whether folding is enabled for this typecheck process. Read once at
 * module load — fold is on the hot path, so per-call env lookups would be
 * wasteful. Tests that need to flip the flag can use vitest's `vi.stubEnv`
 * before importing the typechecker, or use the `fold` option on
 * `TypecheckOptions` for per-call control.
 */
export const FOLD_ENABLED: boolean = typeof process === 'undefined' || !process.env || process.env.DVALA_FOLD !== '0'
