# Testing

## Pure Functions Are Trivially Testable

The most important consequence of purity is how easy it makes testing. A pure function takes inputs and returns an output — no database, no file system, no clock, no global state. There is nothing to set up and nothing to tear down. You call the function and check the result:

```dvala
let add = (a, b) -> a + b;

assert(add(2, 3) == 5);
assert(add(-1, 1) == 0);
assert(add(0, 0) == 0);
```

This is not a simplified example — it is genuinely all that is required. Purity makes the test surface exactly as large as the function itself.

## The Assertion Module

The built-in `assert` is enough for simple conditions, but the `assertion` module provides a richer vocabulary. Import what you need:

```dvala
let { assertEqual, assertNotEqual, assertTrue, assertFails } =
  import("assertion");

let double = (x) -> x * 2;

assertEqual(double(0), 0);
assertEqual(double(21), 42);
assertNotEqual(double(3), 7);
```

`assertEqual` compares structurally, so it works correctly for nested arrays and objects:

```dvala
let { assertEqual } = import("assertion");

let zip = (xs, ys) -> map(range(count(xs)), (i) -> [get(xs, i), get(ys, i)]);

assertEqual(zip([1, 2, 3], ["a", "b", "c"]), [[1, "a"], [2, "b"], [3, "c"]]);
```

## Testing Error Cases

`assertFails` and `assertFailsWith` let you verify that a function rejects invalid input:

```dvala
let { assertFails, assertFailsWith } = import("assertion");

let divide = (a, b) -> do
  assert(not(b == 0), "Division by zero");
  a / b;
end;

assertFailsWith(-> divide(10, 0), "Division by zero");
assertFails(-> divide(10, 0));
```

`assertFailsWith` checks the exact error message; `assertFails` only requires that *some* error is thrown.

## Testing Effectful Code

Effects are the key to testing impure code without mocking frameworks. Because effects are handled externally, a test can substitute a real handler (one that does I/O, reads a clock, etc.) with a test handler that returns predictable values.

Here is a function that performs an effect and then returns a value:

```dvala
let greet = (name) -> do
  perform(@dvala.io.print, "Hello, " ++ name ++ "!");
  name;
end;
```

In production you provide a real I/O handler. In a test, you suppress the output entirely and check only the return value:

```dvala
let { assertEqual } = import("assertion");

let greet = (name) -> do
  perform(@dvala.io.print, "Hello, " ++ name ++ "!");
  name;
end;

let silence = handler @dvala.io.print(msg) -> resume(null) end;

do
  with silence;
  assertEqual(greet("Alice"), "Alice");
end;
```

The handler intercepts the `@dvala.io.print` effect and resumes with `null` — the print never happens. The test verifies the return value in complete isolation from I/O.

The same pattern scales to any effect. Suppose your program reads configuration via an effect:

```dvala
let { assertEqual } = import("assertion");

let formatWelcome = -> "Welcome to " ++ perform(@app.config, "appName");

let fakeConfig = handler @app.config(key) -> resume("TestApp") end;

do
  with fakeConfig;
  assertEqual(formatWelcome(), "Welcome to TestApp");
end;
```

The test handler fixes the configuration to a known value. No config file, no environment variable, no setup.

## A Minimal Test Runner

Because a failed assertion performs `@dvala.error`, you can catch it with a handler and collect results:

```dvala
let { assertEqual } = import("assertion");

let runTest = (name, fn) -> do
  with handler @dvala.error(err) -> ["fail", name, err.message] end;
  fn();
  ["pass", name];
end;

[
  runTest("double zero", -> assertEqual(0 * 2, 0)),
  runTest("double positive", -> assertEqual(5 * 2, 10)),
  runTest("intentional", -> assertEqual(1 + 1, 3)),
];
```

Each test is isolated: a failure in one does not abort the others. The result is a plain array you can inspect, format, or feed into further processing — no test framework required.

## The Built-in Test Framework

Dvala ships a structured test runner built on top of the same effect and assertion primitives shown above. Test files are named `*.test.dvala` and use the `test` module:

```dvala no-run
let { test, describe } = import("test");
let { assertEqual, assertTrue } = import("assertion");
let { clamp } = import("./math");

describe("clamp", -> do
  test("within range", -> assertEqual(clamp(5, 0, 10), 5));
  test("below min",   -> assertEqual(clamp(-5, 0, 10), 0));
  test("above max",   -> assertEqual(clamp(15, 0, 10), 10));
end)
```

`describe` groups related tests under a name. `test` registers a single case — a thunk that either returns (pass) or throws (fail). Nesting `describe` blocks is allowed.

Run the suite from your project root (requires a `dvala.json`):

```bash
dvala test
```

The runner discovers all `*.test.dvala` files, runs them in parallel, and prints a summary:

```text
✓ tests/math.test.dvala (12 tests, 0.007s)

 Tests  12 passed (12)
```

### Skipping Tests

Use `#skip` to mark a test or group as skipped. It is a macro — use the `#` prefix:

```dvala no-run
let { test, describe, skip } = import("test");

#skip
test("not implemented yet", -> assertEqual(1, 2));

#skip
describe("entire group", -> do
  test("foo", -> assertEqual(1, 2));
  test("bar", -> assertEqual(2, 3));
end)
```

Skipped tests appear in the summary but are not executed — they never fail the suite.

### Running a Single File

Pass a file path directly to run without a `dvala.json`:

```bash
dvala test tests/math.test.dvala
```

### Coverage

Add `--coverage` to collect line and expression coverage across all source files:

```bash
dvala test --coverage
```

A summary table is always printed to stdout:

```text
--------------|---------|---------|----------------------
File          | % Lines | % Exprs | Uncovered Line #s
--------------|---------|---------|----------------------
lib/math.dvala|     100 |   31.58 |
lib/stats.dvala|    100 |      38 |
--------------|---------|---------|----------------------
```

By default an LCOV report is written to `coverage/lcov.info`. To also generate a browsable HTML report, add `"reporter": ["lcov", "html"]` to your `dvala.json`:

```json
{
  "coverage": {
    "reporter": ["lcov", "html"]
  }
}
```

The HTML report shows each source file with lines highlighted green (covered) or red (uncovered). Files that were never imported during tests appear at 0% — Dvala parses them statically to count their lines.

Override the output directory with `--coverage-dir`:

```bash
dvala test --coverage --coverage-dir reports/coverage
```

## Summary

- Pure functions need no setup or teardown — call the function, check the result.
- The `assertion` module provides `assertEqual`, `assertFails`, `assertFailsWith`, and more.
- Effects decouple logic from I/O: substitute a test handler for the real one and test the return value in isolation.
- A minimal test runner is just a handler that catches `@dvala.error`.
- The built-in test framework (`dvala test`) provides `describe`, `test`, and `#skip` (a macro) with structured output and parallel execution.
- `dvala test --coverage` generates line and expression coverage reports in LCOV and/or HTML format.
