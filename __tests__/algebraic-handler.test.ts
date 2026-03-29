import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { Any } from '../src/interface'

function run(code: string): Any {
  return createDvala().run(code) as Any
}

describe('algebraic handler — handler...end expression', () => {
  it('creates a handler value', () => {
    expect(run('typeOf(handler @dvala.error(msg) -> 0 end)')).toBe('handler')
  })

  it('creates a handler with transform only (identity-like)', () => {
    // Note: `handler end` (empty) is not supported as contextual keyword
    // because it conflicts with `handler` as a variable name.
    // Use transform-only form instead.
    const h = run('handler transform x -> x end')
    expect(h).toBeTruthy()
  })

  it('creates a handler with transform only', () => {
    expect(run('let h = handler transform x -> x * 10 end; h(-> 5)')).toBe(50)
  })

  it('rejects duplicate effect clauses', () => {
    expect(() => run('handler @eff(x) -> x @eff(y) -> y end')).toThrow(/[Dd]uplicate/)
  })
})

describe('algebraic handler — h(-> body) callable', () => {
  it('installs handler around thunk body', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> "caught" end;
      h(-> 0 / 0)
    `)).toBe('caught')
  })

  it('returns body value when no effect fires', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> "caught" end;
      h(-> 42)
    `)).toBe(42)
  })
})

describe('algebraic handler — abort semantics', () => {
  it('clause without resume aborts the handle block', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> "aborted" end;
      h(-> do
        let x = 0 / 0;
        x + 1
      end)
    `)).toBe('aborted')
  })

  it('abort bypasses transform clause', () => {
    expect(run(`
      let h = handler
        @dvala.error(msg) -> { ok: false }
      transform
        x -> { ok: true, data: x }
      end;
      h(-> 0 / 0)
    `)).toEqual({ ok: false })
  })

  it('normal completion applies transform', () => {
    expect(run(`
      let h = handler
        @dvala.error(msg) -> { ok: false }
      transform
        x -> { ok: true, data: x }
      end;
      h(-> 42)
    `)).toEqual({ ok: true, data: 42 })
  })
})

describe('algebraic handler — resume', () => {
  it('resume continues at perform site with given value', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> resume(0) end;
      h(-> (0 / 0) + 1)
    `)).toBe(1)
  })

  it('resume returns the continuation result', () => {
    expect(run(`
      let h = handler
        @my.eff(v) -> do
          let result = resume(v * 2);
          result
        end
      end;
      h(-> perform(@my.eff, 5) + 10)
    `)).toBe(20)
  })

  it('resume returns transformed result', () => {
    expect(run(`
      let h = handler
        @my.eff(v) -> resume(v)
      transform
        x -> x * 10
      end;
      h(-> perform(@my.eff, 3))
    `)).toBe(30)
  })

  it('resume with null argument', () => {
    expect(run(`
      let h = handler @my.eff() -> resume(null) end;
      h(-> do perform(@my.eff); 42 end)
    `)).toBe(42)
  })

  it('resume with no argument defaults to null', () => {
    expect(run(`
      let h = handler @my.eff() -> resume() end;
      h(-> do perform(@my.eff); 99 end)
    `)).toBe(99)
  })
})

describe('algebraic handler — one-shot constraint', () => {
  it('calling resume twice throws a runtime error', () => {
    expect(() => run(`
      let h = handler @my.eff(x) -> do let a = resume(1); resume(2) end end;
      h(-> perform(@my.eff, 0))
    `)).toThrow(/one-shot/)
  })
})

describe('algebraic handler — transform clause', () => {
  it('applies to normal completion', () => {
    expect(run(`
      let h = handler transform x -> x * 10 end;
      h(-> 1 + 2)
    `)).toBe(30)
  })

  it('applies inside resume (reinstalled handler)', () => {
    expect(run(`
      let h = handler
        @my.eff(x) -> resume(x)
      transform
        x -> x * 10
      end;
      h(-> 42)
    `)).toBe(420)
  })

  it('identity transform when not specified', () => {
    expect(run(`
      let h = handler @my.eff(x) -> resume(x) end;
      h(-> perform(@my.eff, 42))
    `)).toBe(42)
  })
})

describe('algebraic handler — deep reinstallation', () => {
  it('handler is reinstalled around continuation on resume', () => {
    // From design doc trace: result should be 3002
    expect(run(`
      let h = handler
        @eff(v) -> do
          let result = resume(v);
          result + 1
        end
      transform
        x -> x * 100
      end;
      h(-> do
        let x = perform(@eff, 10);
        let y = perform(@eff, 20);
        x + y
      end)
    `)).toBe(3002)
  })

  it('each resume creates fresh handler scope', () => {
    expect(run(`
      let counter = handler
        @inc() -> do
          let result = resume(null);
          result + 1
        end
      end;
      counter(-> do
        perform(@inc);
        perform(@inc);
        perform(@inc);
        0
      end)
    `)).toBe(3)
  })
})

describe('algebraic handler — implicit propagation', () => {
  it('unmatched effects propagate to outer handler', () => {
    expect(run(`
      let inner = handler @inner(v) -> resume(v) end;
      let outer = handler @outer(v) -> resume(v * 3) end;
      outer(-> inner(-> do
        let x = perform(@inner, 10);
        let y = perform(@outer, 20);
        x + y
      end))
    `)).toBe(70)
  })
})

describe('algebraic handler — intercept and forward', () => {
  it('clause body can re-perform to outer handler', () => {
    expect(run(`
      let logger = handler
        @fetch(url) -> do
          let result = perform(@fetch, url);
          resume(result)
        end
      end;
      let fetcher = handler
        @fetch(url) -> resume("data:" ++ url)
      end;
      fetcher(-> logger(-> perform(@fetch, "/users")))
    `)).toBe('data:/users')
  })
})

describe('algebraic handler — pure state threading', () => {
  it('accumulates log messages without mutation', () => {
    expect(run(`
      let h = handler
        @log(msg) -> do
          let [result, logs] = resume(null);
          [result, [msg, ...logs]]
        end
      transform
        x -> [x, []]
      end;
      h(-> do
        perform(@log, "a");
        perform(@log, "b");
        42
      end)
    `)).toEqual([42, ['a', 'b']])
  })
})

describe('algebraic handler — resume as first-class value', () => {
  it('bare resume returns a callable', () => {
    expect(run(`
      let h = handler
        @my.eff(x) -> do
          let r = resume;
          r(x * 2)
        end
      end;
      h(-> perform(@my.eff, 5))
    `)).toBe(10)
  })

  it('resume outside handler clause throws', () => {
    expect(() => run('resume(42)')).toThrow(/handler clause/)
  })

  it('bare resume outside handler clause throws', () => {
    expect(() => run('resume')).toThrow(/handler clause/)
  })
})

describe('algebraic handler — error handling', () => {
  it('dvala.error is catchable as named clause', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> "caught" end;
      h(-> 0 / 0)
    `)).toBe('caught')
  })

  it('dvala.error clause can resume', () => {
    expect(run(`
      let h = handler @dvala.error(msg) -> resume(0) end;
      h(-> (0 / 0) + 1)
    `)).toBe(1)
  })
})

// =========================================================================
// Phase 1c: with h; statement
// =========================================================================

describe('with h; — basic installation', () => {
  it('installs handler for rest of block', () => {
    expect(run(`
      do
        let h = handler @dvala.error(msg) -> "caught" end;
        with h;
        0 / 0
      end
    `)).toBe('caught')
  })

  it('returns body value when no effect fires', () => {
    expect(run(`
      do
        let h = handler @dvala.error(msg) -> "caught" end;
        with h;
        42
      end
    `)).toBe(42)
  })

  it('handler applies transform on normal completion', () => {
    expect(run(`
      do
        let h = handler transform x -> x * 100 end;
        with h;
        42
      end
    `)).toBe(4200)
  })

  it('with non-handler value throws runtime error', () => {
    expect(() => run(`
      do
        with 42;
        1
      end
    `)).toThrow(/handler value/)
  })
})

describe('with h; — flat stacking', () => {
  it('multiple handlers stack without nesting', () => {
    expect(run(`
      do
        let h1 = handler @a() -> resume("A") end;
        let h2 = handler @b() -> resume("B") end;
        with h1;
        with h2;
        perform(@a) ++ perform(@b)
      end
    `)).toBe('AB')
  })

  it('inner handler takes precedence for same effect', () => {
    expect(run(`
      do
        let h1 = handler @eff() -> resume("outer") end;
        let h2 = handler @eff() -> resume("inner") end;
        with h1;
        with h2;
        perform(@eff)
      end
    `)).toBe('inner')
  })

  it('unmatched effects propagate through stacked handlers', () => {
    expect(run(`
      do
        let h1 = handler @a() -> resume("A") end;
        let h2 = handler @b() -> resume("B") end;
        with h2;
        with h1;
        perform(@b)
      end
    `)).toBe('B')
  })
})

describe('with h; — interleaving with let', () => {
  it('handlers can depend on earlier bindings', () => {
    expect(run(`
      do
        let x = 10;
        let h = handler @my.eff(v) -> resume(v + x) end;
        with h;
        let y = perform(@my.eff, 5);
        y * 2
      end
    `)).toBe(30)
  })

  it('let bindings after with are in handler scope', () => {
    expect(run(`
      do
        let h = handler @dvala.error(msg) -> resume(0) end;
        with h;
        let x = 0 / 0;
        let y = x + 10;
        y
      end
    `)).toBe(10)
  })
})

describe('with h; — recur inside loops (no function boundary)', () => {
  it('recur works inside with h; block', () => {
    expect(run(`
      do
        let h = handler @dvala.error(msg) -> resume(0) end;
        with h;
        loop (i = 0, acc = 0) ->
          if i >= 5 then acc
          else recur(i + 1, acc + i)
          end
      end
    `)).toBe(10)
  })

  it('handler catches effects inside recur loop', () => {
    expect(run(`
      do
        let counter = handler
          @inc() -> do
            let result = resume(null);
            result + 1
          end
        end;
        with counter;
        loop (i = 0) ->
          if i >= 3 then 0
          else do
            perform(@inc);
            recur(i + 1)
          end
          end
      end
    `)).toBe(3)
  })
})

describe('with h; — inline handler expression', () => {
  it('supports inline handler...end after with', () => {
    expect(run(`
      do
        with (handler @dvala.error(msg) -> 0 end);
        0 / 0
      end
    `)).toBe(0)
  })
})
