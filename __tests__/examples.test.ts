import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'
import { examples } from '../reference/examples'
import { tokenizeSource, parseTokenStream } from '../src/tooling'
import type { HandlerRegistration } from '../src/evaluator/effectTypes'

/**
 * Mock effect handlers for running examples.
 * Each handler resumes with a sensible default value so the program completes.
 */
function getMockHandlers(): HandlerRegistration[] {
  const printed: string[] = []

  return [
    // I/O: print captures output, read returns canned input
    {
      pattern: 'dvala.io.print',
      handler: ctx => {
        printed.push(String(ctx.arg))
        ctx.resume(ctx.arg)
      },
    },
    {
      pattern: 'dvala.io.read',
      handler: ctx => {
        // Return empty string to trigger "quit" / cancel paths in interactive examples
        ctx.resume('')
      },
    },

    // Sleep: resume immediately
    {
      pattern: 'dvala.sleep',
      handler: ctx => ctx.resume(null),
    },

    // Host effects used in context examples
    {
      pattern: 'host.plus',
      handler: ctx => {
        const args = ctx.arg as number[]
        ctx.resume(args[0]! + args[1]!)
      },
    },
    {
      pattern: 'host.delay',
      handler: async ctx => ctx.resume(null),
    },
    {
      pattern: 'host.fetchUser',
      handler: async ctx => {
        ctx.resume({
          id: ctx.arg,
          name: 'Mock User',
          email: 'mock@example.com',
          city: 'Mock City',
          company: 'Mock Corp',
        })
      },
    },
    {
      pattern: 'host.fetchPosts',
      handler: async ctx => {
        ctx.resume([
          { title: 'Mock Post 1' },
          { title: 'Mock Post 2' },
        ])
      },
    },
    {
      pattern: 'host.fetchTodos',
      handler: async ctx => {
        ctx.resume([
          { title: 'Todo 1', completed: true },
          { title: 'Todo 2', completed: false },
        ])
      },
    },

    // Playground effects: no-ops
    {
      pattern: 'playground.*',
      handler: ctx => ctx.resume(null),
    },
  ]
}

describe('examples — tokenize and parse', () => {
  for (const example of examples) {
    it(`tokenizes and parses: ${example.name} (${example.id})`, () => {
      const tokens = tokenizeSource(example.code, true)
      const ast = parseTokenStream(tokens)
      expect(ast.body.length).toBeGreaterThan(0)
    })
  }
})

describe('examples — run', () => {
  const dvala = createDvala({ modules: allBuiltinModules })

  // Examples that require interactive input loops — the mock read handler
  // returns '' which triggers quit/cancel, but the game loop structure
  // doesn't terminate cleanly with empty input
  const interactiveExamples = new Set([
    'text-based-game',
    'async-interactive',
  ])

  for (const example of examples) {
    const skip = interactiveExamples.has(example.id)

    const testFn = skip ? it.skip : it

    testFn(`${example.name} (${example.id})`, async () => {
      const handlers = getMockHandlers()
      const bindings = example.context?.bindings ?? {}

      const result = await dvala.runAsync(example.code, {
        bindings,
        effectHandlers: handlers,
      })

      expect(result.type, `Example "${example.name}" failed: ${result.type === 'error' ? result.error.message : 'suspended'}`).toBe('completed')
    })
  }
})
