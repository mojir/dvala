/**
 * Vitest integration for .test.dvala files.
 * Discovers all .test.dvala files under src/ and runs them as vitest tests.
 * This gives us TS code coverage from Dvala tests for free.
 *
 * TODO: This runs one vitest test per .test.dvala file, so CI artifact output
 * (e.g. JUnit XML via --reporter=junit) is per-file, not per test() call.
 * When we add Dvala code coverage and standalone project test support,
 * revisit to expose per-test-case granularity in output formats.
 */
import { globSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTestFile } from '../src/testFramework'
import { isSuccess } from '../src/testFramework/result'
import { formatConsole } from '../src/testFramework/formatConsole'

const dvalaTestFiles = globSync('src/**/*.test.dvala', { cwd: path.resolve(__dirname, '..') })
  .map(f => path.resolve(__dirname, '..', f))

describe('dvala tests', () => {
  for (const testFile of dvalaTestFiles) {
    const relativePath = path.relative(path.resolve(__dirname, '..'), testFile)

    it(relativePath, async () => {
      const result = await runTestFile({ testPath: testFile })

      if (!isSuccess(result)) {
        const { text } = formatConsole(result, { color: false })
        expect.unreachable(`Dvala test failed:\n${text}`)
      }
    })
  }

  if (dvalaTestFiles.length === 0) {
    it('no .test.dvala files found', () => {
      // Placeholder — remove when test files exist
    })
  }
})
