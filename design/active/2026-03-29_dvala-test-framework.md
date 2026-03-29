# Dvala Test Framework

**Status:** Draft
**Created:** 2026-03-29

## Goal

Replace the comment-annotation-based test framework (`// @test`) with a Dvala-native test framework using `test` and `describe` as first-class constructs. Primary use case: testing core builtins and module functions.

---

## Background

The current test framework (`src/testFramework/index.ts`) uses comment annotations to define tests:

```dvala
// @test my test name
assertEqual(1 + 1, 2);
```

This feels bolted-on — tests aren't real Dvala expressions, can't be composed, and the runner relies on string splitting rather than the evaluator. The assertion module is solid and should be preserved; it's the test structure and runner that need redesign.

### What we keep
- The assertion module (`src/builtin/modules/assertion/`) — comprehensive and well-tested
- TAP output format (CI-friendly)
- `.test.dvala` file convention
- `dvala test` CLI command

### What we replace
- Comment-based test annotations (`// @test`, `// @skip-test`, `// @include`)
- The string-splitting test parser in `src/testFramework/index.ts`

## Proposal

### Test API

Tests are pure Dvala code using two functions: `test` and `describe`.

```dvala
let { test, describe } = import(test);
let { assertEqual } = import(assertion);

test("abs of negative", fn()
  assertEqual(abs(-5), 5);
end);

test("max returns largest", fn()
  assertEqual(max(1, 3, 2), 3);
end);
```

Grouping with `describe`:

```dvala
let { test, describe } = import(test);
let { assertEqual, assertTrue } = import(assertion);

describe("string functions", fn()
  test("upper-case", fn()
    assertEqual(upper-case("hello"), "HELLO");
  end);

  test("trim", fn()
    assertEqual(trim("  hi  "), "hi");
  end);
end);
```

Nesting is allowed:

```dvala
let { test, describe } = import(test);
let { assertEqual } = import(assertion);

describe("math", fn()
  describe("abs", fn()
    test("negative", fn() assertEqual(abs(-3), 3) end);
    test("positive", fn() assertEqual(abs(3), 3) end);
  end);
end);
```

### Where `test` and `describe` live

**Option A: Built into the test runner context**
The runner injects `test` and `describe` as bindings before evaluating `.test.dvala` files. They are not importable — they only exist in test context.

**Option B: A `test` module**
```dvala
let { test, describe } = import(test);
```
Regular module, usable anywhere. The runner collects registered tests after evaluation.

**Option C: Special expressions**
`test` and `describe` become language-level special expressions (like `if`, `let`). Enables nicer syntax but heavier to implement.

**Decision:** Option B — a `test` module. Injection doesn't scale: as the framework grows (`skip`, `only`, `todo`, hooks...) it becomes a hidden namespace of magic functions. An explicit import is consistent with how everything else works in Dvala, and the user controls what they pull in:

```dvala
let { test, describe, skip } = import(test);
```

The runner's only job: detect `.test.dvala` file, evaluate it, collect registered tests, run them. No special bindings needed.

### `assert` stays as a core builtin

`assert` and the test assertion module serve different purposes:
- **`assert(cond, msg)`** = runtime invariant for production code. "This should never happen, crash if it does."
- **`assertEqual`/`assertTrue`/etc.** = test assertions with structured error reporting and diffs.

`assert` stays in core — available everywhere, no import needed.

### Test file conventions

- Pattern: `*.test.dvala`
- Location: up to the user — the framework is location-agnostic. `dvala test` takes explicit file paths or globs.
- Convention for this project: co-located with source
  - Core: `src/builtin/core/core.test.dvala` (or split by category)
  - Modules: `src/builtin/modules/<name>/<name>.test.dvala`
- Each file is self-contained — imports what it needs, no `@include` directives

### Test runner behavior

1. Discover `.test.dvala` files (by glob or explicit path)
2. For each file:
   a. Create a fresh Dvala instance with all modules
   b. Inject `test` and `describe` bindings
   c. Evaluate the file — this registers tests (doesn't run them yet)
   d. Run collected tests, each in isolation
   e. Collect results (pass/fail/skip/error)
3. Output results in TAP format with a human-readable summary

### Skipping tests

```dvala
skip("not implemented yet", fn()
  assertEqual(todo(), 42);
end);
```

Or with a condition:

```dvala
test("platform specific", fn()
  // body
end, #{skip: true});
```

### CLI interface

```
dvala test                           # run all *.test.dvala files
dvala test path/to/file.test.dvala   # run specific file
dvala test --pattern "string"        # filter by test name regex
dvala test --verbose                 # show passing tests too
```

### Two runner paths

**For Dvala users:** `dvala test` CLI command. Works standalone — no Node.js/vitest/build step required. This is the primary interface.

**For Dvala developers (this project):** A vitest integration that discovers `.test.dvala` files and runs them as part of `npm run test`. This means core/module tests run alongside TypeScript unit tests in the same pipeline, with no separate build step.

```typescript
// In vitest setup or a custom test helper
it.each(dvalaTestCases)('%s', (testCase) => {
  const result = runDvalaTest(testCase);
  expect(result.passed).toBe(true);
});
```

### Test output

TAP v13 for machine consumption, with human-readable summary:

```
TAP version 13
# math > abs
ok 1 - negative
ok 2 - positive
# string functions
ok 3 - upper-case
ok 4 - trim
not ok 5 - lower-case
  ---
  message: Expected "hello" but got "HELLO"
  at: string.test.dvala:12
  ---

1..5
# pass: 4
# fail: 1
```

## Open Questions

- Should `describe` support a setup block (shared bindings for all tests in the group), or is `let` at the top of the `describe` body sufficient?
- Should test execution order be guaranteed (sequential as written) or explicitly unordered?
- Do we want `only` (run just this test) in addition to `skip`?
- Should the vitest integration generate one vitest test per `.test.dvala` file, or one per `test()` call?

## Implementation Plan

1. **Design the test/describe API** — finalize syntax, skip/only semantics, and runner behavior
2. **Implement test runner** — new `src/testFramework/` that evaluates files and collects `test`/`describe` registrations
3. **Write core tests** — `src/builtin/core/*.test.dvala` covering all core builtins
4. **Write module tests** — `src/builtin/modules/<name>/<name>.test.dvala` for each module
5. **Wire up CLI** — update `dvala test` to use new runner
6. **Vitest integration** — plugin to run `.test.dvala` files in `npm run test`
7. **Remove old framework** — delete comment-annotation parser and old test files
