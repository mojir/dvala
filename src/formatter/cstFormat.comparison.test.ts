/**
 * Comparison tests: run formatWithCst against the same inputs as format.test.ts
 * to identify differences between old and new formatter.
 *
 * Tests marked with `.skip` are known differences that will be addressed
 * when the CST formatter replaces the old one (Phase 4).
 */
import { describe, expect, it } from 'vitest'
import { format, formatWithCst } from './format'

function compare(input: string): void {
  const oldResult = format(input).trimEnd()
  const newResult = formatWithCst(input).trimEnd()
  expect(newResult).toBe(oldResult)
}

// Quick survey: how many existing test cases produce matching output?
describe('CST formatter vs old formatter — comparison', () => {
  // Let bindings
  it('let binding simple', () => compare('let x = 42'))
  it('let with operators', () => compare('let x = 1 + 2'))
  it('array destructuring', () => compare('let [a, b] = arr'))

  // Functions
  it('lambda', () => compare('let f = (a, b) -> a + b'))
  it('shorthand lambda', () => compare('let f = -> $ + 1'))

  // Collections
  it('short array', () => compare('[1, 2, 3]'))
  it('empty array', () => compare('[]'))
  it('empty object', () => compare('{}'))

  // Operators
  it('binary op', () => compare('1 + 2'))
  it('property access', () => compare('foo.bar'))
  // CST formatter preserves authored `arr[0]` syntax instead of desugaring to `get(arr, 0)`.
  // This is an intentional improvement — the old prettyPrint normalizes syntax forms.
  it('index access — CST preserves authored form', () => {
    expect(formatWithCst('arr[0]').trimEnd()).toBe('arr[0];')
  })
  it('function call', () => compare('foo(1, 2)'))

  // Control flow
  it('simple if', () => compare('if true then 1 else 2 end'))
  it('do block', () => compare('do 42 end'))

  // Literals
  it('number', () => compare('42'))
  it('string', () => compare('"hello"'))
  it('true', () => compare('true'))
  it('null', () => compare('null'))
})
