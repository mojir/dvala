---
name: Dvala language overhaul — current status
description: Tracks the major language changes across multiple sessions. Current focus: JS-style identifier rename.
type: project
---

## Completed in this session

### Effect system (Phase 1-4) — COMPLETE
- Single-payload perform, handle...with syntax, @dvala.error routing
- Removed do...with, TryWithFrame, CondFrame
- Handler shorthand: @effect(param) -> body (0-3 params)
- Effect pipe: ||>
- Handler param order: (arg, eff, nxt)

### Syntax simplification — COMPLETE
- Removed ternary ?: operator
- Removed unless (use if not(...))
- Removed cond (use if/else if/else/end)
- Removed defined? (undefined vars always error)
- Removed identical? (use == for structural equality)
- Removed doseq (use for)
- Removed $1 (use $ for first arg)
- else if chains need only one end
- Unreserved each and function keywords

### Core builtin reduction — COMPLETE
- sum/prod/mean/median → vector module
- mapcat → sequence module
- movingFn/runningFn → vector module
- epoch->iso-date/iso-date->epoch → time module (new)
- jsonParse/jsonStringify → json module (new)

### Effect cleanup — COMPLETE
- Removed dvala.io.println (use dvala.io.print)
- Renamed dvala.io.read-line → dvala.io.read
- Parse-time validation of @dvala.* effect names
- Removed time-travel debugger (debug.ts, DebugStepFrame)

### Documentation — COMPLETE
- Comprehensive effects tutorial rewrite
- Null-safe property access documented
- All tutorials/README/examples updated

## In Progress: JS-Style Identifiers

**Branch:** `js-style-identifiers`
**Plan:** `design/active/js-style-identifiers.md`

### What needs to happen:
1. Rename ~44 core functions (kebab-case/? → camelCase/is-prefix)
2. Rename ~170 module functions
3. Rename 1 effect name (dvala.io.read-stdin → dvala.io.readStdin)
4. Change tokenizer (disallow -, ?, ! in identifiers)
5. Add unary minus to parser
6. Migrate ALL Dvala code (~400 files)

### Key rename patterns:
- `xxx?` → `isXxx` (predicates)
- `kebab-case` → `camelCase`
- Effect segments: `read-stdin` → `readStdin`

**How to apply:** Start fresh session on branch `js-style-identifiers`. Follow the plan in `design/active/js-style-identifiers.md`.
