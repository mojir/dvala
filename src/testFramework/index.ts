import fs, { globSync } from 'node:fs'
import path from 'node:path'
import { createDvala } from '../createDvala'
import { allBuiltinModules } from '../allModules'
import { bundle } from '../bundler'
import { createTestCollector, createTestModule } from '../builtin/modules/test'
import type { TestEntry } from '../builtin/modules/test'
import type { Handlers } from '../evaluator/effectTypes'
import type { TestCaseResult, TestRunResult, TestSuiteResult } from './result'
import { formatTap } from './formatTap'

/** Regex to detect file imports: import("./..."), import("../..."), or import("/...") */
const fileImportPattern = /import\(\s*["']\.{0,2}\/[^"']+["']\s*\)/

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

    // If the test file uses file imports, bundle it first so that
    // import("./path.dvala") calls are resolved and available at runtime
    const hasFileImports = fileImportPattern.test(source)
    const runSource = hasFileImports ? bundle(filePath) : source

    // Evaluate the test file — this populates the collector with test registrations
    dvala.run(runSource, hasFileImports
      ? { effectHandlers: testEffectHandlers }
      : { filePath, effectHandlers: testEffectHandlers },
    )

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

/**
 * Discover and run all test files matching a glob pattern.
 * Used by `dvala test` (no args) with dvala.json config.
 */
export function runTestSuite(rootDir: string, testGlob: string, testNamePattern?: RegExp): TestSuiteResult {
  const files = globSync(testGlob, { cwd: rootDir })
    .map(f => path.resolve(rootDir, f))
    .sort()

  const start = performance.now()
  const results = files.map(testPath => runTestFile({ testPath, testNamePattern }))
  const durationMs = performance.now() - start

  return { files: results, durationMs }
}

function readDvalaFile(dvalaPath: string): string {
  if (!dvalaPath.endsWith('.dvala'))
    throw new Error(`Expected .dvala file, got ${dvalaPath}`)

  return fs.readFileSync(dvalaPath, { encoding: 'utf-8' })
}
