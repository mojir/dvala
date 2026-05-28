import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  test: {
    type: '(String, (() -> Unknown)) -> @{test.register} Null',
    category: 'test',
    description:
      'Registers a test case with a name and a function body. The test is collected by the test runner and executed in isolation.',
    returns: {
      type: 'null',
    },
    args: {
      name: {
        type: 'string',
        description: 'The name of the test case.',
      },
      body: {
        type: 'function',
        description: 'A zero-argument function containing the test assertions.',
      },
    },
    variants: [
      {
        argumentNames: ['name', 'body'],
      },
    ],
    examples: ['let { test } = import("test");\ntest("addition", -> assertEqual(1 + 1, 2))'],
    seeAlso: ['test.describe', 'test.skip'],
    hideOperatorForm: true,
  },
  describe: {
    type: '(String, (() -> Unknown)) -> @{test.register} Null',
    category: 'test',
    description:
      'Groups related tests under a descriptive label. Can be nested. The body function is executed immediately to collect the tests within.',
    returns: {
      type: 'null',
    },
    args: {
      name: {
        type: 'string',
        description: 'The name of the test group.',
      },
      body: {
        type: 'function',
        description: 'A zero-argument function containing test() and/or nested describe() calls.',
      },
    },
    variants: [
      {
        argumentNames: ['name', 'body'],
      },
    ],
    examples: [
      'let { test, describe } = import("test");\ndescribe("math", -> test("abs", -> assertEqual(abs(-1), 1)))',
    ],
    seeAlso: ['test.test', 'test.skip'],
    hideOperatorForm: true,
  },
  skip: {
    type: '(Unknown) -> @{test.register} Null',
    category: 'test',
    description:
      'A macro that marks its argument as skipped. Works with both `test` and `describe` — any tests registered inside the expression are reported but not executed. Use with the `#` prefix: `#skip test(...)` or `#skip describe(...)`.',
    returns: {
      type: 'null',
    },
    args: {
      expr: {
        type: 'any',
        description: 'A test or describe expression to skip (received as unevaluated AST).',
      },
    },
    variants: [
      {
        argumentNames: ['expr'],
      },
    ],
    examples: ['let { test, skip } = import("test");\n#skip test("not ready yet", -> assertEqual(1, 2))'],
    seeAlso: ['test.test', 'test.describe'],
    hideOperatorForm: true,
  },
}
