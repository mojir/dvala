import fs from 'node:fs'
import { createDvala } from '../createDvala'
import { allBuiltinModules } from '../allModules'
import { createTestCollector, createTestModule } from '../builtin/modules/test'
import type { TestEntry } from '../builtin/modules/test'
import type { Handlers } from '../evaluator/effectTypes'
import type { TestCaseResult, TestRunResult } from './result'
import { formatTap } from './formatTap'

interface RunTestParams {
  testPath: string
  testNamePattern?: RegExp
}

/**
 * Runs a .test.dvala file and returns structured results.
 * The runner is format-agnostic — use formatTap() or other formatters to render output.
 */
export function runTestFile({ testPath: filePath, testNamePattern }: RunTestParams): TestRunResult {
  try {
    const source = readDvalaFile(filePath)

    // Create a collector and a test module bound to it
    const collector = createTestCollector()
    const testModule = createTestModule(collector)

    // Effect handlers for describe push/pop — the describe function in test.dvala
    // performs these effects so the runner can manage the describe name stack
    const testEffectHandlers: Handlers = [
      {
        pattern: 'test.pushDescribe',
        handler: ({ arg, resume }) => {
          collector.describeStack.push(arg as string)
          resume(null)
        },
      },
      {
        pattern: 'test.popDescribe',
        handler: ({ resume }) => {
          collector.describeStack.pop()
          resume(null)
        },
      },
    ]

    // Create a Dvala runner with the test module included alongside all builtins
    const dvala = createDvala({ debug: true, modules: [...allBuiltinModules, testModule] })

    // Evaluate the test file — this populates the collector with test registrations
    dvala.run(source, { filePath, effectHandlers: testEffectHandlers })

    // Run collected tests with timing
    const tests = collector.tests
    const runStart = performance.now()
    const results: TestCaseResult[] = tests.map((test: TestEntry) => {
      if (testNamePattern && !testNamePattern.test(test.fullName)) {
        return { name: test.fullName, status: 'skipped' as const, reason: `Not matching testNamePattern ${testNamePattern}` }
      }
      if (test.skip) {
        return { name: test.fullName, status: 'skipped' as const }
      }
      const start = performance.now()
      try {
        dvala.run('__testBody__()', { bindings: { __testBody__: test.body } })
        return { name: test.fullName, status: 'passed' as const, durationMs: performance.now() - start }
      } catch (error) {
        return { name: test.fullName, status: 'failed' as const, error, durationMs: performance.now() - start }
      }
    })
    const durationMs = performance.now() - runStart

    return { filePath, results, durationMs }
  } catch (error: unknown) {
    return { filePath, results: [], bailout: error }
  }
}

/**
 * Legacy API — runs a test file and returns TAP output.
 * Used by the CLI and vitest integration.
 */
export function runTest(params: RunTestParams): { tap: string; success: boolean } {
  const result = runTestFile(params)
  return formatTap(result)
}

function readDvalaFile(dvalaPath: string): string {
  if (!dvalaPath.endsWith('.dvala'))
    throw new Error(`Expected .dvala file, got ${dvalaPath}`)

  return fs.readFileSync(dvalaPath, { encoding: 'utf-8' })
}
