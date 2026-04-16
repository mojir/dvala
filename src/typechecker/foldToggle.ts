/**
 * Typechecker fold toggle. Gates whether `inferExpr` invokes the fold
 * sandbox for pure `Call` nodes. See design docs:
 *  - design/active/2026-04-16_constant-folding-in-types.md
 *  - design/active/2026-04-16_fold-toggle-and-differential-tests.md
 *
 * Default: `false`. Flipping the default is a deliberate, dedicated commit
 * that happens after Phase C's tests are green under both settings.
 *
 * Runtime semantics: the toggle only affects the typechecker. It must not
 * change evaluator behavior. Any runtime observable difference between
 * enabled/disabled indicates a bug.
 */

/**
 * Whether folding is enabled for this typecheck process. Read once at
 * module load — fold is on the hot path, so per-call env lookups would be
 * wasteful. Tests that need to flip the flag can use vitest's `vi.stubEnv`
 * before importing the typechecker, or prefer the typecheck-option path
 * (coming in Phase C) for per-call control.
 */
export const FOLD_ENABLED: boolean = process.env.DVALA_FOLD === '1'
