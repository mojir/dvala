---
name: review
description: Review code changes for quality, correctness, and adherence to project conventions. With a PR number, reviews that PR via gh. Without args, reviews uncommitted local changes. Use before committing or when asked to review a PR.
argument-hint: "[pr-number]"
---

Review code changes against Dvala project conventions.

## Routing

Pick the mode in this order:

1. If `$ARGUMENTS` is a number (e.g. `123` or `#123`) or a PR URL → **PR mode** on that number.
2. Otherwise, scan recent conversation context for an obvious active PR — e.g. you just ran `gh pr create` / `gh pr view`, the user just merged or opened a PR, or a PR number/URL was discussed in the last few turns. If exactly one PR is clearly in focus → **PR mode** on that PR.
3. Otherwise, run `gh pr view --json number,headRefName,state` to check whether the current branch has an open PR. If it does → **PR mode** on that PR (mention which PR you picked so the user can redirect).
4. Otherwise → **Local mode** (review uncommitted changes).

If multiple PRs are plausibly in focus, ask the user which one rather than guessing.

## Local mode (no args)

1. Run `git status` and `git diff` (staged + unstaged) to see what changed. `git diff` alone misses untracked files (the wholly-new-file case), so always cross-check `git status` for new files and read them with `Read`.
2. If there are no changes at all — no diff AND no untracked files — say so and stop.
3. Review each change against the checklist below
4. Report findings grouped by priority

## PR mode (PR number arg)

1. `gh pr view <number> --json number,title,body,state,baseRefName,headRefName,statusCheckRollup,labels,author,url`
2. `gh pr diff <number>`
3. `gh pr view <number> --json comments` (skim for prior feedback so you don't duplicate it)
4. Review the diff against the checklist below
5. Report findings grouped by priority
6. Do NOT post the review to GitHub unless the user explicitly asks

Never use `mcp__gitkraken_*` tools — `gh` only (per CLAUDE.md).

## Review checklist

- **Correctness** — does the logic actually do what it's supposed to? Watch for off-by-one, missed branches, swallowed errors.
- **Conventions** (per CLAUDE.md):
  - No variable shadowing
  - `it()` descriptions start lowercase
  - No side-effect imports for module registration
  - Every built-in function has a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`
  - Comments explain the *why*, not the *what* — and most code shouldn't have comments at all
  - TypeScript (`.ts`) formatted with `oxfmt`, not prettier
- **Two-surface API discipline** — playground/worker imports go through `src/index.ts`, `src/full.ts`, or `src/internal.ts`. Flag deep imports without a `// FIXME: deep import` comment.
- **Tests** — new features/fixes have test coverage. Aim for ~100% on new `src/` code; boy-scout principle on neighboring code.
- **Dvala code in the diff** — verify it runs with `dvala run '<code>'` before signing off.
- **Security** — no command injection, no leaked secrets, safe shell quoting.
- **Performance gate** — if any `src/` file changed, remind the user the pre-push bench hook will fire (or that they need to run `pnpm run benchmarks:run`).
- **Demo blocks** — user-facing features should include a ` ```demo ` block in the commit message (see `/demo`).
- **Scope creep** — flag refactors, abstractions, or error-handling that aren't required for the task.

## Output format

Group findings by priority. Be specific — reference `file:line` so the user can jump straight there.

- **Must fix** — bugs, convention violations, missing tests, security issues
- **Should fix** — unclear naming, missing rationale comments, scope creep
- **Suggestion** — optional improvements

If everything looks good, say so clearly and stop. Don't pad with nits.

## After the review

Do NOT start fixing items unprompted. Once findings are reported:

1. **Ask explicitly which items to fix.** List each finding with a short identifier (e.g. its priority + a one-line noun) so the user can answer with a terse list. Different items have different stakes — the user may want to defer some, reject others, or batch them differently than the order they were reported in. Don't infer from priority alone: a Must-fix may be deferred to a separate PR, and a Suggestion may be rejected outright. Wait for an explicit go-ahead.
2. **For any bug or regression you fix, add a regression test.** Don't lean on "the existing tests would have caught it" — if they had, the bug wouldn't exist. A small extracted helper + a unit test is preferable to a sprawling integration test. If the test would require infrastructure the project hasn't built yet (e.g. mocks for the editor layer), flag the gap explicitly and propose a path — don't silently merge the fix unguarded.
3. **Convention/nit-only fixes don't need tests**, but say so out loud — "no test for this since it's a comment-only change" — so the user can correct you if they disagree.
