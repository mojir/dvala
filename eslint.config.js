const { antfu } = require('@antfu/eslint-config')

const config = antfu({
  stylistic: {
    indent: 2,
  },
  test: {
    overrides: {
      'test/consistent-test-it': 'off',
    },
  },
  typescript: {
    tsconfigPath: 'tsconfig.compile.json',
    overrides: {
      'ts/restrict-template-expressions': ['off'],
      'no-labels': ['off'],
      'no-restricted-syntax': ['off'],
      'ts/strict-boolean-expressions': ['off'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'ts/no-shadow': 'error',
      'ts/consistent-type-imports': 'error',
      'ts/consistent-generic-constructors': ['error', 'constructor'],
      'ts/consistent-indexed-object-style': 'error',
      'ts/consistent-type-definitions': 'off',
      'ts/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
    },
  },
  ignores: [
    'e2e/**/*',
    'playwright.config.ts',
    'coverage/**/*',
    'README.md',
    'CLAUDE.md',
    'file-modules.md',
    'dvala-effects-intro.md',
    'dvala-effects-plan.md',
    'snapshot-system-plan.md',
    'dvala-api-contract.md',
    'dvala-content.md',
    'dvala-llm-prompt.md',
    'effect-system-redesign.md',
    'continuation-dedup-plan.md',
    'core-dvala-source-plan.md',
    'chaining-api-design.md',
    'fix-suspend-through-hofs.md',
    'docs',
    'playground-builder/src/components/tutorials/**/*',
    'scripts/**/*',
    'vscode-dvala/**/*',
  ],
})

module.exports = config
