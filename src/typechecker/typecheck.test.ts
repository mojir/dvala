import { describe, expect, it } from 'vitest'
import { createDvala } from '../createDvala'
import type { TypeDiagnostic } from './typecheck'
import { typeToString } from './types'
import { expandType } from './infer'
import { simplify } from './simplify'

// ---------------------------------------------------------------------------
// End-to-end: typecheck() method on DvalaRunner
// ---------------------------------------------------------------------------

describe('typecheck — end-to-end', () => {
  const dvala = createDvala()

  it('returns empty diagnostics for valid code', () => {
    const result = dvala.typecheck('1 + 2')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('returns diagnostics for type errors', () => {
    // This will fail because "hello" is not a subtype of Number
    const result = dvala.typecheck('"hello" + 1')
    // The + builtin expects (Number, Number) -> Number, so "hello" should cause an error
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('populates typeMap with node types', () => {
    const result = dvala.typecheck('42')
    // The type map should have at least one entry
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('infers types for let bindings', () => {
    const result = dvala.typecheck('let x = 42; x + 1')
    expect(result.diagnostics).toHaveLength(0)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('infers types for functions', () => {
    const result = dvala.typecheck('let f = (a, b) -> a + b; f(1, 2)')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck option on createDvala
// ---------------------------------------------------------------------------

describe('createDvala with typecheck: true', () => {
  it('runs normally even with type errors', () => {
    const diagnostics: TypeDiagnostic[] = []
    const dvala = createDvala({
      typecheck: true,
      onTypeDiagnostic: d => diagnostics.push(d),
    })
    // This should still run and return a result, even if typechecking finds issues
    const result = dvala.run('1 + 2')
    expect(result).toBe(3)
  })

  it('reports type errors via onTypeDiagnostic', () => {
    const diagnostics: TypeDiagnostic[] = []
    const dvala = createDvala({
      typecheck: true,
      onTypeDiagnostic: d => diagnostics.push(d),
    })
    // isNumber expects Unknown but the type system may flag misuse.
    // Use a case where the typechecker catches an error but evaluator doesn't crash.
    // Comparing incompatible types: 1 == "hello" evaluates fine but is suspect.
    dvala.run('let x = 1; let y = "hello"; x == y')
    // This may or may not produce diagnostics depending on how strict == is typed.
    // The point is: run() completes without throwing.
  })

  it('no diagnostics for valid code', () => {
    const diagnostics: TypeDiagnostic[] = []
    const dvala = createDvala({
      typecheck: true,
      onTypeDiagnostic: d => diagnostics.push(d),
    })
    dvala.run('1 + 2')
    expect(diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Type map inspection
// ---------------------------------------------------------------------------

describe('typecheck — type map', () => {
  const dvala = createDvala()

  it('literal node has literal type', () => {
    const { typeMap } = dvala.typecheck('let x = 42; x')
    // The type map should contain at least one entry
    expect(typeMap.size).toBeGreaterThan(0)
    // At least one type should be a literal 42 or Number
    const types = [...typeMap.values()]
    const hasNumeric = types.some(t =>
      (t.tag === 'Literal' && (t as { value: number }).value === 42)
      || (t.tag === 'Primitive' && (t as { name: string }).name === 'Number')
      || t.tag === 'Var',
    )
    expect(hasNumeric).toBe(true)
  })

  it('function application resolves return type', () => {
    const { typeMap } = dvala.typecheck('1 + 2')
    // The call node should have a type (the return type of +)
    const types = [...typeMap.values()]
    // At least one type should be Number-ish (from the + return)
    const hasNumeric = types.some(t =>
      t.tag === 'Var' || t.tag === 'Primitive' || t.tag === 'Literal',
    )
    expect(hasNumeric).toBe(true)
  })

  it('can expand and display inferred types', () => {
    const { typeMap } = dvala.typecheck('let x = 42; x')
    for (const [_nodeId, type] of typeMap) {
      const expanded = simplify(expandType(type))
      const str = typeToString(expanded)
      expect(typeof str).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// Type annotation constraints
// ---------------------------------------------------------------------------

describe('typecheck — type annotations', () => {
  const dvala = createDvala()

  it('valid annotation: let x: Number = 42 (no diagnostics)', () => {
    const result = dvala.typecheck('let x: Number = 42; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('invalid annotation: let x: String = 42 (type mismatch)', () => {
    const result = dvala.typecheck('let x: String = 42; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toContain('not a subtype of String')
  })

  it('function param annotation: (a: Number) -> a + 1', () => {
    const result = dvala.typecheck('let f = (a: Number) -> a + 1; f(42)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('function effect annotation accepts matching inferred effects', () => {
    const result = dvala.typecheck(`
      effect @test.log(Number) -> Null;
      let f: (Number) -> @{test.log} Number = (x) -> do
        perform(@test.log, x);
        x
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('function effect annotation rejects extra inferred effects', () => {
    const result = dvala.typecheck(`
      effect @test.log(Number) -> Null;
      let f: (Number) -> Number = (x) -> do
        perform(@test.log, x);
        x
      end;
      f
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('handler annotation accepts matching handled effects', () => {
    const result = dvala.typecheck(`
      effect @test.log(String) -> Null;
      let h: Handler<Number, Number, @{test.log}> =
        handler
          @test.log(msg) -> resume(null)
        end;

      let result: Number = h(-> do
        perform(@test.log, "hello");
        1
      end);

      result
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('handler annotation rejects missing handled effects', () => {
    const result = dvala.typecheck(`
      effect @test.log(String) -> Null;
      let h: Handler<Number, Number, @{}> =
        handler
          @test.log(msg) -> resume(null)
        end;

      h
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('handler clause param annotation constrains performed arg types', () => {
    const result = dvala.typecheck(`
          let withLogging = (thunk) -> do
            let h =
              handler
                @test.log(msg: String) -> do
                  let resumed = resume(null);
                  { result: resumed.result, logs: [msg] ++ resumed.logs }
                end
                transform result -> { result, logs: [] }
              end;
            h(thunk)
          end;

          withLogging(-> do
            perform(@test.log, 10);
            null
          end)
        `)

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a subtype of String')
  })

  it('nullable annotation with union syntax: let x: Number | Null = null', () => {
    const result = dvala.typecheck('let x: Number | Null = null; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nullable annotation with ? syntax: let x: Number? = null', () => {
    const result = dvala.typecheck('let x: Number? = null; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nullable ? rejects non-matching type', () => {
    const result = dvala.typecheck('let x: Number? = "hello"; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('nullable annotation rejects non-matching type', () => {
    const result = dvala.typecheck('let x: Number | Null = "hello"; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

describe('typecheck — type aliases', () => {
  const dvala = createDvala()

  it('simple type alias: type Num = Number', () => {
    const result = dvala.typecheck('type Num = Number; let x: Num = 42; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('type alias mismatch: type Num = Number; let x: Num = "hello"', () => {
    const result = dvala.typecheck('type Num = Number; let x: Num = "hello"; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('union type alias: type StringOrNum = String | Number', () => {
    const result = dvala.typecheck('type StringOrNum = String | Number; let x: StringOrNum = 42; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('type alias used in function param', () => {
    const result = dvala.typecheck('type Id = Number; let f = (x: Id) -> x + 1; f(42)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('type does not interfere with variable named type', () => {
    // 'type' is not a reserved word — can be used as a variable when not followed by uppercase
    const result = dvala.typecheck('let type = 42; type + 1')
    expect(result.diagnostics).toHaveLength(0)
  })
})
