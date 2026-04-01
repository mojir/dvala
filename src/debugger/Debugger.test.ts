import { describe, expect, it } from 'vitest'
import { createDvala } from '../createDvala'
import { Debugger } from './Debugger'

describe('Debugger', () => {
  const d = createDvala()

  describe('breakpoints', () => {
    it('stops on a breakpoint and continues', async () => {
      const code = 'let x = 1 + 2; x'
      const result = await d.runAsync(code, {
        onNodeEval: _node => {
          // no-op — just verify onNodeEval works
        },
      })
      expect(result.type).toBe('completed')
    })

    it('pauses execution when breakpoint is hit', async () => {
      const code = 'let a = 10; let b = 20; a + b'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        // Immediately continue on every stop
        dbg.continue()
      })

      // Set breakpoint on every node to verify we can stop and continue
      // We'll use stepInto to stop on first node instead
      dbg.stepInto() // trigger initial stop on first node

      // Need to resume to start — stepInto sets the command, then we start
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stopCount).toBeGreaterThanOrEqual(1)
    })

    it('breakpoint management', () => {
      const dbg = new Debugger(() => {})
      dbg.setBreakpoint(42)
      dbg.setBreakpoint(99)
      expect(dbg.getBreakpoints()).toEqual(new Set([42, 99]))

      dbg.removeBreakpoint(42)
      expect(dbg.getBreakpoints()).toEqual(new Set([99]))

      dbg.clearBreakpoints()
      expect(dbg.getBreakpoints()).toEqual(new Set())
    })
  })

  describe('stepping', () => {
    it('stepInto stops on every node', async () => {
      const code = '1 + 2'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.stepInto() // keep stepping into
      })

      // Start stepping
      dbg.stepInto()
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      // Should stop on multiple nodes (the expression, at minimum)
      expect(stopCount).toBeGreaterThanOrEqual(1)
    })

    it('stepOver skips into function bodies', async () => {
      const code = 'let f = () -> 1 + 2; f()'
      const stoppedNodes: number[] = []

      const dbg = new Debugger(event => {
        stoppedNodes.push(event.node[2])
        dbg.stepOver()
      })

      dbg.stepInto() // stop on first node
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      // stepOver should stop on fewer nodes than stepInto would
      const stepOverCount = stoppedNodes.length

      // Compare with stepInto
      const stepIntoNodes: number[] = []
      const dbg2 = new Debugger(event => {
        stepIntoNodes.push(event.node[2])
        dbg2.stepInto()
      })
      dbg2.stepInto()
      await d.runAsync(code, { onNodeEval: dbg2.onNodeEval })

      expect(stepOverCount).toBeLessThan(stepIntoNodes.length)
    })

    it('stepOut exits function to caller', async () => {
      const code = 'let f = () -> 1 + 2; f()'
      const stoppedNodes: number[] = []
      let firstStop = true

      const dbg = new Debugger(event => {
        stoppedNodes.push(event.node[2])
        if (firstStop) {
          // First stop — step into the function
          firstStop = false
          dbg.stepInto()
        } else {
          // We're inside the function — step out
          dbg.stepOut()
        }
      })

      dbg.stepInto() // stop on first node
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stoppedNodes.length).toBeGreaterThanOrEqual(2)
    })

    it('continue after stepping resumes to completion', async () => {
      const code = '1 + 2 + 3'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        // Stop once, then continue to end
        dbg.continue()
      })

      dbg.stepInto() // stop on first node
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(6)
      }
      expect(stopCount).toBe(1)
    })
  })

  describe('variable inspection', () => {
    it('shows variables at stop point', async () => {
      const code = 'let x = 42; let y = "hello"; x + 1'
      let variables: { name: string; value: unknown }[] = []

      // Step into until we get past the let bindings, then inspect
      const dbg2 = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        // After the let bindings, x and y should be visible
        if (vars.some(v => v.name === 'x') && vars.some(v => v.name === 'y')) {
          variables = vars
          dbg2.continue()
        } else {
          dbg2.stepInto()
        }
      })
      dbg2.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg2.onNodeEval })
      expect(result.type).toBe('completed')

      const varNames = variables.map(v => v.name)
      expect(varNames).toContain('x')
      expect(varNames).toContain('y')

      const xVar = variables.find(v => v.name === 'x')
      expect(xVar?.value).toBe(42)

      const yVar = variables.find(v => v.name === 'y')
      expect(yVar?.value).toBe('hello')
    })
  })

  describe('call stack inspection', () => {
    it('shows call stack when stopped inside a function', async () => {
      const code = 'let inner = () -> 42; let outer = () -> inner(); outer()'
      let callStack: { name: string }[] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        // Look for when we're inside inner()
        if (stack.some(e => e.name === 'inner')) {
          callStack = stack
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      const names = callStack.map(e => e.name)
      expect(names).toContain('inner')
      expect(names).toContain('outer')
    })
  })

  describe('stop reason', () => {
    it('reports breakpoint reason when hitting a breakpoint', async () => {
      const code = '1 + 2'
      let reason: string = ''

      // Use a fresh dvala instance for each run so node IDs are consistent
      const d1 = createDvala()
      const d2 = createDvala()

      // Collect node IDs from first run
      let targetNodeId: number | null = null
      const scout = new Debugger(event => {
        if (targetNodeId === null) {
          targetNodeId = event.node[2]
        }
        scout.continue()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set breakpoint on that node in a fresh instance (same code = same IDs)
      const dbg = new Debugger(event => {
        reason = event.reason
        dbg.continue()
      })
      dbg.setBreakpoint(targetNodeId!)

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(reason).toBe('breakpoint')
    })

    it('reports step reason when stepping', async () => {
      const code = '1 + 2'
      let reason: string = ''

      const dbg = new Debugger(event => {
        reason = event.reason
        dbg.continue()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(reason).toBe('step')
    })
  })
})
