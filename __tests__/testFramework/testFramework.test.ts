import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DvalaError } from '../../src/errors'
import { runTest } from '../../src/testFramework'
import { getErrorYaml } from '../../src/testFramework/formatTap'

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
