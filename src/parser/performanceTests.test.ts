/* eslint-disable no-console */
import { describe, it } from 'vitest'
import { Dvala } from '../Dvala/Dvala'
import { evaluate } from '../evaluator/trampoline'
import { createContextStack } from '../evaluator/ContextStack'

const dvala = new Dvala({ debug: false, astCacheSize: 0 })

// 6c195a7
// dvala.run is slower than eval by a factor 163.2
// dvala.parse + dvala.evaluate is slower than eval by a factor 83.85
// dvala.evaluate is slower than eval by a factor 12.86
describe.skip('performance comparison', () => {
  const expressions = [
    '42', // a bit faster than eval
    '42 + 1', // a bit slower than eval
    '2 + 3 * 4',
    '5 ^ 2 - 3 / 2',
    '[1, 2, 3][1]',
    ['((x, y) -> x + y)(2, 3)', '((x, y) => x + y)(2, 3)'],
    '2 ^ (3 + 1) - 5 / (1 + 1)',
    '2 ^ (3 * 2) + 4 / (2 - 1) - 5 % 3',
    '((2 + 3) * 4 / 2 - 1) ^ 2 % 5 + 6 - 7 * 8 / 9', // more than 20 times slower than eval
  ]
  const iterations = 10000

  it('compares performance of dvala.run and eval', () => {
    type ReportEntry = {
      expression: string
      eval: number
      dvala: number
    }
    const entries: ReportEntry[] = []

    for (const expression of expressions) {
      const report: ReportEntry = {
        expression: Array.isArray(expression) ? expression[0]! : expression,
        eval: 0,
        dvala: 0,
      }
      entries.push(report)

      let startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        dvala.run(Array.isArray(expression) ? expression[0]! : expression)
      }
      report.dvala = (performance.now() - startTime) * 1000 / iterations

      startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        // eslint-disable-next-line no-eval
        eval(Array.isArray(expression) ? expression[1]! : expression)
      }
      report.eval = (performance.now() - startTime) * 1000 / iterations
    }

    console.log('dvala.run is slower than eval by a factor', calculateFactor(entries))
  })

  it('compares performance of dvala.parse + dvala.evaluate and eval', () => {
    type ReportEntry = {
      expression: string
      eval: number
      dvala: number
    }
    const entries: ReportEntry[] = []
    const expressionsWithTokenStreams = expressions.map((expression) => {
      const tokenStream = dvala.tokenize(Array.isArray(expression) ? expression[0]! : expression)

      return {
        expression,
        tokenStream,
      }
    })

    for (const expression of expressionsWithTokenStreams) {
      const report: ReportEntry = {
        expression: Array.isArray(expression.expression) ? expression.expression[0]! : expression.expression,
        eval: 0,
        dvala: 0,
      }
      entries.push(report)

      let startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        const ast = dvala.parse(expression.tokenStream)
        void evaluate(ast, createContextStack())
      }
      report.dvala = (performance.now() - startTime) * 1000 / iterations

      startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        // eslint-disable-next-line no-eval
        eval(Array.isArray(expression.expression) ? expression.expression[1]! : expression.expression)
      }
      report.eval = (performance.now() - startTime) * 1000 / iterations
    }

    console.log('dvala.parse + dvala.evaluate is slower than eval by a factor', calculateFactor(entries))
  })

  it('compares performance of dvala.evaluate and eval', () => {
    type ReportEntry = {
      expression: string
      eval: number
      dvala: number
    }
    const entries: ReportEntry[] = []
    const expressionsWithAsts = expressions.map((expression) => {
      const tokenStream = dvala.tokenize(Array.isArray(expression) ? expression[0]! : expression)
      const ast = dvala.parse(tokenStream)

      return {
        expression,
        ast,
      }
    })

    for (const expression of expressionsWithAsts) {
      const report: ReportEntry = {
        expression: Array.isArray(expression.expression) ? expression.expression[0]! : expression.expression,
        eval: 0,
        dvala: 0,
      }
      entries.push(report)

      let startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        void evaluate(expression.ast, createContextStack())
      }
      report.dvala = (performance.now() - startTime) * 1000 / iterations

      startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        // eslint-disable-next-line no-eval
        eval(Array.isArray(expression.expression) ? expression.expression[1]! : expression.expression)
      }
      report.eval = (performance.now() - startTime) * 1000 / iterations
    }

    console.log('dvala.evaluate is slower than eval by a factor', calculateFactor(entries))
  })
})

function calculateFactor(entries: { eval: number, dvala: number }[]) {
  return Math.round(100 * entries.reduce((acc, { eval: evalTime, dvala: dvalaTime }) => acc + dvalaTime / evalTime, 0) / entries.length) / 100
}
