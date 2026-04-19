import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

// Host scope-exit callbacks land in Phase 1+2. These tests anchor the
// runtime behavior described in
// `design/active/2026-04-19_host-scoped-resources.md`. Keep them small
// and focused; the design evolves quickly and large tests are hard to
// update in lockstep.
describe('host scope-exit callbacks', () => {
  it('fires onScopeExit on normal completion of the enclosing handler', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.passthrough(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A")
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    expect(cleanupLog).toEqual(['close-A'])
  })

  it('fires cleanups in LIFO order within one frame', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.passthrough(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.open, "B");
        perform(@my.open, "C")
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    // LIFO: last registered (C) fires first, then B, then A.
    expect(cleanupLog).toEqual(['close-C', 'close-B', 'close-A'])
  })

  it('fires onScopeExit on abort (handler clause that does not resume)', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.bail() -> "bailed" end;
      do with h;
        let handle = perform(@my.open, "X");
        handle;
        perform(@my.bail)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    expect(cleanupLog).toEqual(['close-X'])
  })

  it('awaits async cleanup callbacks sequentially', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.passthrough(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.open, "B")
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(async () => {
              await new Promise(r => setTimeout(r, 10))
              cleanupLog.push(`close-${arg}`)
            })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    expect(cleanupLog).toEqual(['close-B', 'close-A'])
  })

  it('surfaces callback errors as Dvala errors (first error wins)', async () => {
    const result = await dvala.runAsync(`
      let h = handler @my.passthrough(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A")
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { throw new Error(`cleanup failure for ${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    expect(result.type).toBe('error')
    if (result.type === 'error')
      expect(String(result.error)).toContain('cleanup failure for A')
  })

  it('onScopeExit without an enclosing handler throws a clear runtime error', async () => {
    const result = await dvala.runAsync(`
      perform(@my.open, "A")
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { /* never registered */ })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    expect(result.type).toBe('error')
    if (result.type === 'error')
      expect(String(result.error)).toContain('no enclosing Dvala handler frame')
  })
})

describe('host scope-exit runtime restrictions', () => {
  it('refuses ctx.checkpoint while a cleanup is registered', async () => {
    const result = await dvala.runAsync(`
      let h = handler @my.pt(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.checkpointNow, null)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { /* still live at checkpointNow */ })
            resume(`handle-${arg}`)
          },
        },
        {
          pattern: 'my.checkpointNow',
          handler: ({ checkpoint, resume }) => {
            checkpoint('mid-scope')
            resume(null)
          },
        },
      ],
    })
    expect(result.type).toBe('error')
    if (result.type === 'error')
      expect(String(result.error)).toContain('cannot checkpoint')
  })

  it('refuses ctx.suspend while a cleanup is registered', async () => {
    const result = await dvala.runAsync(`
      let h = handler @my.pt(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.stop, null)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { /* still live at suspend */ })
            resume(`handle-${arg}`)
          },
        },
        {
          pattern: 'my.stop',
          handler: ({ suspend }) => {
            suspend({ reason: 'test' })
          },
        },
      ],
    })
    expect(result.type).toBe('error')
    if (result.type === 'error')
      expect(String(result.error)).toContain('cannot suspend')
  })

  it('includes effect-name breakdown in the restriction error message', async () => {
    const result = await dvala.runAsync(`
      let h = handler @my.pt(x) -> resume(x) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.open, "B");
        perform(@db.connect, "X");
        perform(@my.checkpointNow, null)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { /* file */ })
            resume(`handle-${arg}`)
          },
        },
        {
          pattern: 'db.connect',
          handler: ({ resume, onScopeExit }) => {
            onScopeExit(() => { /* db */ })
            resume('conn-X')
          },
        },
        {
          pattern: 'my.checkpointNow',
          handler: ({ checkpoint, resume }) => {
            checkpoint('mid-scope')
            resume(null)
          },
        },
      ],
    })
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      const msg = String(result.error)
      expect(msg).toContain('2 × my.open')
      expect(msg).toContain('1 × db.connect')
    }
  })

  it('inline multi-shot resume within a single clause body fires cleanup once', async () => {
    // Both resumes complete before the enclosing scope exits, so cleanup
    // fires once at the end — not per resume. Per-resume semantics would
    // double-close the file. The multi-shot restriction is for
    // CAPTURED continuations invoked after the frame has discharged,
    // not for inline multi-shot within a single clause body.
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.choose(n) -> (resume(n) + resume(n * 10)) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.choose, 1)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    expect(cleanupLog).toEqual(['close-A'])
  })

  it('cleanups survive a resumed handler (deep reinstallation preserves cleanups)', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let h = handler @my.choose(n) -> resume(n * 10) end;
      do with h;
        perform(@my.open, "A");
        perform(@my.choose, 1)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    expect(cleanupLog).toEqual(['close-A'])
  })

  it('allows checkpoint once cleanups have fired (normal completion of inner handler)', async () => {
    const cleanupLog: string[] = []
    const result = await dvala.runAsync(`
      let inner = handler @my.pt(x) -> resume(x) end;
      let outer = handler @my.pt2(x) -> resume(x) end;
      do with outer;
        do with inner;
          perform(@my.open, "A")
        end;
        perform(@my.checkpointNow, null)
      end
    `, {
      effectHandlers: [
        {
          pattern: 'my.open',
          handler: ({ arg, resume, onScopeExit }) => {
            onScopeExit(() => { cleanupLog.push(`close-${arg}`) })
            resume(`handle-${arg}`)
          },
        },
        {
          pattern: 'my.checkpointNow',
          handler: ({ checkpoint, resume }) => {
            checkpoint('mid-scope')
            resume(null)
          },
        },
      ],
    })
    if (result.type === 'error') throw result.error
    // Inner handler discharged before checkpoint → cleanup fired, restriction doesn't fire.
    expect(cleanupLog).toEqual(['close-A'])
  })
})
