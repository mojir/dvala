const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const stylistic = require('@stylistic/eslint-plugin')

module.exports = tseslint.config(
  {
    ignores: [
      '.wireit/**',
      'dist/**',
      'e2e/**',
      'playwright.config.ts',
      'prettier.config.js',
      'rolldown.config.mjs',
      'rolldown.config.*.mjs',
      'coverage/**',
      'README.md',
      'CLAUDE.md',
      'docs/**',
      'design/**',
      'playground-builder/src/components/tutorials/**',
      'playground-builder/build/**',
      'playground-www/build/**',
      'rolldown.plugins.mjs',
      'eslint.config.js',
      'scripts/**',
      'vscode-dvala/**',
      'benchmarks/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.compile.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      // Stylistic
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/comma-spacing': 'error',
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/spaced-comment': ['error', 'always'],
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/member-delimiter-style': ['error', { multiline: { delimiter: 'none' }, singleline: { delimiter: 'semi', requireLast: false } }],
      '@stylistic/block-spacing': 'error',
      '@stylistic/space-in-parens': 'error',
      '@stylistic/template-curly-spacing': 'error',

      // Core
      'no-labels': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'warn',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'eqeqeq': 'error',

      // TypeScript
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/consistent-generic-constructors': ['error', 'constructor'],
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Relax type-checked rules for test files (performance)
  {
    files: ['**/*.test.ts', '**/__tests__/**'],
    ...tseslint.configs.disableTypeChecked,
  },
)
