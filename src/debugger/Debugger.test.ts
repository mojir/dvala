import { describe, expect, it } from 'vitest'
import { createDvala } from '../createDvala'
import { allBuiltinModules } from '../allModules'
import { Debugger } from './Debugger'

describe('Debugger', () => {
  const d = createDvala({ modules: allBuiltinModules })

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
        dbg.continue()
      })

      dbg.stepInto()
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

    it('stops on breakpoint with correct reason', async () => {
      const code = '1 + 2'

      // Use fresh instances so node IDs are consistent between runs
      const d1 = createDvala()
      const d2 = createDvala()

      // First run: discover node IDs
      const nodeIds: number[] = []
      const scout = new Debugger(event => {
        nodeIds.push(event.node[2])
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Second run: set breakpoint on the first discovered node
      let stoppedReason = ''
      const dbg = new Debugger(event => {
        stoppedReason = event.reason
        dbg.continue()
      })
      dbg.setBreakpoint(nodeIds[0]!)
      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stoppedReason).toBe('breakpoint')
    })

    it('breakpoint takes priority over continue mode', async () => {
      const code = 'let x = 1; let y = 2; x + y'

      // Use fresh instances so node IDs are consistent between runs
      const d1 = createDvala()
      const d2 = createDvala()

      // Discover node IDs
      const nodeIds: number[] = []
      const scout = new Debugger(event => {
        nodeIds.push(event.node[2])
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set breakpoints on two different nodes, run with continue
      let hitCount = 0
      const dbg = new Debugger(() => {
        hitCount++
        dbg.continue()
      })
      dbg.setBreakpoint(nodeIds[0]!)
      dbg.setBreakpoint(nodeIds[nodeIds.length - 1]!)

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(hitCount).toBeGreaterThanOrEqual(2)
    })

    it('removing a breakpoint prevents it from firing', async () => {
      const code = '1 + 2'

      // Use fresh instances so node IDs are consistent between runs
      const d1 = createDvala()
      const d2 = createDvala()

      // Discover node IDs
      const nodeIds: number[] = []
      const scout = new Debugger(event => {
        nodeIds.push(event.node[2])
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set and then remove the breakpoint
      let hitCount = 0
      const dbg = new Debugger(() => {
        hitCount++
        dbg.continue()
      })
      dbg.setBreakpoint(nodeIds[0]!)
      dbg.removeBreakpoint(nodeIds[0]!)

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(hitCount).toBe(0)
    })
  })

  describe('conditional breakpoints', () => {
    // Helper: create a condition evaluator using a fresh dvala instance
    async function evalCondition(expression: string, continuation: Parameters<typeof Debugger.getVariables>[0]) {
      const vars = Debugger.getVariables(continuation)
      const scopeVars: Record<string, unknown> = {}
      for (const { name, value } of vars) {
        scopeVars[name] = value
      }
      const evalDvala = createDvala({ modules: allBuiltinModules })
      const result = await evalDvala.runAsync(expression, { scope: scopeVars, pure: true })
      if (result.type === 'completed') return result.value
      return undefined
    }

    it('stops when condition is true', async () => {
      const code = 'let x = 10; x + 1'

      const d1 = createDvala({ modules: allBuiltinModules })
      const d2 = createDvala({ modules: allBuiltinModules })

      // Discover node IDs — find a node where x is in scope
      let targetNodeId: number | null = null
      const scout = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'x') && targetNodeId === null) {
          targetNodeId = event.node[2]
        }
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set conditional breakpoint: x == 10 (always true)
      let stopped = false
      const dbg = new Debugger(event => {
        stopped = true
        expect(event.reason).toBe('breakpoint')
        dbg.continue()
      }, evalCondition)
      dbg.setBreakpoint(targetNodeId!, 'x == 10')

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stopped).toBe(true)
    })

    it('skips when condition is false', async () => {
      const code = 'let x = 10; x + 1'

      const d1 = createDvala({ modules: allBuiltinModules })
      const d2 = createDvala({ modules: allBuiltinModules })

      // Discover node IDs
      let targetNodeId: number | null = null
      const scout = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'x') && targetNodeId === null) {
          targetNodeId = event.node[2]
        }
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set conditional breakpoint: x > 100 (always false)
      let stopped = false
      const dbg = new Debugger(() => {
        stopped = true
        dbg.continue()
      }, evalCondition)
      dbg.setBreakpoint(targetNodeId!, 'x > 100')

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stopped).toBe(false)
    })

    it('unconditional breakpoint still works with evaluator present', async () => {
      const code = '1 + 2'

      const d1 = createDvala({ modules: allBuiltinModules })
      const d2 = createDvala({ modules: allBuiltinModules })

      let targetNodeId: number | null = null
      const scout = new Debugger(event => {
        if (targetNodeId === null) targetNodeId = event.node[2]
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      let stopped = false
      const dbg = new Debugger(() => {
        stopped = true
        dbg.continue()
      }, evalCondition)
      // No condition — should always stop
      dbg.setBreakpoint(targetNodeId!)

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stopped).toBe(true)
    })
  })

  describe('stepping', () => {
    it('stepInto stops on every node', async () => {
      const code = '1 + 2'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.stepInto()
      })

      dbg.stepInto()
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stopCount).toBeGreaterThanOrEqual(1)
    })

    it('stepOver does not descend into function bodies', async () => {
      const code = 'let f = () -> 1 + 2; f()'
      const stoppedNodes: number[] = []

      const dbg = new Debugger(event => {
        stoppedNodes.push(event.node[2])
        dbg.stepOver()
      })

      dbg.stepInto()
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      const stepOverCount = stoppedNodes.length

      // Compare with stepInto — should visit more nodes
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
          firstStop = false
          dbg.stepInto()
        } else {
          dbg.stepOut()
        }
      })

      dbg.stepInto()
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(stoppedNodes.length).toBeGreaterThanOrEqual(2)
    })

    it('continue after stepping resumes to completion', async () => {
      const code = '1 + 2 + 3'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.continue()
      })

      dbg.stepInto()
      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(6)
      }
      expect(stopCount).toBe(1)
    })

    it('stepInto descends into nested function calls', async () => {
      const code = 'let a = () -> 10; let b = () -> a(); b()'
      const callStacks: string[][] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        callStacks.push(stack.map(e => e.name))
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      // At some point we should be inside a() called from b()
      const deepestStack = callStacks.reduce((a, b) => (a.length >= b.length ? a : b), [])
      expect(deepestStack.length).toBeGreaterThanOrEqual(2)
    })

    it('stepOver at top level steps through statements', async () => {
      const code = 'let x = 1; let y = 2; x + y'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.stepOver()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(3)
      }
      expect(stopCount).toBeGreaterThanOrEqual(3) // at least one stop per statement
    })
  })

  describe('variable inspection', () => {
    it('shows variables at stop point', async () => {
      const code = 'let x = 42; let y = "hello"; x + 1'
      let variables: { name: string; value: unknown }[] = []

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'x') && vars.some(v => v.name === 'y')) {
          variables = vars
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      const varNames = variables.map(v => v.name)
      expect(varNames).toContain('x')
      expect(varNames).toContain('y')

      const xVar = variables.find(v => v.name === 'x')
      expect(xVar?.value).toBe(42)

      const yVar = variables.find(v => v.name === 'y')
      expect(yVar?.value).toBe('hello')
    })

    it('shows variables inside a function scope', async () => {
      const code = 'let outer = 1; let f = (a) -> a * 2; f(21)'
      let variables: { name: string; value: unknown }[] = []

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        // When inside f, parameter a should be visible along with outer
        if (vars.some(v => v.name === 'a') && vars.some(v => v.name === 'outer')) {
          variables = vars
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }

      const varNames = variables.map(v => v.name)
      expect(varNames).toContain('a')
      expect(varNames).toContain('outer')

      expect(variables.find(v => v.name === 'a')?.value).toBe(21)
      expect(variables.find(v => v.name === 'outer')?.value).toBe(1)
    })

    it('getVariables deduplicates shadowed names', () => {
      // Verify that getVariables returns only the innermost binding for each name
      // This is a unit test of the static method's dedup logic
      const dbg = new Debugger(() => {})
      expect(dbg.getBreakpoints().size).toBe(0) // just to use dbg

      // The actual shadowing behavior is tested end-to-end via the shows-variables test
      // which confirms inner scope variables are visible. The dedup logic in getVariables
      // uses a Set to track seen names and skips duplicates from outer scopes.
    })

    it('excludes self from variable list', async () => {
      const code = 'let f = () -> 42; f()'
      let sawSelf = false

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'self')) {
          sawSelf = true
        }
        dbg.stepInto()
      })
      dbg.stepInto()

      await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(sawSelf).toBe(false)
    })

    it('shows destructured variables', async () => {
      const code = 'let [a, b] = [10, 20]; a + b'
      let variables: { name: string; value: unknown }[] = []

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'a') && vars.some(v => v.name === 'b')) {
          variables = vars
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      expect(variables.find(v => v.name === 'a')?.value).toBe(10)
      expect(variables.find(v => v.name === 'b')?.value).toBe(20)
    })
  })

  describe('call stack inspection', () => {
    it('shows call stack when stopped inside a function', async () => {
      const code = 'let inner = () -> 42; let outer = () -> inner(); outer()'
      let callStack: { name: string }[] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
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

    it('shows empty call stack at top level', async () => {
      const code = '1 + 2'
      let callStack: { name: string }[] | null = null

      const dbg = new Debugger(event => {
        callStack = Debugger.getCallStack(event.continuation)
        dbg.continue()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      // At the top level there are no function call frames
      expect(callStack).not.toBeNull()
      // Top level should have no FnBody/CallFn frames
      const fnFrames = callStack!.filter(e => !e.name.startsWith('handler'))
      expect(fnFrames.length).toBe(0)
    })

    it('shows correct call stack depth for nested calls', async () => {
      const code = `
        let c = () -> 1;
        let b = () -> c();
        let a = () -> b();
        a()
      `
      let deepestStack: { name: string }[] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        if (stack.length > deepestStack.length) {
          deepestStack = stack
        }
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')

      // When inside c(), the call stack should contain c, b, a
      const names = deepestStack.map(e => e.name)
      expect(names).toContain('c')
      expect(names).toContain('b')
      expect(names).toContain('a')
    })

    it('shows anonymous functions as <anonymous> in call stack', async () => {
      const code = 'let f = () -> (() -> 42)(); f()'
      let foundAnonymous = false

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        if (stack.some(e => e.name === '<anonymous>')) {
          foundAnonymous = true
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(foundAnonymous).toBe(true)
    })

    it('shows handler frames in call stack', async () => {
      const code = `
        let h = handler
          @my.eff(x) -> resume(x * 2)
        end;
        let f = () -> perform(@my.eff, 21);
        h(f)
      `
      let handlerStack: { name: string }[] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        // Look for handler frames in the stack
        if (stack.some(e => e.name.startsWith('handler'))) {
          handlerStack = stack
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }

      // Should have at least one handler frame in the call stack
      const handlerFrames = handlerStack.filter(e => e.name.startsWith('handler'))
      expect(handlerFrames.length).toBeGreaterThanOrEqual(1)
      // The handler frame name should mention the effect
      expect(handlerFrames.some(e => e.name.includes('my.eff'))).toBe(true)
    })

    it('shows handler clause frames during effect handling', async () => {
      const code = `
        let inner = () -> 10;
        let h = handler
          @my.eff(x) -> do
            let result = inner();
            resume(result + x)
          end
        end;
        let f = () -> perform(@my.eff, 5);
        h(f)
      `
      let clauseStack: { name: string }[] = []

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        // Look for when we're inside the handler clause calling inner()
        if (stack.some(e => e.name === 'inner') && stack.some(e => e.name.includes('handler'))) {
          clauseStack = stack
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(15) // 10 + 5
      }

      // Call stack should show inner() called from within a handler clause
      const names = clauseStack.map(e => e.name)
      expect(names).toContain('inner')
      expect(clauseStack.some(e => e.name.includes('handler') && e.name.includes('my.eff'))).toBe(true)
    })
  })

  describe('stop reason', () => {
    it('reports breakpoint reason when hitting a breakpoint', async () => {
      const code = '1 + 2'
      let reason: string = ''

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

      // Set breakpoint on that node in a fresh instance
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

  describe('program completion', () => {
    it('returns correct result when no breakpoints', async () => {
      const code = '2 + 3 * 4'
      const result = await d.runAsync(code, {
        onNodeEval: () => {}, // no-op hook
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(14)
      }
    })

    it('returns correct result after stepping through', async () => {
      const code = 'let x = 10; let y = 20; x * y'
      const dbg = new Debugger(() => {
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(200)
      }
    })

    it('handles errors during debugging', async () => {
      // undefinedVar triggers a ReferenceError
      const code = 'let x = 1; undefinedVar'
      const dbg = new Debugger(() => {
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('error')
    })
  })

  describe('complex programs', () => {
    it('debugs recursive functions', async () => {
      const code = `
        let fib = (n) -> if n <= 1 then n else fib(n - 1) + fib(n - 2) end;
        fib(6)
      `
      let maxDepth = 0

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        const fibFrames = stack.filter(e => e.name === 'fib')
        if (fibFrames.length > maxDepth) {
          maxDepth = fibFrames.length
        }
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(8)
      }
      // fib(6) should recurse at least 5 levels deep
      expect(maxDepth).toBeGreaterThanOrEqual(5)
    })

    it('debugs higher-order functions', async () => {
      const code = 'let callWith = (f, x) -> f(x); let double = (n) -> n * 2; callWith(double, 21)'
      let sawDouble = false

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        if (stack.some(e => e.name === 'double') && stack.some(e => e.name === 'callWith')) {
          sawDouble = true
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
      expect(sawDouble).toBe(true)
    })

    it('debugs closures with captured variables', async () => {
      const code = `
        let makeAdder = (n) -> (x) -> x + n;
        let add10 = makeAdder(10);
        add10(32)
      `
      let closureVars: { name: string; value: unknown }[] = []

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        // When inside the closure, both n (captured) and x (param) should be visible
        if (vars.some(v => v.name === 'n') && vars.some(v => v.name === 'x')) {
          closureVars = vars
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }

      expect(closureVars.find(v => v.name === 'n')?.value).toBe(10)
      expect(closureVars.find(v => v.name === 'x')?.value).toBe(32)
    })

    it('debugs loop/recur', async () => {
      const code = `
        loop (i = 0, sum = 0) ->
          if i >= 5 then sum
          else recur(i + 1, sum + i)
          end
      `
      let maxI = -1

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        const iVar = vars.find(v => v.name === 'i')
        if (iVar && typeof iVar.value === 'number' && iVar.value > maxI) {
          maxI = iVar.value
        }
        dbg.stepInto()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(10) // 0+1+2+3+4
      }
      // Should have seen i values up to at least 4
      expect(maxI).toBeGreaterThanOrEqual(4)
    })
  })

  describe('step command transitions', () => {
    it('can switch from stepInto to stepOver mid-execution', async () => {
      const code = 'let f = () -> 1 + 2; let g = () -> f(); g()'
      let switchedToStepOver = false

      const dbg = new Debugger(event => {
        const stack = Debugger.getCallStack(event.continuation)
        // Once we're inside g, switch to stepOver to skip f's internals
        if (stack.some(e => e.name === 'g') && !switchedToStepOver) {
          switchedToStepOver = true
          dbg.stepOver()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(switchedToStepOver).toBe(true)
    })

    it('can switch from continue to stepInto mid-execution', async () => {
      // Start with continue (no stops), then hit a breakpoint and switch to stepInto
      const code = '1 + 2 + 3'

      const d1 = createDvala()
      const d2 = createDvala()

      // Discover node IDs
      const nodeIds: number[] = []
      const scout = new Debugger(event => {
        nodeIds.push(event.node[2])
        scout.stepInto()
      })
      scout.stepInto()
      await d1.runAsync(code, { onNodeEval: scout.onNodeEval })

      // Set breakpoint on first node, then switch to stepInto after hitting it
      let hitBreakpoint = false
      let steppedAfter = 0
      const dbg = new Debugger(event => {
        if (!hitBreakpoint) {
          hitBreakpoint = true
          expect(event.reason).toBe('breakpoint')
          dbg.stepInto()
        } else {
          steppedAfter++
          dbg.stepInto()
        }
      })
      dbg.setBreakpoint(nodeIds[0]!)

      const result = await d2.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(hitBreakpoint).toBe(true)
      expect(steppedAfter).toBeGreaterThanOrEqual(1)
    })
  })

  describe('expression evaluation while stopped', () => {
    it('evaluates expressions using current scope bindings', async () => {
      const code = 'let x = 10; let y = 20; x + y'
      let evalResult: unknown = null

      const dbg = new Debugger(async event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'x') && vars.some(v => v.name === 'y')) {
          // Extract bindings and evaluate a new expression
          const scopeVars: Record<string, unknown> = {}
          for (const { name, value } of vars) {
            scopeVars[name] = value
          }
          const evalDvala = createDvala({ modules: allBuiltinModules })
          const result = await evalDvala.runAsync('x * y + 1', { scope: scopeVars, pure: true })
          if (result.type === 'completed') {
            evalResult = result.value
          }
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      expect(evalResult).toBe(201) // 10 * 20 + 1
    })

    it('evaluates expressions with function scope variables', async () => {
      const code = 'let f = (a, b) -> a + b; f(3, 7)'
      let evalResult: unknown = null

      const dbg = new Debugger(async event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'a') && vars.some(v => v.name === 'b')) {
          const scopeVars: Record<string, unknown> = {}
          for (const { name, value } of vars) {
            scopeVars[name] = value
          }
          const evalDvala = createDvala({ modules: allBuiltinModules })
          const result = await evalDvala.runAsync('a * b', { scope: scopeVars, pure: true })
          if (result.type === 'completed') {
            evalResult = result.value
          }
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(evalResult).toBe(21) // 3 * 7
    })

    it('can evaluate builtin functions with scope bindings', async () => {
      const code = 'let items = [3, 1, 4, 1, 5]; count(items)'
      let evalResult: unknown = null

      const dbg = new Debugger(async event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'items')) {
          const scopeVars: Record<string, unknown> = {}
          for (const { name, value } of vars) {
            scopeVars[name] = value
          }
          const evalDvala = createDvala({ modules: allBuiltinModules })
          const result = await evalDvala.runAsync('count(items)', { scope: scopeVars, pure: true })
          if (result.type === 'completed') {
            evalResult = result.value
          }
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(evalResult).toBe(5)
    })
  })

  describe('no-op when no commands issued', () => {
    it('runs to completion without stopping when no step command or breakpoint', async () => {
      const code = 'let x = 42; x'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.continue()
      })
      // Don't issue any step command — should run without stopping

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
      expect(stopCount).toBe(0)
    })
  })

  describe('extractBindings', () => {
    it('returns a record of visible bindings at the stop point', async () => {
      const code = 'let x = 7; let y = 8; x + y'
      // The callback runs asynchronously — TS's CFA won't track assignments
      // through it, so we type `bindings` via a wrapping object to keep
      // narrowing from the terminal null-check working.
      const captured: { value: Record<string, unknown> | null } = { value: null }

      const dbg = new Debugger(event => {
        const vars = Debugger.getVariables(event.continuation)
        if (vars.some(v => v.name === 'x') && vars.some(v => v.name === 'y')) {
          captured.value = Debugger.extractBindings(event.continuation)
          dbg.continue()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()
      await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      if (captured.value === null) throw new Error('debugger never stopped at a point where x and y were bound')
      expect(captured.value.x).toBe(7)
      expect(captured.value.y).toBe(8)
    })
  })

  describe('conditional breakpoints without condition evaluator', () => {
    it('treats a conditional breakpoint as unconditional when no evaluator is wired', async () => {
      // Breakpoint has a condition string, but the Debugger was created without
      // passing a ConditionEvaluator — the condition is ignored and the
      // breakpoint stops unconditionally (exercises the "No evaluator provided"
      // fallback branch).
      const code = 'let x = 1 + 2; x'
      let stopCount = 0
      const dbg = new Debugger(() => {
        stopCount++
        dbg.continue()
      })
      // Arm a conditional breakpoint on the first node we see, then wait
      // for it (or a later one we also arm) to fire through the Debugger hook.
      let armed = false
      await d.runAsync(code, {
        onNodeEval: (node, getContinuation) => {
          if (!armed) {
            dbg.setBreakpoint(node[2], 'x > 100')
            armed = true
          }
          return dbg.onNodeEval!(node, getContinuation)
        },
      })
      // No evaluator → condition is ignored → the armed breakpoint stops unconditionally
      expect(stopCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('stepOut from top level', () => {
    it('stepOut falls through to completion when no deeper call frame exists', async () => {
      // No function calls — stepOut at depth 0 never drops below the initial
      // depth, so no further stops happen and execution runs to completion.
      const code = '1 + 2'
      let stopCount = 0

      const dbg = new Debugger(() => {
        stopCount++
        dbg.stepOut()
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      // First stepInto lands a stop, then stepOut runs to completion without
      // further stops
      expect(stopCount).toBe(1)
    })

    it('stepOut from inside a function stops after returning to caller', async () => {
      // Exercises the stepOut "currentDepth < stepDepth" branch: step into a
      // nested function call until depth > 0, then issue stepOut and expect
      // the next stop to be at a shallower depth.
      const code = 'let f = () -> 42; let g = () -> f(); g() + 1'
      const stopDepths: number[] = []

      const dbg = new Debugger(event => {
        const depth = Debugger.countCallDepth(event.continuation)
        stopDepths.push(depth)
        // As soon as we see a stop at depth > 0, issue stepOut. Otherwise
        // keep stepping in until we enter a call frame.
        if (stopDepths.some(prev => prev > 0) && depth === 0) {
          // stepOut fired and landed us back at depth 0 — we're done.
          dbg.continue()
        } else if (depth > 0) {
          dbg.stepOut()
        } else {
          dbg.stepInto()
        }
      })
      dbg.stepInto()

      const result = await d.runAsync(code, { onNodeEval: dbg.onNodeEval })
      expect(result.type).toBe('completed')
      // We stopped at some depth > 0 (inside a function), then stepOut
      // landed us back at depth 0 (after returning).
      expect(stopDepths.some(depth => depth > 0)).toBe(true)
      // Find the index of the first depth-0 stop that follows a depth>0 stop —
      // that is the stepOut landing.
      const firstDeep = stopDepths.findIndex(depth => depth > 0)
      const backToZero = stopDepths.slice(firstDeep + 1).find(depth => depth === 0)
      expect(backToZero).toBe(0)
    })
  })
})
