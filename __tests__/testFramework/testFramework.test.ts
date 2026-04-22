import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DvalaError } from '../../src/errors'
import { runTest, runTestFile, runTestSuite } from '../../src/testFramework'
import { getErrorYaml } from '../../src/testFramework/formatTap'
import { isSuccess, isSuiteSuccess } from '../../src/testFramework/result'

describe('testFramework', () => {
  it('expecting .dvala file', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'empty.test') })
    expect(testResult.success).toBe(false)
    expect(testResult.tap).toContain('Bail out!')
  })

  it('empty test', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'empty.test.dvala') })
    expect(testResult.success).toBe(true)
    expect(testResult.tap).toBe('TAP version 13\n1..0\n')
  })

  it('success', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'test.test.dvala') })
    expect(testResult.success).toBe(true)
    expect(testResult.tap).toBe(`TAP version 13
1..2
ok 1 add
ok 2 sub
`)
  })

  it('skip', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'skip.test.dvala') })
    expect(testResult.success).toBe(true)
    expect(testResult.tap).toBe(`TAP version 13
1..2
ok 1 add
ok 2 sub # skip
`)
  })

  it('one success one failure', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'one-success.test.dvala') })
    expect(testResult.success).toBe(false)
    expect(testResult.tap).toContain('ok 1 add')
    expect(testResult.tap).toContain('not ok 2 sub')
  })

  it('all failures', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'failure-test.dvala') })
    expect(testResult.success).toBe(false)
    expect(testResult.tap).toContain('not ok 1 add')
    expect(testResult.tap).toContain('not ok 2 sub')
  })

  it('testNamePattern filters tests', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'failure-test.dvala'), testNamePattern: /add/ })
    expect(testResult.success).toBe(false)
    expect(testResult.tap).toContain('not ok 1 add')
    expect(testResult.tap).toContain('ok 2 sub # skip - Not matching testNamePattern /add/')
  })

  it('object diff error message', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'object-diff.test.dvala') })
    expect(testResult.success).toBe(false)
    expect(testResult.tap).toContain('not ok 1 equals')
  })

  it('describe groups tests', async () => {
    const testResult = await runTest({ testPath: path.join(__dirname, 'describe.test.dvala') })
    expect(testResult.success).toBe(true)
    expect(testResult.tap).toBe(`TAP version 13
1..2
ok 1 math > add
ok 2 math > subtraction > sub
`)
  })

  it('bailout on nonexistent file', async () => {
    // readFileSync throws → the outer catch returns a bailout result
    const result = await runTestFile({ testPath: path.join(__dirname, '__no_such_file__.test.dvala') })
    expect(result.bailout).toBeDefined()
    expect(result.results).toEqual([])
    expect(isSuccess(result)).toBe(false)
  })

  it('runTestSuite discovers and runs matching files', async () => {
    const suite = await runTestSuite(__dirname, 'test.test.dvala')
    expect(suite.files).toHaveLength(1)
    expect(suite.files[0]!.filePath).toBe(path.join(__dirname, 'test.test.dvala'))
    expect(suite.files[0]!.results).toHaveLength(2)
    expect(suite.durationMs).toBeGreaterThanOrEqual(0)
    expect(isSuiteSuccess(suite)).toBe(true)
  })

  it('runTestSuite with no matches returns an empty suite', async () => {
    const suite = await runTestSuite(__dirname, '__nope__/*.dvala')
    expect(suite.files).toEqual([])
    expect(isSuiteSuccess(suite)).toBe(true)
  })

  it('runTestSuite applies testNamePattern to discovered files', async () => {
    const suite = await runTestSuite(__dirname, 'test.test.dvala', /add/)
    expect(suite.files).toHaveLength(1)
    const results = suite.files[0]!.results
    const passed = results.filter(r => r.status === 'passed')
    const skipped = results.filter(r => r.status === 'skipped')
    expect(passed.map(r => r.name)).toEqual(['add'])
    expect(skipped.map(r => r.name)).toEqual(['sub'])
  })

  it('bailout when an imported file cannot be resolved', async () => {
    // Exercises the testFileResolver's "File not found" error — the import
    // inside the test fixture targets a path that does not exist.
    const result = await runTestFile({ testPath: path.join(__dirname, 'bad-import.test.dvala') })
    expect(result.bailout).toBeDefined()
    expect(isSuccess(result)).toBe(false)
    const message = result.bailout instanceof Error ? result.bailout.message : String(result.bailout)
    expect(message).toContain('__does_not_exist__.dvala')
  })

  it('getErrorYaml', () => {
    const error = new DvalaError('Error', {
      code: 'x',
      position: { column: 1, line: 1 },
      filePath: 'file.dvala',
    })
    expect(getErrorYaml(error)).toBe(`
  ---
  error: "DvalaError"
  message: "Error"
  location: "file.dvala:1:1"
  code:
    - "x"
    - "^"
  ...
`)
  })
})
