## Git Workflow

- **NEVER commit directly to `main`.** Always work on a feature branch.
- Before starting work, check the current branch. If on `main`, create and switch to a new branch.
- When work is complete, ask the user if they want to create a pull request to `main`.

## Key Commands

- `npm run check` — full pipeline: lint + typecheck + test + build
- `npm run test` — run tests only
- `npm run build` — build all bundles
- `npm run benchmark:refinement` — run the refinement-types perf bench; appends a row to `benchmarks/refinement-performance.md`
- `npm run show:benchmarks` — render the perf history as an interactive HTML chart and open it in the browser

Run `npm run check` after any medium or larger code change.

When piping CLI output through `tail`/`cat`/`grep`, prepend `NO_COLOR=1` so ANSI escape codes don't pollute the captured output (applies to `vitest`, `eslint`, etc.).

## Performance tracking

**Refinement-types changes (anything under `src/typechecker/refinement*` or `src/typechecker/parseType.ts`'s refinement-handling code) MUST run the perf benchmark before the PR merges.**

- Run `npm run benchmark:refinement` on the PR branch's tip (after the last code change).
- Commit the resulting changes to `benchmarks/refinement-history.json` and `benchmarks/refinement-performance.md` to the PR branch.
- Push so the perf data is part of the PR's history.

If a refinement-types PR was merged without perf data: open a follow-up PR that runs the benchmark on `main` (so the row's commit hash is the merge commit) and ships the resulting `.md` / `.json` updates. Don't backfill onto the merged commit retroactively — keep the perf history honest about when the data was captured.

Why: the rendered `.md` table is the at-a-glance regression signal during PR review. Skipping it means a future regression goes unnoticed until someone manually re-runs the bench.

## Project Structure

- Entry: `src/index.ts` (minimal), `src/full.ts` (full with all modules)
- Built-ins: `src/builtin/core/` (normal expressions), `src/builtin/specialExpressions/`
- Modules: `src/builtin/modules/<name>/`
- Shared: `src/prettyPrint.ts` (smart AST formatter, used by Dvala + playground)
- Reference data: `reference/index.ts` (derived from co-located docs)
- Tests: `__tests__/` (integration), `src/**/*.test.ts` (unit), `e2e/` (playwright)
- Playground: `playground-www/src/` — see Playground Architecture below

## TS Coding Conventions

- Do not shadow variables
- Imports must be sorted alphabetically
- `it()` descriptions must begin with lowercase
- No side-effect imports for module registration
- Every built-in function needs a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`
- Always add descriptive comments in code — explain the *why*, not just the *what*

## Demo Convention

For user-facing features, include **demo blocks** in the commit message. These serve as an interactive changelog — `npm run demo [ref]` extracts them and generates playground URLs.

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
npm run demo          # from HEAD
npm run demo HEAD~3   # from specific ref
npm run demo abc123   # from hash
```

### Before committing

Always show the user a playground demo link before committing. Generate it with:

```bash
node -e "const code = 'let x = 42; x + 1'; console.log('http://localhost:22230/?state=' + btoa(encodeURIComponent(JSON.stringify({'dvala-code': code}))))"
```

The playground runs on `http://localhost:22230/` (start with `npm run dev`).

## Creating design documents and plans
I encurage you to structurize bigger tasks by creating .md plans.
Create .md files inside /design

Prefix all design document filenames with the creation date in ISO format: `YYYY-MM-DD_<name>.md` (e.g. `2026-01-02_my-design.md`).

## Skills & Agents

Use the project skills and agents proactively — don't do manually what a skill already handles.

### When to use skills

- **`/dvala`** — Load this before writing, debugging, or reasoning about Dvala language code. Always load when you need syntax reference, AST node format, or macro details.
- **`/check`** — After any code change, use this instead of running `npm run check` manually. It also runs e2e tests and fixes failures.
- **`/demo`** — Before committing user-facing features. Generates playground links and formats demo blocks for commit messages.
- **`/design`** — When the user asks to create a design document or plan.
- **`/fix-issue`** — When the user asks to fix a GitHub issue by number.
- **`/report-issue`** — When the user reports a bug or asks to file an issue.
- **`/dvala-run`** — When the user wants to quickly run a Dvala snippet.

### When to use agents

- **`explorer`** — For deep codebase research ("how does X work?", "where is Y implemented?"). Use this instead of doing many sequential searches yourself — it runs in isolated context with haiku for speed.
- **`test-fixer`** — When tests are failing after code changes. Delegate diagnosis and repair to this agent.
- **`reviewer`** — Before committing. Ask it to review staged changes for quality and convention adherence.

## Dvala Language Reference

For Dvala language syntax, semantics, macros, and AST format, use the `/dvala` skill (loaded on demand).

Use `dvala` CLI subcommands to look up documentation and run code:
- `dvala run '<code>'` — execute Dvala code (also accepts `-f <file>` or no args for project entry)
- `dvala doc <name>` — documentation for a function/expression
- `dvala list [module] [--modules] [--datatypes]` — list functions
- `dvala tokenize '<code>' [--debug]` / `dvala parse '<code>' [--debug]` — inspect internals (also accept `-f <file>`)
- `dvala examples` — example programs

Before suggesting Dvala code to the user, verify it works by running it with `dvala run`.

## Playground Architecture

- `playground-www/src/renderCodeBlock.ts` — unified code block renderer (syntax highlighting, execution, "Use in playground" + copy buttons)
- `playground-www/src/renderDvalaMarkdown.ts` — shared markdown renderer using `renderCodeBlock` for fenced dvala blocks
- `playground-www/src/featureCards/*.md` — feature card content (rendered in modals from start page)
- `playground-www/src/components/startPage.ts` — start page with feature cards (about page merged in)
- `playground-www/src/components/chapterPage.ts` — chapter pages with sticky header (title, prev/next, TOC dropdown)

### Modal system (`createModalPanel` in `scripts.ts`)

```typescript
createModalPanel({
  title?, icon?, size?: 'small' | 'medium' | 'large',
  markdown?, hamburgerItems?, footerActions?, noClose?, onClose?
})
```

Sizes: small=480px, medium=800px, large=1200px. If `markdown` is provided, body is auto-rendered. If `footerActions` provided, footer buttons are auto-created. Snapshot panel uses `createModalPanel({ size: 'large' })`.

