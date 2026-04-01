import fs from 'node:fs'
import { globSync } from 'glob'
import path from 'node:path'
import { createDvala } from '../createDvala'
import { allBuiltinModules } from '../allModules'
import { bundle } from '../bundler'
import { createTestCollector, createTestModule } from '../builtin/modules/test'
import type { TestEntry } from '../builtin/modules/test'
import type { AstNode } from '../parser/types'
import type { Handlers } from '../evaluator/effectTypes'
import type { TestCaseResult, TestRunResult, TestSuiteResult } from './result'
import { formatTap } from './formatTap'

/** Regex to detect file imports: import("./..."), import("../..."), or import("/...") */
const fileImportPattern = /import\(\s*["']\.{0,2}\/[^"']+["']\s*\)/

interface RunTestParams {
  testPath: string
  testNamePattern?: RegExp
  /** When true, accumulates a node evaluation hit map and sourceMap for coverage reporting. */
  coverage?: boolean
}

/**
 * Runs a .test.dvala file and returns structured results.
 * The runner is format-agnostic — use formatTap() or other formatters to render output.
 */
export async function runTestFile({ testPath: filePath, testNamePattern, coverage }: RunTestParams): Promise<TestRunResult> {
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
      {
        pattern: 'test.pushSkip',
        handler: ({ resume }) => {
          collector.skipDepth++
          resume(null)
        },
      },
      {
        pattern: 'test.popSkip',
        handler: ({ resume }) => {
          collector.skipDepth--
          resume(null)
        },
      },
    ]

    // Create a Dvala runner with the test module included alongside all builtins
    const dvala = createDvala({ debug: true, modules: [...allBuiltinModules, testModule] })

    // When coverage is requested, accumulate a hit map across file load + all test bodies
    const coverageMap = coverage ? new Map<number, number>() : undefined
    const onNodeEval = coverageMap
      ? (node: AstNode) => { const id = node[2]; coverageMap.set(id, (coverageMap.get(id) ?? 0) + 1) }
      : undefined

    // If the test file uses file imports, bundle it first so that
    // import("./path.dvala") calls are resolved and available at runtime
    const hasFileImports = fileImportPattern.test(source)
    const runSource = hasFileImports ? bundle(filePath) : source

    // Evaluate the test file — this populates the collector with test registrations
    const fileResult = await dvala.runAsync(runSource, hasFileImports
      ? { effectHandlers: testEffectHandlers, onNodeEval }
      : { filePath, effectHandlers: testEffectHandlers, onNodeEval },
    )

    if (fileResult.type !== 'completed') {
      const error = fileResult.type === 'error' ? fileResult.error : new Error(`Unexpected result type: ${fileResult.type}`)
      return { filePath, results: [], bailout: error }
    }

    // Run collected tests with timing
    const tests = collector.tests
    const runStart = performance.now()
    const results: TestCaseResult[] = await Promise.all(tests.map(async (test: TestEntry) => {
      if (testNamePattern && !testNamePattern.test(test.fullName)) {
        return { name: test.fullName, status: 'skipped' as const, reason: `Not matching testNamePattern ${testNamePattern}` }
      }
      if (test.skip) {
        return { name: test.fullName, status: 'skipped' as const }
      }
      const start = performance.now()
      const result = await dvala.runAsync('__testBody__()', { bindings: { __testBody__: test.body }, onNodeEval })
      const durationMs = performance.now() - start
      if (result.type === 'error') {
        return { name: test.fullName, status: 'failed' as const, error: result.error, durationMs }
      }
      if (result.type !== 'completed') {
        return { name: test.fullName, status: 'failed' as const, error: new Error(`Unexpected result type: ${result.type}`), durationMs }
      }
      return { name: test.fullName, status: 'passed' as const, durationMs }
    }))
    const durationMs = performance.now() - runStart

    // sourceMap from the last completed result — consistent across all runs within this instance
    const sourceMap = fileResult.sourceMap
    return { filePath, results, durationMs, ...(coverageMap ? { coverageMap, sourceMap } : {}) }
  } catch (error: unknown) {
    return { filePath, results: [], bailout: error }
  }
}

/**
 * Legacy API — runs a test file and returns TAP output.
 * Used by the CLI and vitest integration.
 */
export async function runTest(params: RunTestParams): Promise<{ tap: string; success: boolean }> {
  const result = await runTestFile(params)
  return formatTap(result)
}

/**
 * Discover and run all test files matching a glob pattern.
 * Used by `dvala test` (no args) with dvala.json config.
 */
export async function runTestSuite(rootDir: string, testGlob: string, testNamePattern?: RegExp, coverage?: boolean): Promise<TestSuiteResult> {
  const files = globSync(testGlob, { cwd: rootDir })
    .map(f => path.resolve(rootDir, f))
    .sort()

  const start = performance.now()
  const results = await Promise.all(files.map(testPath => runTestFile({ testPath, testNamePattern, coverage })))
  const durationMs = performance.now() - start

  return { files: results, durationMs }
}

function readDvalaFile(dvalaPath: string): string {
  if (!dvalaPath.endsWith('.dvala'))
    throw new Error(`Expected .dvala file, got ${dvalaPath}`)

  return fs.readFileSync(dvalaPath, { encoding: 'utf-8' })
}
