import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'test': {
    category: 'test',
    description: 'Registers a test case with a name and a function body. The test is collected by the test runner and executed in isolation.',
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
    examples: [
      'let { test } = import(test);\ntest("addition", -> assertEqual(1 + 1, 2))',
    ],
    seeAlso: ['test.describe', 'test.skip'],
    hideOperatorForm: true,
  },
  'describe': {
    category: 'test',
    description: 'Groups related tests under a descriptive label. Can be nested. The body function is executed immediately to collect the tests within.',
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
      'let { test, describe } = import(test);\ndescribe("math", -> test("abs", -> assertEqual(abs(-1), 1)))',
    ],
    seeAlso: ['test.test', 'test.skip'],
    hideOperatorForm: true,
  },
  'skip': {
    category: 'test',
    description: 'Registers a skipped test case. The test will be reported but not executed.',
    returns: {
      type: 'null',
    },
    args: {
      name: {
        type: 'string',
        description: 'The name of the skipped test case.',
      },
      body: {
        type: 'function',
        description: 'A zero-argument function containing the test assertions (will not be run).',
      },
    },
    variants: [
      {
        argumentNames: ['name', 'body'],
      },
    ],
    examples: [
      'let { skip } = import(test);\nskip("not ready yet", -> assertEqual(todo(), 42))',
    ],
    seeAlso: ['test.test', 'test.describe'],
    hideOperatorForm: true,
  },
}
