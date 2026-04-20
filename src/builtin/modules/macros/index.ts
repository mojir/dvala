import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import macrosModuleSource from './macros.dvala'

const macroDocs: Record<string, FunctionDocs> = {
  'trace': {
    category: 'macros',
    description: 'Wraps a function so its arguments are logged on entry and its return value on exit (via `@dvala.io.print`). Useful for debugging call flow without editing the function body. Supports both direct application and `#trace` as a decorator on a `let` binding.',
    returns: { type: 'function' },
    args: { fn: { type: 'function' } },
    variants: [{ argumentNames: ['fn'] }],
    examples: [
      'let { trace } = import("macros");\nlet add = trace((a, b) -> a + b);\nadd(3, 4)',
      'let { trace } = import("macros");\nlet greet = #trace (name) -> "hello, " ++ name;\n[greet("Ada"), greet("Grace")]',
      'let { trace } = import("macros");\n#trace\nlet greet = (name) -> "hello, " ++ name;\n[greet("Ada"), greet("Grace")]',
    ],
  },
  'unless': {
    category: 'macros',
    description: 'Evaluates ``body`` only when ``cond`` is falsy; returns `null` otherwise. Inverse of `if`. The body is not evaluated when the condition is truthy — useful for guard clauses.',
    returns: { type: 'any' },
    args: {
      cond: { type: 'any' },
      body: { type: 'any' },
    },
    variants: [{ argumentNames: ['cond', 'body'] }],
    examples: [
      'let { unless } = import("macros");\nunless(isEmpty([1, 2, 3]), "processing items")',
      'let { unless } = import("macros");\nlet safeDivide = (a, b) -> unless(b == 0, a / b);\n[safeDivide(10, 2), safeDivide(10, 0)]',
    ],
  },
  'tap': {
    category: 'macros',
    description: 'Evaluates ``value``, runs ``sideEffect`` for its effects, then returns the original value unchanged. Ideal for peeking inside a `|>` pipeline without breaking the data flow. Since `tap` is a macro, wrap it in a lambda to slot into a pipe — `_` placeholders rewrite for functions, not macros.',
    returns: { type: 'any' },
    args: {
      value: { type: 'any' },
      sideEffect: { type: 'any' },
    },
    variants: [{ argumentNames: ['value', 'sideEffect'] }],
    examples: [
      'let { tap } = import("macros");\nrange(5)\n  |> map(_, -> $ * $)\n  |> (-> tap($, perform(@dvala.io.print, "squares: " ++ str($))))\n  |> filter(_, isOdd)\n  |> reduce(_, +, 0)',
      'let { tap } = import("macros");\ntap(42, perform(@dvala.io.print, "checkpoint"))',
    ],
  },
  'dbg': {
    category: 'macros',
    description: 'Prints `"<source> => <value>"` (via `@dvala.io.print`) and returns the value unchanged. The source text is captured at macro-expansion time. Transparent — drop it into any subexpression to log without changing behavior.',
    returns: { type: 'any' },
    args: { expr: { type: 'any' } },
    variants: [{ argumentNames: ['expr'] }],
    examples: [
      'let { dbg } = import("macros");\ndbg(1 + 2 * 3)',
      'let { dbg } = import("macros");\ndbg(2 + 3) * dbg(4 - 1)',
    ],
  },
  'cond': {
    category: 'macros',
    description: 'Scheme/Clojure-style multi-branch conditional. Arguments alternate as predicate/value pairs; a trailing odd-numbered argument is the default. Non-matching branches are never evaluated. Expands to nested `if/else if`.',
    returns: { type: 'any' },
    args: { clauses: { type: 'any', rest: true } },
    variants: [{ argumentNames: ['clauses'] }],
    examples: [
      'let { cond } = import("macros");\nlet describe = (x) -> cond(x < 0, "negative", x == 0, "zero", "positive");\n[describe(-1), describe(0), describe(5)]',
      'let { cond } = import("macros");\nlet classify = (code) -> cond(code < 300, "OK", code < 400, "Redirect", code < 500, "Client Error", code < 600, "Server Error", "Unknown");\nmap([200, 301, 404, 500, 999], classify)',
    ],
  },
}

export const macrosModule: DvalaModule = {
  name: 'macros',
  description: 'Ready-to-use macros built in pure Dvala: tracing, debugging, conditionals, and control-flow sugar.',
  functions: {},
  source: macrosModuleSource,
  docs: macroDocs,
}
