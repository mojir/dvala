# Claude Code Skills & Agents for Dvala

**Status:** Draft — iterating on plan
**Created:** 2026-03-27

## Goal

Set up custom skills and agents in `.claude/` to streamline common Dvala development workflows.
Extend the CLI with subcommands that cover MCP server functionality, then thin the MCP server to a wrapper.

---

## Phase 0: CLI Subcommands (replace MCP as primary interface)

Extend `dvala` CLI with subcommands so Claude (and scripts) can use `dvala <cmd>` via Bash instead of MCP tools.

### New CLI subcommands

| Subcommand | Replaces MCP tool | Description |
|---|---|---|
| `dvala doc <name>` | `getDoc` | Show documentation for a function/expression/effect |
| `dvala list` | `listCoreExpressions` | List core functions and special expressions |
| `dvala list <module>` | `listModuleExpressions` | List functions in a module |
| `dvala list --modules` | `listModules` | List all modules |
| `dvala list --datatypes` | `listDatatypes` | List all datatypes |
| `dvala tokenize <code>` | `tokenizeCode` | Tokenize source to JSON |
| `dvala parse <code>` | `parseCode` | Parse source to AST JSON |
| `dvala examples` | `getExamples` | Show example programs |

Existing: `dvala eval <code>` already covers `runCode`.

All subcommands get `--debug` flag for debug variants (replaces the separate `*Debug` MCP tools).

### Architecture

- Extract formatting helpers from `mcp-server/src/server.ts` into a shared module (e.g. `cli/src/cliDocumentation/` or a new `src/tooling/formatting.ts`)
- CLI subcommands call the shared functions directly
- MCP server becomes a thin wrapper: each tool calls the same shared function and wraps the result in MCP response format
- Eventually: consider removing MCP server entirely if not needed

### Slim down CLAUDE.md + `/dvala` skill

CLAUDE.md currently contains a large Dvala Language Reference that's always loaded into context, even when working on TypeScript internals. Move it to an on-demand skill:

- **CLAUDE.md** keeps: project structure, TS conventions, build commands, playground architecture
- **`/dvala` skill** gets: language reference, AST node format, macro system details, code examples
- **Remove from CLAUDE.md**: MCP Tools section (replaced by CLI commands Claude discovers naturally)

The `/dvala` skill is invoked when Claude needs to write, debug, or reason about Dvala code.

### What to remove/update

- Move Dvala Language Reference section from CLAUDE.md to `/dvala` skill
- Move macro system details from CLAUDE.md to `/dvala` skill
- Remove MCP Tools section from CLAUDE.md
- Update CLAUDE.md to mention `dvala` CLI subcommands instead of MCP tools
- Keep MCP server code but simplify it to delegate to shared functions

---

## Phase 1: Skills

### 1. `/check` — Run full pipeline and fix issues
- Runs `npm run check` (lint + typecheck + test + build) and `npm run test:e2e`
- On failure: diagnoses and fixes the issue, then re-runs
- **Why:** Most common post-edit workflow, currently manual

### 2. `/demo` — Generate playground demo link
- Takes a Dvala code snippet (or reads from context)
- Generates a `localhost:9901` playground URL
- Optionally formats it as a commit message demo block
- **Why:** CLAUDE.md requires demo links before committing; automate this

### 3. `/fix-issue` — Fix a GitHub issue
- Argument: issue number
- Fetches issue details via `gh`
- Implements fix with tests
- Runs `npm run check`
- **Why:** Common workflow with several manual steps

### 4. `/design` — Create a design document
- Argument: short name for the design
- Creates `design/active/YYYY-MM-DD_<name>.md` with template
- **Why:** Standardize design doc creation with correct naming convention

### 5. `/report-issue` — Investigate and file a GitHub issue
- Argument: description of the problem
- Investigates: relevant code, recent changes, reproduction steps
- Creates a well-documented GitHub issue via `gh` with structured context
- **Why:** Combines investigation and issue creation into one step

### 6. `/dvala-run` — Run Dvala code snippet
- Argument: Dvala code (or reads from editor selection)
- Uses `dvala eval` CLI to execute and show result
- **Why:** Quick REPL-like feedback without leaving the editor

---

## Phase 2: Agents

### 1. `explorer` — Codebase research agent
- **Model:** haiku (fast, cheap)
- **Tools:** Read, Grep, Glob (read-only)
- **Purpose:** Deep codebase exploration without cluttering main context
- **When to use:** "How does X work?", "Where is Y implemented?"

### 2. `test-fixer` — Diagnose and fix failing tests
- **Model:** sonnet
- **Tools:** Read, Edit, Bash, Grep, Glob
- **Purpose:** Run tests, analyze failures, apply fixes, re-run
- **When to use:** After code changes break tests

### 3. `reviewer` — Code review agent
- **Model:** sonnet
- **Tools:** Read, Grep, Glob, Bash(git diff)
- **Purpose:** Review staged changes for quality, security, Dvala conventions
- **When to use:** Before committing

---

## File Structure

```
.claude/
├── skills/
│   ├── check/SKILL.md
│   ├── demo/SKILL.md
│   ├── fix-issue/SKILL.md
│   ├── design/SKILL.md
│   ├── report-issue/SKILL.md
│   └── dvala-run/SKILL.md
└── agents/
    ├── explorer/agent.md
    ├── test-fixer/agent.md
    └── reviewer/agent.md
```

---

## Open Questions

- Are there other repetitive workflows worth automating?
- Should any skills be personal (`~/.claude/`) rather than project-scoped?
- Should the reviewer agent enforce specific Dvala coding conventions from CLAUDE.md?
- When to fully remove the MCP server? (After CLI subcommands are stable?)

---

## Implementation Order

1. **Phase 0**: CLI subcommands + thin MCP wrapper
2. `/check` — simplest skill, highest value
3. `explorer` agent — useful immediately for research
4. `/demo` — supports commit workflow
5. `reviewer` agent — pre-commit quality
6. `/fix-issue` — more complex, builds on the others
7. `/report-issue` — investigation + issue creation
8. `/design` — simple utility
9. `test-fixer` agent — specialized
10. `/dvala-run` — nice-to-have
