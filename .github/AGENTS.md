## Git Workflow

- **NEVER commit directly to `main`.** Always work on a feature branch.
- Before starting work, check the current branch. If on `main`, create and switch to a new branch.
- When work is complete, ask the user if they want to create a pull request to `main`.

### Tool discipline

- **Git operations:** Use the `git` CLI directly (`git add`, `git commit`, `git push`, `git branch`, `git checkout`, `git merge`, `git pull`, `git diff`, `git log`). Do NOT use the `mcp__gitkraken_*` tools — they add indirection without benefit.
- **GitHub operations:** Use the `gh` CLI for issues, pull requests, and repo operations. Do NOT use `mcp__gitkraken_*` tools — they add indirection without benefit.

**PR review workflow (ALWAYS use these commands, NEVER the Kraken tools):**

```bash
# Get PR details (title, body, branch, status, CI checks)
gh pr view <number> --json number,title,body,state,baseRefName,headRefName,statusCheckRollup,labels,author,url

# Get the full diff
gh pr diff <number>

# Get review comments on the PR
gh pr view <number> --comments --json comments

# Get the list of changed files
gh pr view <number> --json files

# Check out the PR branch locally (if you need to run / build / test)
gh pr checkout <number>
```

When the user asks to review a PR, your first action must be `gh pr view <number>` and `gh pr diff <number>`. Never touch `mcp_gitkraken_pull_request_*`.

## Key Commands

- `pnpm run check` — full pipeline: lint + typecheck + test + build
- `pnpm run test` — run tests only
- `pnpm run build` — build all bundles
- `pnpm run benchmarks:run` — run the Dvala pipeline perf bench (tokenize → parse → typecheck → run + refinement-typechecker scenarios); appends a row to `benchmarks/pipeline-performance.md`

Run `pnpm run check` after any medium or larger code change. Use the `/check` skill instead of running `pnpm run check` manually — it also runs e2e tests and auto-fixes failures.

When piping CLI output through `tail`/`cat`/`grep`, prepend `NO_COLOR=1` so ANSI escape codes don't pollute the captured output (applies to `vitest`, `oxlint`, etc.).

### Tooling stack

| Tool | Used for | Command |
|------|----------|---------|
| `oxfmt` | Code formatting (NOT prettier) | `npx oxfmt --write <file>` or `pnpm run lint` |
| `oxlint` | Linting | `pnpm run lint` (auto-fix) or `pnpm run lint:no-fix` (check-only, CI) |
| `tsgo` | Type checking | `pnpm run typecheck` |
| `wireit` | Build orchestration + caching | Runs via `pnpm run build` |
| `rolldown` | Production bundling | Runs via `pnpm run build` |
| `knip` | Dead code / unused export detection | `pnpm run knip` |

**When editing TypeScript, always format with `oxfmt`**, not prettier — they use different defaults. Prettier will change quotes and formatting in ways `oxfmt` rejects. If you forget, `pnpm run lint` auto-fixes it.

## Performance tracking

**Source-code changes (anything under `src/`) MUST run the pipeline perf benchmark before the PR merges.**

The `.githooks/pre-push` hook automates this: when you push a commit that touched any `src/` file and HEAD's hash isn't yet in `benchmarks/pipeline-history.json`, it runs the bench, aborts the push, and asks you to commit the bench data and re-push. Install once per clone with `pnpm run install-hooks` (sets `core.hooksPath=.githooks`). Disable with `pnpm run uninstall-hooks`.

**Multi-commit gotcha:** the bench tags rows with HEAD's hash. If you stack docs/test/config commits on top of a src/ change before pushing, HEAD won't be the src/-touching commit and the hook will refuse to push (with a clear "rebase or --no-verify" error). Easiest path: push the src/-touching commit on its own first — let the hook bench it — then stack follow-ups. Don't try to run `pnpm run benchmarks:run` proactively from a HEAD that's already past the src/ change; the row gets tagged with the wrong SHA.

**Escape hatch:** for trivially non-perf-relevant `src/` changes (comment typo, dead-code removal, error-message wording), bypass the gate with `git push --no-verify`. The hook is intentionally conservative — broader-than-necessary so we don't miss a regression. Use `--no-verify` thoughtfully; if in doubt, run the bench.

Manual flow if you skip the hook:
- Run `pnpm run benchmarks:run` on the PR branch's tip (after the last code change).
- Commit the resulting changes to `benchmarks/pipeline-history.json` and `benchmarks/pipeline-performance.md` to the PR branch.
- Push so the perf data is part of the PR's history.

If a source-touching PR was merged without perf data: open a follow-up PR that runs the benchmark on `main` (so the row's commit hash is the merge commit) and ships the resulting `.md` / `.json` updates. Don't backfill onto the merged commit retroactively — keep the perf history honest about when the data was captured.

Why: the rendered `.md` table is the at-a-glance regression signal during PR review. Skipping it means a future regression goes unnoticed until someone manually re-runs the bench.

## Project Structure

- Entry: `src/index.ts` (minimal), `src/full.ts` (full with all modules)
- Built-ins: `src/builtin/core/` (normal expressions), `src/builtin/specialExpressions/`
- Modules: `src/builtin/modules/<name>/`
- Shared: `src/prettyPrint.ts` (smart AST formatter, used by Dvala + playground)
- Reference data: `packages/dvala-core-tooling/src/reference/` (derived from co-located docs; exposed via the `@mojir/dvala-core-tooling/reference[/api|/book|/datatype|/examples|/format]` subpath exports — it lives in core-tooling because reference and the tooling are mutually dependent)
- Shared helpers: `packages/dvala-common/` (`@mojir/dvala-common/{utils,appRoutes,referenceData,buildReferenceData}`) — used by the CLI, MCP server, and playground apps
- Tests: `__tests__/` (integration), `src/**/*.test.ts` (unit), `e2e/` (playwright)
- Playground: `playground-www/src/` — see Playground Architecture below

## Workspace Layout

The repo is a **pnpm workspace** ([pnpm-workspace.yaml](pnpm-workspace.yaml)). Members:

- **`.` (root)** — the `@mojir/dvala` package (engine, CLI, MCP server, playground builder, playground-www).
- **`vscode-dvala/`** — the VS Code extension (separate publish surface; built into a `.vsix` via `turbo run build --filter=dvala`, which runs `node ./build.mjs` inside the extension package).

Single root `pnpm-lock.yaml` covers both members. `pnpm install` at the root installs everything; never run install inside `vscode-dvala/` directly.

**Versioning:** the release workflow ([release.yml](.github/workflows/release.yml)) bumps the root version, syncs it to `vscode-dvala/package.json`, and runs `pnpm install --lockfile-only` to refresh the lockfile's `importers.vscode-dvala` entry. Don't manually edit version fields.

## Build conventions

Workspace packages build through Turborepo (`turbo run build`), but the per-package build script is **not uniform** — there are two shapes:

- **Library packages** (`dvala-types`, `dvala-runtime`, `dvala-engine`, `dvala-core-tooling`, `dvala-common`, `dvala-test-framework`, `dvala-workspace-backend`, `dvala-mcp-server`) use `rolldown -c ./rolldown.config.mjs && tsgo -p ./tsconfig.json --emitDeclarationOnly`. Rolldown bundles each package's `dist/index.js`; tsgo emits the `.d.ts` files alongside. Cross-package consumers resolve through `node_modules` → bundled `dist/`.

- **Final-binary tail nodes** (`dvala-cli`, `dvala-playground-www`) use plain `tsgo -p ./tsconfig.json`. No per-package rolldown step. These packages are bundled by **root-level** rolldown configs (`rolldown.config.cli.mjs`, `rolldown.config.playground-www.mjs`) *after* their package subgraph finishes building. The plain-tsgo step exists so downstream packages can still import from them during typecheck; the actual binary/bundle is produced at the root layer.

If you're adding a new package, default to the library shape. Only use plain tsgo if the package is a leaf consumer that's never imported by another workspace package — at which point the root-level bundler is the right place to produce its final artifact. Both `dvala-cli/package.json` and `apps/playground-www/package.json` carry a `"//"` field pointing back to this section.

## TS Coding Conventions

- Do not shadow variables
- `it()` descriptions must begin with lowercase
- No side-effect imports for module registration
- Every built-in function needs a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`
- Always add descriptive comments in code — explain the *why*, not just the *what*
- **Formatting is handled by `oxfmt`, not prettier.** Always run `pnpm run lint` (or `npx oxfmt --write <file>`) after editing TypeScript — prettier uses different defaults and will break CI.

## Demo Convention

For user-facing features, include **demo blocks** in the commit message. These serve as an interactive changelog — `pnpm run demo [ref]` extracts them and generates playground URLs.

### Commit message format

Use a `---` separator after the description, then markdown with ` ```demo ` fenced blocks.
If the demo code contains triple backticks (e.g. code templates), use 4+ backtick fences (`````demo ... `````):

````
feat: implement feature X

Description of the change.

---

```demo
description: short description of what the demo shows
code:
let x = 42;
x + 1
```
````

Multiple demos per commit are fine. For demos needing context (bindings):

````
```demo
description: macro with custom handler
context:
let h = handler @my.eff(x) -> resume(x * 2) end
code:
do with h; perform(@my.eff, 10) end
```
````

### Generating playground links

```bash
pnpm run demo          # from HEAD
pnpm run demo HEAD~3   # from specific ref
pnpm run demo abc123   # from hash
```

### Before committing

Always show the user a playground demo link before committing. Use the `/demo` skill to generate it.

The playground runs on `http://localhost:22230/` (start with `pnpm run dev`).

## Creating design documents and plans

Structure bigger tasks by creating `.md` plans inside `/design`.

Prefix all design document filenames with the creation date in ISO format: `YYYY-MM-DD_<name>.md` (e.g. `2026-01-02_my-design.md`). Use the `/design` skill when asked to create a design document or plan.

## Dvala Language Reference

For Dvala language syntax, semantics, macros, and AST format, use the `/dvala` skill (loaded on demand).

Use `dvala` CLI subcommands to look up documentation and run code:
- `dvala run '<code>'` — execute Dvala code (also accepts `-f <file>` or no args for project entry)
- `dvala doc <name>` — documentation for a function/expression
- `dvala list [module] [--modules] [--datatypes]` — list functions
- `dvala tokenize '<code>' [--debug]` / `dvala parse '<code>' [--debug]` — inspect internals (also accept `-f <file>`)
- `dvala examples` — example programs

Before suggesting Dvala code to the user, verify it works by running it with `dvala run`. Use the `/dvala-run` skill for quick REPL-like evaluation.

## Playground Architecture

Detailed playground conventions — naming, file layout, per-concern modules, reactive primitives, modal system — live in [`.github/instructions/playground.instructions.md`](.github/instructions/playground.instructions.md). Copilot auto-loads it when editing `playground-www/**` files.

### Two-surface API discipline

The engine exposes two consumer surfaces:

- **Public API** (`src/index.ts` / `src/full.ts`): for end users running Dvala. Stable shape, small and curated.
- **Introspection API** (`src/internal.ts`): for tooling (playground, LS worker, future LSP servers). **Expected to be large** — AST types, walkers, type-system internals, snapshot machinery. Breaking changes allowed (consumers are us). All exports must be DOM-free (the LS worker imports from here).

When the playground or worker needs an engine symbol not in the public API:
1. First choice: add it to the public API.
2. Second choice: add it to `src/internal.ts` (tooling-only).
3. Last resort: deep import with a `// FIXME: deep import` comment (track as debt).

**Do not** deep-import past `src/index.ts` / `src/full.ts` / `src/internal.ts` from `playground-www/` or worker bundles without a FIXME comment.

## Skills & Agents

Use the project skills and agents proactively — don't do manually what a skill already handles.

### When to use skills

- **`/dvala`** — Load before writing, debugging, or reasoning about Dvala language code. Always load when you need syntax reference, AST node format, or macro details.
- **`/check`** — After any code change, use this instead of running `pnpm run check` manually. It also runs e2e tests and fixes failures.
- **`/demo`** — Before committing user-facing features. Generates playground links and formats demo blocks for commit messages.
- **`/design`** — When the user asks to create a design document or plan.
- **`/fix-issue`** — When the user asks to fix a GitHub issue by number.
- **`/report-issue`** — When the user reports a bug or asks to file an issue.
- **`/dvala-run`** — When the user wants to quickly run a Dvala snippet.
- **`/interview`** — When the user has a list of questions or decisions to work through. Walks them one at a time, with options + a recommendation + confidence (low/medium/high) for each.

### When to use agents

- **`explorer`** — For deep codebase research ("how does X work?", "where is Y implemented?"). Use instead of doing many sequential searches yourself.
- **`test-fixer`** — When tests are failing after code changes. Delegate diagnosis and repair to this agent.
- **`reviewer`** — Before committing. Ask it to review staged changes for quality and convention adherence.

## Code Coverage

When coding under `src/`, aim for 100% (or near 100%) code coverage for new code. Apply the boy scout principle — improve coverage on neighboring code when possible.
