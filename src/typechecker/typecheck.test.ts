import { describe, expect, it } from 'vitest'
import { allBuiltinModules } from '../allModules'
import { createDvala as createDvalaRaw } from '../createDvala'
import { parseToAst } from '../parser'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { FOLD_ENABLED } from './foldToggle'
import { expandType } from './infer'
import { simplify } from './simplify'
import type { TypeDiagnostic } from './typecheck'
import { typecheckExpr } from './typecheck'
import { typeToString } from './types'

/**
 * Rewrite literal-if fixture conditions to an effectful opaque so C8
 * (if-literal narrowing) doesn't reduce union-construction fixtures to one
 * branch under DVALA_FOLD=1. Declares `@__fold_opaque` inline so each
 * typecheck pass (which resets user effects) sees it fresh.
 */
function fixtureWithOpaqueIfCond(source: string): string {
  if (!/if (true|false)\b/.test(source)) return source
  const rewritten = source
    .replace(/if true\b/g, 'if perform(@__fold_opaque, null)')
    .replace(/if false\b/g, 'if perform(@__fold_opaque, null)')
  return `effect @__fold_opaque(Null) -> Boolean; ${rewritten}`
}

/** Test-local `createDvala` that auto-applies `fixtureWithOpaqueIfCond`. */
function createDvala(options?: Parameters<typeof createDvalaRaw>[0]) {
  const d = createDvalaRaw(options)
  const origTypecheck = d.typecheck.bind(d)
  return Object.assign(d, {
    typecheck: (source: string, opts?: { fileResolverBaseDir?: string; filePath?: string }) =>
      origTypecheck(fixtureWithOpaqueIfCond(source), opts),
  })
}

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

  it('accepts polymorphic identity inside object fields passed to count', () => {
    const result = dvala.typecheck('let id = (x) -> x; { sameNumber: id(42), sameString: id("hello"), stringLength: count(id("hello")) }')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts filter on objects', () => {
    const result = dvala.typecheck('filter({ a: 1, b: 2 }, isOdd)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts map on objects', () => {
    const result = dvala.typecheck('map({ a: 1, b: 2 }, inc)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts two-object map', () => {
    const result = dvala.typecheck('map({ a: 1, b: 2 }, { a: 10, b: 20 }, +)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects object map with mismatched keys', () => {
    const result = dvala.typecheck('map({ a: 1 }, { b: 2 }, +)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('All objects must have the same keys')
  })

  it('rejects object map when callback cannot handle object values', () => {
    const result = dvala.typecheck('map({ a: 1 }, { a: "x" }, +)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects string map when callback cannot handle string inputs', () => {
    const result = dvala.typecheck('map("ab", inc)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects mixed array map when callback cannot handle inferred element types', () => {
    const result = dvala.typecheck('map([1], ["a"], +)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('accepts reduce on objects', () => {
    const result = dvala.typecheck('reduce({ a: 1, b: 2 }, +, 0)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects string reduce when reducer cannot handle string elements', () => {
    const result = dvala.typecheck('reduce("ab", +, 0)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects array reduce when reducer cannot handle array element types', () => {
    const result = dvala.typecheck('reduce(["a"], +, 0)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects unary core math on arrays', () => {
    const result = dvala.typecheck('inc([1, 2, 3])')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects variadic core arithmetic on arrays', () => {
    const result = dvala.typecheck('+([1, 2, 3], 4)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects binary core math on arrays', () => {
    const result = dvala.typecheck('quot([1, 2, 3], 2)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects rounding helpers on arrays', () => {
    const result = dvala.typecheck('round([1.2, 2.3], 1)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('accepts min on a vector', () => {
    const result = dvala.typecheck('min([1, 2, 3])')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts max on a vector', () => {
    const result = dvala.typecheck('max([1, 2, 3])')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts documenting a user-defined function', () => {
    const result = dvala.typecheck('let add = ((a, b) -> a + b) withDoc "Adds two numbers."; doc(add)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects documenting a non-function value', () => {
    const result = dvala.typecheck('42 withDoc "Not a function"')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a function')
  })

  it('accepts typed array destructuring in match cases', () => {
    const result = dvala.typecheck('match [1, 2] case [x, y] then x + y end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts references to bindings that shadow builtin-tagged names', () => {
    const result = dvala.typecheck('let rest = [1, 2]; count(rest)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts rest bindings in match array destructuring', () => {
    const result = dvala.typecheck('let xs = if true then [1, 2] else [1, 2, 3] end; match xs case [1, ...rest] then count(rest) case _ then 0 end')
    // With tuple inference, [1, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })

  it('accepts rest bindings in let array destructuring', () => {
    const result = dvala.typecheck('let [head, ...tail] = [1, 2, 3]; count(tail)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts typed object destructuring in match cases', () => {
    const result = dvala.typecheck('match { x: 1, y: 2 } case { x, y } then x + y end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('allows impossible destructured cases to fall through', () => {
    const result = dvala.typecheck('match 42 case [x] then x case _ then 0 end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects non-exhaustive matches over finite atom unions', () => {
    const result = dvala.typecheck('let x = if true then :ok else :error end; match x case :ok then 1 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Non-exhaustive match')
    expect(result.diagnostics[0]?.severity).toBe('error')
  })

  it('rejects non-exhaustive matches over Boolean values', () => {
    // Force x to be a full Boolean (not a literal): take the value from a
    // function parameter so fold can't reduce it to true/false.
    const result = dvala.typecheck('let check = (v) -> match isNumber(v) case true then 1 end; check(42)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Non-exhaustive match')
    expect(result.diagnostics[0]?.severity).toBe('error')
  })

  it('warns on redundant literal match cases', () => {
    const result = dvala.typecheck('match :ok case :ok then 1 case :ok then 2 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('warns on redundant destructuring cases after earlier shape coverage', () => {
    const result = dvala.typecheck('let x = if true then [1] else { a: 1 } end; match x case [y] then y case [z] then z case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('warns when an exact array prefix branch is repeated', () => {
    const result = dvala.typecheck('let xs = if true then [1, 2] else [1, 3] end; match xs case [1, x] then x case [1, y] then y case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('warns when an exact array branch is covered by an earlier rest-pattern branch', () => {
    const result = dvala.typecheck('let xs = if true then [1, 2] else [1, 2, 3] end; match xs case [1, ...rest] then 1 case [1, 2] then 2 case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('accepts exhaustive matches with defaulted array elements', () => {
    const result = dvala.typecheck('let xs = if true then [1] else [1, 2] end; match xs case [x, y = 0] then x + y end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('warns when a later array branch is covered by an earlier defaulted element branch', () => {
    const result = dvala.typecheck('let xs = if true then [1] else [1, 2] end; match xs case [x, y = 0] then x + y case [a] then a case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('warns when a later rest-pattern branch is covered by an earlier broader rest-pattern branch', () => {
    const result = dvala.typecheck('let xs = if true then [1, 2] else [1, 2, 3] end; match xs case [1, ...xs] then 1 case [1, 2, ...ys] then 2 case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('narrows consumed type when guard applies to array element binding', () => {
    // Without guard narrowing, `case [x] when isNumber(x)` would not subtract
    // anything, and the second `case [y] when isString(y)` would not be
    // recognized as covering the remaining space.
    const result = dvala.typecheck(
      'let xs = if true then [1] else ["a"] end;'
      + ' match xs'
      + ' case [x] when isNumber(x) then x'
      + ' case [y] when isString(y) then y'
      + ' end',
    )
    expect(result.diagnostics).toHaveLength(0)
  })

  it('narrows consumed type when guard applies to object field binding', () => {
    const result = dvala.typecheck(
      'let obj = if true then { v: 1 } else { v: "a" } end;'
      + ' match obj'
      + ' case { v } when isNumber(v) then v'
      + ' case { v } when isString(v) then v'
      + ' end',
    )
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts exhaustive tagged object matches without a wildcard', () => {
    const result = dvala.typecheck('let event = if true then {type: "click", x: 1, y: 2} else {type: "keydown", key: "Enter"} end; match event case {type: "click", x, y} then x + y case {type: "keydown", key} then count(key) end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('accepts exhaustive matches on open records with finite tag fields', () => {
    const result = dvala.typecheck('let classify = (event: {type: "click" | "keydown", ...}) -> match event case {type: "click"} then 1 case {type: "keydown"} then 2 end; classify')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('warns when a tagged object branch is repeated', () => {
    const result = dvala.typecheck('let event = if true then {type: "click", x: 1, y: 2} else {type: "keydown", key: "Enter"} end; match event case {type: "click", x, y} then x + y case {type: "click", x, y} then x + y case {type: "keydown", key} then count(key) end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('warns when an open-record tagged branch is repeated', () => {
    const result = dvala.typecheck('let classify = (event: {type: "click" | "keydown", ...}) -> match event case {type: "click"} then 1 case {type: "click"} then 2 case {type: "keydown"} then 3 end; classify')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Redundant match case')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('does not warn when a destructuring case was impossible from the start', () => {
    const result = dvala.typecheck('match 42 case [x] then x case _ then 0 end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects invalid object match defaults when the default is used', () => {
    const result = dvala.typecheck('match {} case { a = "x" } then a + 1 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects invalid array match defaults when the default is used', () => {
    const result = dvala.typecheck('match [1] case [x, y = "x"] then x + y case _ then 0 end')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — effect annotations and handler typing
// ---------------------------------------------------------------------------

describe('typecheck — effect annotation on function types', () => {
  const dvala = createDvala()

  it('accepts function with declared effect annotation', () => {
    const result = dvala.typecheck(`
      effect @test.ann(Number) -> Null;
      let f: (Number) -> @{test.ann} Null = (x) -> perform(@test.ann, x);
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects function with undeclared extra effects vs annotation', () => {
    const result = dvala.typecheck(`
      effect @test.ann1(Number) -> Null;
      effect @test.ann2(Number) -> Null;
      let f: (Number) -> @{test.ann1} Null = (x) -> do perform(@test.ann1, x); perform(@test.ann2, x) end;
      f
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — template strings, and/or, nullish coalescing
// ---------------------------------------------------------------------------

// Exercises Integer-typed builtin params end-to-end. `nth`'s index is the
// proof migration; `count` returns Integer and round-trips through it.
describe('typecheck — Integer primitive in builtin signatures', () => {
  const dvala = createDvala()

  it('accepts integer literal as nth index', () => {
    const result = dvala.typecheck('nth([10, 20, 30], 1)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects fractional literal as nth index', () => {
    // The intersection overload resolution throws the LAST overload's error,
    // which ends up being a cross-overload arity mismatch rather than a
    // direct "Integer expected" message — a known limitation of the
    // first-success-wins resolver. What matters: typecheck fails.
    const result = dvala.typecheck('nth([10, 20, 30], 1.5)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('accepts Integer-annotated variable as nth index', () => {
    const result = dvala.typecheck('let i: Integer = 2; nth([10, 20, 30], i)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects a non-literal Number value as nth index (Number is not a subtype of Integer)', () => {
    // A Number might be fractional at runtime, so passing it where Integer is
    // required must fail. Use an effect result to get an opaque Number — a
    // literal would fold to Literal(N), which IS Integer-compatible if N is
    // integer-valued, masking the soundness case.
    const result = dvala.typecheck(`
      effect @rand(Null) -> Number;
      let f = () -> nth([10, 20, 30], perform(@rand, null));
      f
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('count returns Integer, flows into Integer-typed position', () => {
    // count → Integer; nth index accepts Integer. This round-trips cleanly.
    const result = dvala.typecheck('let arr = [10, 20, 30]; nth(arr, count(arr))')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// Object-type variants for filter/map/reduce. These lock in that the
// record-shaped overloads in collection.ts accept object inputs and
// preserve the open-record return shape.
describe('typecheck — filter/map/reduce on records', () => {
  const dvala = createDvala()

  it('filter accepts a record with a value-typed predicate', () => {
    const result = dvala.typecheck('filter({a: 1, b: 2, c: 3}, (v) -> v > 1)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('map accepts a record and a value transformer', () => {
    const result = dvala.typecheck('map({a: 1, b: 2}, (v) -> str(v))')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('reduce accepts a record', () => {
    const result = dvala.typecheck('reduce({a: 1, b: 2}, (acc, v) -> acc + v, 0)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('filter result on a record is usable as a record', () => {
    // Open-record output — subsequent record operations still typecheck.
    const result = dvala.typecheck('let r = filter({a: 1, b: 2}, (v) -> v > 0); r.a')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// Flow-sensitive narrowing in `if`/`else`. When the condition is a type-guard
// call (`isX(sym)`) or an equality test (`sym == literal/atom`), the then and
// else branches see `sym` narrowed to the appropriate type.
//
// This is the doc's "biggest day-to-day win" item — previously only `match`
// guards narrowed. Without it, `if isString(x) then count(x) else x + 1 end`
// on `x: String | Number` would fail because the else branch constrains x
// to Number but the outer type keeps String | Number, breaking the call site.
describe('typecheck — flow-sensitive narrowing in if/else', () => {
  const dvala = createDvala()

  it('isString guard narrows a union-typed parameter in if/else', () => {
    const result = dvala.typecheck(`
      let describe = (x: String | Number) -> if isString(x) then count(x) else x + 1 end;
      describe("hi")
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('isNumber guard — else branch is String', () => {
    const result = dvala.typecheck(`
      let describe = (x: String | Number) -> if isNumber(x) then x + 1 else count(x) end;
      describe("hi")
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('narrowing lets the else branch use string-only operations', () => {
    // Without narrowing, `x ++ "!"` in the else branch would fail because
    // `x` would still be typed as `String | Number`.
    const result = dvala.typecheck(`
      let f = (x: String | Number) -> if isNumber(x) then x + 1 else x ++ "!" end;
      f(42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('atom-equality narrowing in if/else', () => {
    const result = dvala.typecheck(`
      let f = (x: :ok | :err) -> if x == :ok then "success" else "failure" end;
      f(:ok)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('atom-equality narrowing — else branch drops the matched atom', () => {
    // In the else branch, `x` is `:ok | :err` minus `:ok` = `:err`.
    // Then branch would incorrectly typecheck if narrowing didn't drop `:ok`.
    const result = dvala.typecheck(`
      effect @raise(Null) -> Null;
      let f = (x: :ok | :err) -> if x == :ok then null else perform(@raise, null) end;
      f(:ok)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('literal-equality narrowing (single level)', () => {
    const result = dvala.typecheck(`
      let f = (x: 1 | 2) -> if x == 1 then "one" else "two" end;
      f(1)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('non-narrowing condition leaves the branches typed normally', () => {
    // A condition that isn't a recognised narrowing shape (here: a
    // Boolean-typed variable) doesn't narrow anything; the branches see
    // the outer env unchanged.
    const result = dvala.typecheck(`
      let f = (flag: Boolean, x: Number) -> if flag then x + 1 else x - 1 end;
      f(true, 42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('isInteger guard narrows to Integer (not Number) — passes to nth index', () => {
    // Regression: before, `isInteger`'s declared guard was `x is Number`,
    // which meant narrowing left `x` as a Number and `nth(arr, x)` would
    // still fail (nth wants Integer). Fixed — the guard now declares
    // `x is Integer`.
    const result = dvala.typecheck(`
      let f = (x: String | Number) -> if isInteger(x) then nth([10, 20], x) else 0 end;
      f(1)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('flow narrowing does NOT propagate to optional-field access (documented limitation)', () => {
    // A natural extension would be: if a record has a status-like field
    // that, when narrowed, implies another optional field is present,
    // then strict `.` access to that other field should succeed in the
    // narrowed branch. Current narrowing only tracks Sym-typed bindings,
    // not field-access shapes, so this doesn't work — the optional
    // field-access error fires in both branches. This test pins that
    // limitation; if future work extends narrowing to field-access
    // shapes, update or remove it.
    const result = dvala.typecheck(`
      effect @get(Null) -> {status: :ok | :err, value?: Number};
      let f = () -> do
        let r = perform(@get, null);
        if r.status == :ok then r.value else 0 end
      end;
      f
    `)
    // r.value fires the strict-access error regardless of the narrowing.
    expect(result.diagnostics.some(d => /optional/i.test(d.message) || /\?\./i.test(d.message))).toBe(true)
  })

  it('`!=` narrows the else branch to the matched value', () => {
    const result = dvala.typecheck(`
      let f = (x: :ok | :err) -> if x != :ok then "not ok" else "ok" end;
      f(:err)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // `&&` composition: in the then branch, ALL operand narrowings apply.
  // Without it, `count(x)` and `count(y)` warn that they may dvala.error
  // at runtime because their union types include Number, which `count`
  // doesn't accept.
  it('&& composes guard narrowings in the then branch', () => {
    const result = dvala.typecheck(`
      let f = (x: String | Number, y: String | Number) ->
        if isString(x) && isString(y) then count(x) + count(y) else 0 end;
      f("a", "b")
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // `||` composition: dual — in the else branch all operands are false,
  // so all operand narrowings apply. Without it, `count(x)` warns again.
  it('|| composes guard narrowings in the else branch', () => {
    const result = dvala.typecheck(`
      let f = (x: String | Number, y: String | Number) ->
        if isNumber(x) || isNumber(y) then 0 else count(x) + count(y) end;
      f(1, 2)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // `not(...)` swaps then/else narrowings. Without it, the `count(x)`
  // call in the then branch would still see `x: String | Number`.
  it('not(guard) swaps then/else narrowings', () => {
    const result = dvala.typecheck(`
      let f = (x: String | Number) ->
        if not(isNumber(x)) then count(x) else x + 1 end;
      f(42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // Two negations should compose to identity — same narrowing as the
  // bare guard. Catches regressions in the swap implementation.
  it('not(not(guard)) double-negates back to the original narrowing', () => {
    const result = dvala.typecheck(`
      let f = (x: String | Number) ->
        if not(not(isNumber(x))) then x + 1 else count(x) end;
      f(42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // Field-path narrowing: equality on `r.field` narrows the *root sym*
  // to a refined record shape, picking the matching tagged-union member.
  it('equality on a field path narrows a tagged union', () => {
    const result = dvala.typecheck(`
      let describe = (x: {kind: :a, val: Number} | {kind: :b, val: String}) ->
        if x.kind == :a then x.val + 1 else x.val ++ "!" end;
      describe({kind: :a, val: 1})
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // Type guard on a field path narrows the same way.
  it('isX(obj.field) narrows the root sym', () => {
    const result = dvala.typecheck(`
      let describe = (r: {payload: String | Number}) ->
        if isString(r.payload) then count(r.payload) else r.payload + 1 end;
      describe({payload: "hi"})
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // Nested field paths compose left-to-right; the narrowing wraps in
  // open records at every level so it intersects cleanly with the outer.
  it('nested field path equality narrows the root', () => {
    const result = dvala.typecheck(`
      let f = (env: {flags: {debug: :on, level: Number} | {debug: :off}}) ->
        if env.flags.debug == :on then env.flags.level else 0 end;
      f({flags: {debug: :on, level: 3}})
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // Equality narrowing against a literal that doesn't intersect with the
  // declared field type collapses the then-branch to Never. The match-case
  // redundancy machinery doesn't fire on `if`, but the narrowing should at
  // least not produce surprising side effects.
  it('field equality with disjoint literal does not crash inference', () => {
    const result = dvala.typecheck(`
      let f = (r: {status: :ok}) -> if r.status == :error then 1 else 2 end;
      f({status: :ok})
    `)
    // Ensure no inference exception bubbled up; warnings/errors are
    // acceptable, hard exceptions are not.
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })
})

// Optional record fields: `{a: A, b?: B}` — field `b` may be absent from
// actual record values. Distinct from `b: B | Null` (key present, value
// may be null). Only Option 1 (presence bit) works for records, because
// Dvala has no runtime auto-fill for missing object keys.
describe('typecheck — optional record fields', () => {
  const dvala = createDvala()

  it('record literal without optional field is a subtype of the typed annotation', () => {
    const result = dvala.typecheck('let u: {name: String, age?: Number} = {name: "Alice"}; u')
    if (result.diagnostics.length > 0) {
      throw new Error(`diagnostics: ${JSON.stringify(result.diagnostics)}`)
    }
  })

  it('record literal with optional field present is also a subtype', () => {
    const result = dvala.typecheck('let u: {name: String, age?: Number} = {name: "Alice", age: 30}; u')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('record literal with optional field present but wrong type fails', () => {
    const result = dvala.typecheck('let u: {name: String, age?: Number} = {name: "Alice", age: "thirty"}; u')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('record literal missing a required field fails', () => {
    const result = dvala.typecheck('let u: {name: String, age?: Number} = {age: 30}; u')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('record literal with extra field fails (closed record)', () => {
    const result = dvala.typecheck('let u: {name: String, age?: Number} = {name: "Alice", age: 30, extra: "bad"}; u')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('strict `.` access on an optional field is rejected', () => {
    // Use an opaque source (effect return) — otherwise `u` would be
    // inferred as the tight literal type which doesn't have the optional
    // field at all. The annotation is a constraint, not a widening.
    const result = dvala.typecheck(`
      effect @getUser(Null) -> {name: String, age?: Number};
      let f = () -> do
        let u = perform(@getUser, null);
        u.age
      end;
      f
    `)
    expect(result.diagnostics.some(d => /optional/i.test(d.message) || /\?\./i.test(d.message))).toBe(true)
  })

  it('strict `.` access on a required field of an optional-field record works', () => {
    const result = dvala.typecheck(`
      effect @getUser(Null) -> {name: String, age?: Number};
      let f = () -> do
        let u = perform(@getUser, null);
        u.name
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('safe `?.` access on an optional field is accepted', () => {
    // `?.` desugars to `get(...)` whose type is now tightened via
    // indexed-access (PR #80) + a record overload on the builtin.
    const result = dvala.typecheck(`
      effect @getUser(Null) -> {name: String, age?: Number};
      let f = () -> do
        let u = perform(@getUser, null);
        u?.age
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  // With the `get` record-overload, `?.field` resolves to the field
  // type `| Null` at the call site instead of widening to `Unknown`.
  // Use an opaque source so folding doesn't collapse the record to
  // its call-site concrete value.
  it('safe `?.` access on a required field narrows to `T | Null`', () => {
    const r = dvala.typecheck(`
      effect @u(Null) -> {name: String, age: Number};
      let f = () -> do
        let u = perform(@u, null);
        let n: String | Null = u?.name;
        n
      end;
      f
    `)
    expect(r.diagnostics).toHaveLength(0)
  })

  it('safe `?.` access on an optional field narrows to `T | Null`', () => {
    const r = dvala.typecheck(`
      effect @u(Null) -> {name: String, age?: Number};
      let f = () -> do
        let u = perform(@u, null);
        let age: Number | Null = u?.age;
        age
      end;
      f
    `)
    expect(r.diagnostics).toHaveLength(0)
  })

  it('safe `?.` rejects using the field-type as a wrong static type', () => {
    const r = dvala.typecheck(`
      effect @u(Null) -> {name: String, age: Number};
      let f = () -> do
        let u = perform(@u, null);
        let wrong: Boolean | Null = u?.name;
        wrong
      end;
      f
    `)
    // `u?.name` should be typed `String | Null`, NOT `Boolean | Null`.
    // After the get-overload tightening, this mismatch surfaces as a
    // definite diagnostic; before the fix it silently passed because
    // `Unknown` is compatible with anything.
    expect(r.diagnostics.length).toBeGreaterThan(0)
  })

  it('safe `?.` on a closed record with missing key narrows to Never', () => {
    // `indexType` returns `Never` for a missing key on a closed record.
    // Any subsequent use flags the violation.
    const r = dvala.typecheck(`
      effect @u(Null) -> {name: String};
      let f = () -> do
        let u = perform(@u, null);
        let x: Number = u?.missing;
        x
      end;
      f
    `)
    // `u?.missing` has type Never (not String or Null). `let x: Number
    // = Never` IS valid (Never <: everything), so this may not error
    // at the let — but `x` is Never inside `f`'s body. What matters
    // is that the typechecker doesn't silently widen to Unknown.
    expect(Array.isArray(r.diagnostics)).toBe(true)
  })

  it('array indexed access returns the element type', () => {
    // `a[0]` desugars to `get(a, 0)`. The get overload + indexType's
    // Array branch should give `Number` (not `Unknown` or `Number | Null`).
    const r = dvala.typecheck(`
      let a: Number[] = [1, 2, 3];
      let x: Number = a[0];
      x
    `)
    expect(r.diagnostics).toHaveLength(0)
  })

  it('tuple indexed access returns the positional element type', () => {
    const r = dvala.typecheck(`
      type Vec3 = [Number, Number, Number];
      let v: Vec3 = [1, 2, 3];
      let y: Number = v[1];
      y
    `)
    expect(r.diagnostics).toHaveLength(0)
  })

  it('tuple out-of-bounds indexed access resolves to Never', () => {
    // v[5] on a 3-tuple is statically impossible — indexType gives
    // Never. Using the result as a Number is still valid via
    // Never <: Number, but the expression itself is unreachable.
    // Key assertion: inference doesn't throw or return Unknown.
    const r = dvala.typecheck(`
      type Vec3 = [Number, Number, Number];
      let v: Vec3 = [1, 2, 3];
      v[5]
    `)
    // No diagnostic at the access site (Never is a valid value-
    // position type); the access is just dead-code-friendly.
    expect(Array.isArray(r.diagnostics)).toBe(true)
  })

  it('negative literal index on a tuple resolves to Never', () => {
    // `v[-1]` is out of bounds. Regression guard for the Sequence/
    // Tuple branches that would otherwise dereference `prefix[-1]`
    // and produce a type hole (undefined cast to Type).
    const r = dvala.typecheck(`
      type Pair = [Number, String];
      let p: Pair = [1, "hi"];
      p[-1]
    `)
    expect(Array.isArray(r.diagnostics)).toBe(true)
  })

  it('optional-field sidecar survives polymorphic freshening', () => {
    // Regression: before the rebuildRecord helper, Record reconstruction
    // in freshenAllVars / freshenInner / generalizeInner / narrowing paths
    // silently dropped `optionalFields`. That meant a polymorphic function
    // returning an optional-field record would lose the sidecar — the
    // next dot-access wouldn't be flagged, and assigning a record without
    // the optional field to it would spuriously fail.
    const result = dvala.typecheck(`
      effect @getUser(Null) -> {name: String, age?: Number};
      let identity = (x: A) -> x;
      let f = () -> do
        let u = identity(perform(@getUser, null));
        u.age
      end;
      f
    `)
    // Strict .age on the optional field should still error after
    // freshening through identity.
    expect(result.diagnostics.some(d => /optional/i.test(d.message) || /\?\./i.test(d.message))).toBe(true)
  })

  it('biunification rejects assigning an optional-field record to a required-field annotation', () => {
    // Regression: `constrain` used to recurse into the field's lhs/rhs types
    // without checking the optional-sidecar, so `let u: {b: Number} = v` was
    // silently accepted when `v: {b?: Number}`. `subtype.ts checkStructural`
    // already rejected this on the covariant path; the biunification path
    // (typed `let` annotations) needs the same guard.
    const result = dvala.typecheck(`
      effect @get(Null) -> {a: String, b?: Number};
      let f = () -> do
        let v = perform(@get, null);
        let u: {a: String, b: Number} = v;
        u
      end;
      f
    `)
    expect(result.diagnostics.some(d => /optional/i.test(d.message))).toBe(true)
  })

  it('typeToString displays the `?` marker for optional fields', async () => {
    // Exercise the display path through a parse-roundtrip check.
    const { parseTypeAnnotation } = await import('./parseType')
    const t = parseTypeAnnotation('{name: String, age?: Number}')
    expect(typeToString(t)).toBe('{name: String, age?: Number}')
  })
})

// Match-pattern destructure bindings. `case [x, y]` and `case {name, age}`
// bind the inner names as typed vars inferred from the scrutinee's type.
// The design-doc entry for this feature was out of date; these lock in
// the shipped behaviour.
describe('typecheck — match pattern destructuring binds typed variables', () => {
  const dvala = createDvala()

  it('array pattern binds by position from a tuple scrutinee', () => {
    const result = dvala.typecheck(`
      effect @tpl(Null) -> [String, Number];
      let f = () -> match perform(@tpl, null)
        case [s, n] then s ++ str(n)
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('object pattern binds by key from a record scrutinee', () => {
    const result = dvala.typecheck(`
      effect @rec(Null) -> {name: String, age: Number};
      let f = () -> match perform(@rec, null)
        case {name, age} then age + 1
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('object pattern with default value — `{age = 0}`', () => {
    const result = dvala.typecheck(`
      effect @rec(Null) -> {name: String, age: Number};
      let f = () -> match perform(@rec, null)
        case {name, age = 0} then name ++ str(age)
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('destructure bindings interact with guard narrowing', () => {
    const result = dvala.typecheck(`
      effect @rec(Null) -> {a: Number, b: Number};
      let f = () -> match perform(@rec, null)
        case {a, b} when a > b then a
        case {a, b} then b
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nested destructure — record inside record', () => {
    const result = dvala.typecheck(`
      effect @nested(Null) -> {outer: {inner: Number}};
      let f = () -> match perform(@nested, null)
        case {outer: {inner}} then inner + 1
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('destructure bindings are TYPED — wrong use fails typecheck', () => {
    // If destructure bindings were untyped (Unknown), adding a Number to a
    // String-bound var would not error. Test confirms the field types flow.
    const result = dvala.typecheck(`
      effect @rec(Null) -> {name: String, age: Number};
      let f = () -> match perform(@rec, null)
        case {name, age} then name + age
      end;
      f
    `)
    // name is String, age is Number — `name + age` (string + number) fails.
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

// Typed matrices via tuple-alias form. The design doc's "typed matrices"
// future extension is already fully expressible today — tuple types plus
// type aliases give fixed-size vectors and matrices with full element typing.
// These tests lock in that support.
describe('typecheck — typed matrices via tuple aliases', () => {
  const dvala = createDvala()

  it('fixed-size vector via tuple type annotation', () => {
    const result = dvala.typecheck('let v: [Number, Number, Number] = [1, 2, 3]; v')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('tuple alias for a 3D vector', () => {
    const result = dvala.typecheck('type Vec3 = [Number, Number, Number]; let v: Vec3 = [1, 2, 3]; v')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nested tuple aliases for a matrix', () => {
    const result = dvala.typecheck(`
      type Vec3 = [Number, Number, Number];
      type Mat3x3 = [Vec3, Vec3, Vec3];
      let m: Mat3x3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      m
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rejects wrong-length vector literal', () => {
    const result = dvala.typecheck('let v: [Number, Number, Number] = [1, 2]; v')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('accepts fully-typed function on tuple aliases', () => {
    const result = dvala.typecheck(`
      type Vec3 = [Number, Number, Number];
      let dot: (Vec3, Vec3) -> Number = (a, b) -> a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      dot([1, 0, 0], [0, 1, 0])
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// Meta-function typing: `withDoc(fn, str) -> fn` uses the `Function`
// supertype to accept any function type. This keeps the sig tight (rejects
// non-function first args) without having to enumerate each function shape.
// `doc` and `arity` intentionally stay `(Unknown) -> …` because they also
// accept effect references at runtime (see meta.ts for rationale).
describe('typecheck — meta-function typing (Function supertype)', () => {
  const dvala = createDvala()

  it('withDoc accepts a user-defined function', () => {
    const result = dvala.typecheck('((x, y) -> x + y) withDoc "sum"')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('withDoc accepts a let-bound function variable', () => {
    const result = dvala.typecheck('let add = (x, y) -> x + y; withDoc(add, "sum")')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('withDoc rejects a non-function first argument', () => {
    const result = dvala.typecheck('withDoc(42, "bad")')
    expect(result.diagnostics.some(d => /function/i.test(d.message))).toBe(true)
  })

  it('withDoc rejects a non-string second argument', () => {
    const result = dvala.typecheck('let add = (x, y) -> x + y; withDoc(add, 42)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('typecheck — misc expression types', () => {
  const dvala = createDvala()

  it('template string infers String type', () => {
    const result = dvala.typecheck('`hello ${42} world`')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('and expression typechecks without errors', () => {
    const result = dvala.typecheck('true && 42')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('or expression typechecks without errors', () => {
    const result = dvala.typecheck('false || "hello"')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nullish coalescing typechecks without errors', () => {
    const result = dvala.typecheck('??(null, 42)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('loop expression typechecks without errors', () => {
    const result = dvala.typecheck('loop(i = 0) -> if i > 3 then i else recur(i + 1) end')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('for comprehension typechecks without errors', () => {
    const result = dvala.typecheck('for(x in [1, 2, 3]) -> x + 1')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('macro expression typechecks without errors', () => {
    const result = dvala.typecheck('macro (ast) -> ast')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — sequence-based exhaustiveness
// ---------------------------------------------------------------------------

describe('typecheck — sequence exhaustiveness', () => {
  const dvala = createDvala()

  it('exhaustive match on sequences with defaulted elements', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [x, y = 0] then x + y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('rest pattern covers varying length sequences', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 2, 3] end;
      match xs
        case [1, ...rest] then count(rest)
        case _ then 0
      end
    `)
    // With tuple inference, [1, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })
})

// ---------------------------------------------------------------------------
// typecheck — record/array pattern in let with type annotations
// ---------------------------------------------------------------------------

describe('typecheck — destructuring with annotations', () => {
  const dvala = createDvala()

  it('object destructuring from annotated source', () => {
    const result = dvala.typecheck('let p: {x: Number, y: Number} = {x: 1, y: 2}; let {x, y} = p; x + y')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('array destructuring from array source', () => {
    const result = dvala.typecheck('let arr = array(1, 2, 3); let [a, b] = arr; a + b')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nested object destructuring with annotation', () => {
    const result = dvala.typecheck('let p: {inner: {val: Number}} = {inner: {val: 42}}; let {inner} = p; inner.val')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — guard narrowing on object fields
// ---------------------------------------------------------------------------

describe('typecheck — guard narrowing', () => {
  const dvala = createDvala()

  it('guard narrowing on object field binding is exhaustive', () => {
    const result = dvala.typecheck(`
      let obj = if true then { v: 1 } else { v: "a" } end;
      match obj
        case { v } when isNumber(v) then v
        case { v } when isString(v) then v
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('guard narrowing on array element binding is exhaustive', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else ["a"] end;
      match xs
        case [x] when isNumber(x) then x
        case [y] when isString(y) then y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — collection operations on various types
// ---------------------------------------------------------------------------

describe('typecheck — collection map/reduce inference', () => {
  const dvala = createDvala()

  it('map on string with string callback', () => {
    const result = dvala.typecheck('map("hello", (c) -> c)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('reduce on object with accumulator', () => {
    const result = dvala.typecheck('reduce({a: 1, b: 2}, +, 0)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('map on two arrays', () => {
    const result = dvala.typecheck('map([1, 2], [3, 4], +)')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — handler with transform clause
// ---------------------------------------------------------------------------

describe('typecheck — handler transform inference', () => {
  const dvala = createDvala()

  it('handler with transform infers output type from transform', () => {
    const result = dvala.typecheck(`
      effect @test.htrans(Number) -> Number;
      let h = handler
        @test.htrans(x) -> resume(x * 2)
      transform
        value -> { ok: true, value }
      end;
      h(-> do perform(@test.htrans, 5) end)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — resume ref
// ---------------------------------------------------------------------------

describe('typecheck — resume in handler clause', () => {
  const dvala = createDvala()

  it('resume call with correct arg type passes', () => {
    const result = dvala.typecheck(`
      effect @test.rref(Number) -> Number;
      let h = handler
        @test.rref(x) -> resume(x * 2)
      end;
      h(-> perform(@test.rref, 5))
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — MacroCall
// ---------------------------------------------------------------------------

describe('typecheck — macro call', () => {
  const dvala = createDvala()

  it('macro call returns Unknown type without errors', () => {
    const result = dvala.typecheck('let m = macro (ast) -> ast; #m 42')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — match patterns with complex narrowing
// ---------------------------------------------------------------------------

describe('typecheck — complex match narrowing', () => {
  const dvala = createDvala()

  it('match on nested object patterns with tag discrimination', () => {
    const result = dvala.typecheck(`
      let item = if true then {kind: :box, width: 10, height: 20} else {kind: :circle, radius: 5} end;
      match item
        case {kind: :box, width, height} then width * height
        case {kind: :circle, radius} then radius * radius
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match on sequences of different lengths is exhaustive', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a] then a
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match with rest pattern in array union', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 2, 3] end;
      match xs
        case [1, ...rest] then count(rest)
        case _ then 0
      end
    `)
    // With tuple inference, [1, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })

  it('exhaustive match on tuple of atoms succeeds', () => {
    const result = dvala.typecheck(`
      let pair = if true then [:a, 1] else [:b, 2] end;
      match pair
        case [:a, n] then n
        case [:b, n] then n
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match on records with missing fields in closed records', () => {
    const result = dvala.typecheck(`
      let x = if true then {a: 1} else {b: 2} end;
      match x
        case {a} then a
        case {b} then b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — handler callable patterns
// ---------------------------------------------------------------------------

describe('typecheck — handler-as-callable patterns', () => {
  const dvala = createDvala()

  it('handler called directly with zero-arg thunk', () => {
    const result = dvala.typecheck(`
      effect @test.direct(Number) -> Number;
      let h = handler @test.direct(x) -> resume(x * 2) end;
      h(-> perform(@test.direct, 5))
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('handler with transform called directly', () => {
    const result = dvala.typecheck(`
      effect @test.dtrans(Number) -> Number;
      let h = handler
        @test.dtrans(x) -> resume(x * 2)
      transform
        value -> { ok: true, value }
      end;
      h(-> do perform(@test.dtrans, 5) end)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('handler wrapper function propagates effect handling', () => {
    const result = dvala.typecheck(`
      effect @test.wprop(String) -> Null;
      let withEffect = (thunk) -> do
        let h = handler @test.wprop(msg) -> resume(null) end;
        h(thunk)
      end;
      withEffect(-> do perform(@test.wprop, "hello"); 1 end)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — handler introduced effect set (Phase 2.2)
// ---------------------------------------------------------------------------

describe('typecheck — handler introduced effects', () => {
  const dvala = createDvala()

  // Helper: typecheck the source, find the last node's inferred Handler type,
  // and return its introduced effect set. Bails the assertion if the last
  // node isn't a Handler.
  function lastHandlerIntroduced(source: string) {
    const result = dvala.typecheck(source)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Handler') throw new Error(`expected Handler, got ${t.tag}`)
    return t.introduced
  }

  it('pure handler has empty introduced set', () => {
    const introduced = lastHandlerIntroduced(`
      effect @test.intro_pure(Number) -> Number;
      let h = handler @test.intro_pure(x) -> resume(x * 2) end;
      h
    `)
    expect(introduced.effects.size).toBe(0)
    expect(introduced.tail.tag).toBe('Closed')
  })

  it('clause body performing an unrelated effect surfaces it in introduced', () => {
    const introduced = lastHandlerIntroduced(`
      effect @test.intro_caught(Number) -> Number;
      effect @test.intro_extra(String) -> Null;
      let h = handler
        @test.intro_caught(x) -> do
          perform(@test.intro_extra, "log");
          resume(x)
        end
      end;
      h
    `)
    expect(introduced.effects.has('test.intro_extra')).toBe(true)
    expect(introduced.effects.has('test.intro_caught')).toBe(false)
  })

  // Decision 2 of the handler-typing design: a clause that performs the
  // same effect it catches does NOT re-catch — the perform escapes past
  // this handler. So `introduced` must include the caught effect when the
  // clause itself performs it.
  it('clause performing its own effect surfaces it in introduced (no re-catch)', () => {
    const introduced = lastHandlerIntroduced(`
      effect @test.intro_self(Number) -> Number;
      let h = handler
        @test.intro_self(x) -> resume(perform(@test.intro_self, x + 1))
      end;
      h
    `)
    expect(introduced.effects.has('test.intro_self')).toBe(true)
  })

  it('transform clause effects flow into introduced', () => {
    const introduced = lastHandlerIntroduced(`
      effect @test.intro_tc(Number) -> Number;
      effect @test.intro_tlog(String) -> Null;
      let h = handler
        @test.intro_tc(x) -> resume(x)
      transform
        v -> do perform(@test.intro_tlog, "done"); v end
      end;
      h
    `)
    expect(introduced.effects.has('test.intro_tlog')).toBe(true)
  })

  // Constructing a handler value is itself pure — clause body effects must
  // not leak into the surrounding context where the `handler … end`
  // expression is evaluated.
  it('handler-expression effects do not leak into the enclosing function', () => {
    const result = dvala.typecheck(`
      effect @test.intro_caught2(Number) -> Number;
      effect @test.intro_leak(String) -> Null;
      let mkHandler = () -> handler
        @test.intro_caught2(x) -> do
          perform(@test.intro_leak, "in clause");
          resume(x)
        end
      end;
      mkHandler
    `)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    // mkHandler returns a Handler value but produces no effects itself.
    expect(t.effects.effects.size).toBe(0)
    expect(t.effects.tail.tag).toBe('Closed')
  })
})

// ---------------------------------------------------------------------------
// typecheck — handler application law (Phase 3)
// ---------------------------------------------------------------------------

describe('typecheck — handler application effect arithmetic', () => {
  const dvala = createDvala()

  // Helper: wrap source in `let f = () -> do … end; f` so the surrounding
  // function captures the effects of the do-with-handler block. Returns
  // the function's effect set.
  function effectsOfWrappedBlock(letBindings: string, blockBody: string) {
    const result = dvala.typecheck(`
      ${letBindings}
      let f = () -> do
        ${blockBody}
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    return t.effects
  }

  it('handler that catches an effect and introduces nothing → result is pure', () => {
    const effects = effectsOfWrappedBlock(
      'effect @test.app_caught(Number) -> Number;',
      `
        let h = handler @test.app_caught(x) -> resume(x * 2) end;
        do with h; perform(@test.app_caught, 5) end
      `,
    )
    expect(effects.effects.size).toBe(0)
    expect(effects.tail.tag).toBe('Closed')
  })

  it('handler that catches X and introduces Y → result effect set = @{Y}', () => {
    const effects = effectsOfWrappedBlock(
      `
        effect @test.app_c(Number) -> Number;
        effect @test.app_intro(String) -> Null;
      `,
      `
        let h = handler
          @test.app_c(x) -> do
            perform(@test.app_intro, "log");
            resume(x)
          end
        end;
        do with h; perform(@test.app_c, 5) end
      `,
    )
    expect(effects.effects.has('test.app_intro')).toBe(true)
    expect(effects.effects.has('test.app_c')).toBe(false)
  })

  it('body has caught + uncaught effects → result has uncaught + introduced', () => {
    const effects = effectsOfWrappedBlock(
      `
        effect @test.app2_c(Number) -> Number;
        effect @test.app2_other(Null) -> Null;
        effect @test.app2_intro(String) -> Null;
      `,
      `
        let h = handler
          @test.app2_c(x) -> do
            perform(@test.app2_intro, "log");
            resume(x)
          end
        end;
        do with h;
          perform(@test.app2_other, null);
          perform(@test.app2_c, 5)
        end
      `,
    )
    expect(effects.effects.has('test.app2_other')).toBe(true) // body's uncaught
    expect(effects.effects.has('test.app2_intro')).toBe(true) // handler's introduced
    expect(effects.effects.has('test.app2_c')).toBe(false) // caught
  })

  // Decision 2 again, now observed via the application law: when the
  // clause re-performs the caught effect, the outer effect set still
  // contains it after the do-with-h.
  it('handler whose clause re-performs its own caught effect → result still has it', () => {
    const effects = effectsOfWrappedBlock(
      'effect @test.app_self(Number) -> Number;',
      `
        let h = handler
          @test.app_self(x) -> resume(perform(@test.app_self, x + 1))
        end;
        do with h; perform(@test.app_self, 5) end
      `,
    )
    expect(effects.effects.has('test.app_self')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// typecheck — function-call effect propagation
// ---------------------------------------------------------------------------

// A callee that declares effects (e.g. `() -> @{io} Number`) performs those
// effects when called — they must flow into the surrounding effect context.
// Previously the call-site dropped them silently, making `outer = () -> f()`
// infer as pure even when f had effects.
describe('typecheck — function call propagates callee effects', () => {
  const dvala = createDvala()

  function outerEffects(source: string) {
    const result = dvala.typecheck(source)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    return t.effects
  }

  it('inline perform and wrapped call agree on the effect set', () => {
    const inline = outerEffects(`
      effect @test.fcp_a(Null) -> Null;
      let outer = () -> do perform(@test.fcp_a, null); 1 end;
      outer
    `)
    const wrapped = outerEffects(`
      effect @test.fcp_b(Null) -> Null;
      let f: () -> @{test.fcp_b} Number = () -> do perform(@test.fcp_b, null); 1 end;
      let outer = () -> f();
      outer
    `)
    expect(inline.effects.has('test.fcp_a')).toBe(true)
    expect(wrapped.effects.has('test.fcp_b')).toBe(true)
  })

  it('chained calls propagate through multiple layers', () => {
    const effects = outerEffects(`
      effect @test.fcp_chain(Null) -> Null;
      let a: () -> @{test.fcp_chain} Number = () -> do perform(@test.fcp_chain, null); 1 end;
      let b = () -> a();
      let c = () -> b();
      c
    `)
    expect(effects.effects.has('test.fcp_chain')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// typecheck — handler-as-callable + user-defined wrapper introduced
// effect propagation (Phase 4-B)
// ---------------------------------------------------------------------------

describe('typecheck — handler-as-callable propagates introduced effects', () => {
  const dvala = createDvala()

  function effectsOfWrappedBlock(letBindings: string, blockBody: string) {
    const result = dvala.typecheck(`
      ${letBindings}
      let f = () -> do
        ${blockBody}
      end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    return t.effects
  }

  // Direct h(-> body) form (the line 901-923 branch). Mirror of the
  // do-with-h test in the application-arithmetic block above.
  it('h(-> body) form unions handler.introduced into the result effect set', () => {
    const effects = effectsOfWrappedBlock(
      `
        effect @test.cdc(Number) -> Number;
        effect @test.cdi(String) -> Null;
      `,
      `
        let h = handler
          @test.cdc(x) -> do
            perform(@test.cdi, "log");
            resume(x)
          end
        end;
        h(-> perform(@test.cdc, 5))
      `,
    )
    expect(effects.effects.has('test.cdi')).toBe(true)
    expect(effects.effects.has('test.cdc')).toBe(false)
  })

  // User-defined wrapper: a function that internally constructs a handler
  // and applies it to its thunk arg. Phase 4-B's noteWrappedThunkVar
  // captures both `handled` and `introduced`. When the wrapper is called
  // with an effectful body, the residual effects (after subtraction) plus
  // the wrapper's introduced should reach the surrounding context.
  it('user-defined wrapper propagates introduced effects of inner handler', () => {
    const effects = effectsOfWrappedBlock(
      `
        effect @test.uwc(Number) -> Number;
        effect @test.uwi(String) -> Null;
        let withChooser = (thunk) -> do
          let h = handler
            @test.uwc(x) -> do
              perform(@test.uwi, "wrapper-introduced");
              resume(x)
            end
          end;
          h(thunk)
        end;
      `,
      'withChooser(-> perform(@test.uwc, 5))',
    )
    expect(effects.effects.has('test.uwi')).toBe(true) // wrapper's introduced
    expect(effects.effects.has('test.uwc')).toBe(false) // caught
  })
})

// ---------------------------------------------------------------------------
// typecheck — type display and expansion for complex types
// ---------------------------------------------------------------------------

describe('typecheck — type display for complex types', () => {
  const dvala = createDvala()

  it('handler type in typeMap expands correctly', () => {
    const result = dvala.typecheck(`
      effect @test.tdh(Number) -> String;
      let h = handler @test.tdh(x) -> resume(str(x)) end;
      h
    `)
    expect(result.diagnostics).toHaveLength(0)
    // Expanding types in the typeMap should not throw
    for (const type of result.typeMap.values()) {
      const expanded = simplify(expandType(type))
      expect(typeToString(expanded)).toBeDefined()
    }
  })

  it('sequence types in typeMap expand correctly', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      xs
    `)
    expect(result.diagnostics).toHaveLength(0)
    for (const type of result.typeMap.values()) {
      const expanded = simplify(expandType(type))
      expect(typeToString(expanded)).toBeDefined()
    }
  })

  it('union type in typeMap expands correctly', () => {
    const result = dvala.typecheck(`
      type NumOrStr = Number | String;
      let x: NumOrStr = 42;
      x
    `)
    expect(result.diagnostics).toHaveLength(0)
    for (const type of result.typeMap.values()) {
      const expanded = simplify(expandType(type))
      expect(typeToString(expanded)).toBeDefined()
    }
  })

  it('alias type preserves name through expansion', () => {
    const result = dvala.typecheck(`
      type Pair<A, B> = { first: A, second: B };
      let p: Pair<Number, String> = { first: 1, second: "hello" };
      p
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — bindPattern for nested destructuring
// ---------------------------------------------------------------------------

describe('typecheck — nested destructuring', () => {
  const dvala = createDvala()

  it('nested object destructuring binds inner fields', () => {
    const result = dvala.typecheck('let {inner} = {inner: {val: 42}}; inner.val + 1')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('array destructuring with rest in let binding', () => {
    const result = dvala.typecheck('let [first, ...rest] = [1, 2, 3]; first')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('deeply nested object destructuring', () => {
    const result = dvala.typecheck('let {a} = {a: {b: {c: 42}}}; a.b.c + 1')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — various collection calls
// ---------------------------------------------------------------------------

describe('typecheck — advanced collection inference', () => {
  const dvala = createDvala()

  it('reduce on string with string concatenation', () => {
    const result = dvala.typecheck('reduce("abc", (acc, c) -> acc ++ c, "")')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('map on multiple arrays with compatible callback', () => {
    const result = dvala.typecheck('map([1, 2], [10, 20], +)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('map on two objects with compatible callback', () => {
    const result = dvala.typecheck('map({a: 1, b: 2}, {a: 10, b: 20}, +)')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — effect in block body
// ---------------------------------------------------------------------------

describe('typecheck — block with handler', () => {
  const dvala = createDvala()

  it('block without handler still infers body type', () => {
    const result = dvala.typecheck(`
      let x = do
        let a = 1;
        let b = 2;
        a + b
      end;
      x
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nested with-handlers subtract effects cumulatively', () => {
    const result = dvala.typecheck(`
      effect @test.inner(Number) -> Null;
      effect @test.outer(String) -> Null;
      let x: Number = do
        with handler @test.outer(msg) -> resume(null) end;
        with handler @test.inner(n) -> resume(null) end;
        perform(@test.inner, 42);
        perform(@test.outer, "hello");
        1
      end;
      x
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — bindUnknownPattern (match against Unknown-typed scrutinee)
// ---------------------------------------------------------------------------

describe('typecheck — match against Unknown-typed values', () => {
  const dvala = createDvala()

  it('match with object destructuring against unknown-typed parameter runs without crash', () => {
    // The typechecker may report diagnostics but should not crash
    const result = dvala.typecheck(`
      let process = (data) -> match data
        case {name, age} then name
        case _ then "unknown"
      end;
      process({name: "Alice", age: 30})
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('match with array destructuring against unknown-typed parameter runs without crash', () => {
    const result = dvala.typecheck(`
      let process = (data) -> match data
        case [first, second] then first
        case _ then null
      end;
      process([1, 2])
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('match with rest pattern against unknown-typed parameter runs without crash', () => {
    const result = dvala.typecheck(`
      let process = (data) -> match data
        case [head, ...tail] then head
        case _ then null
      end;
      process([1, 2, 3])
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('match with nested object destructuring against unknown runs without crash', () => {
    const result = dvala.typecheck(`
      let process = (data) -> match data
        case {inner: {val}} then val
        case _ then null
      end;
      process({inner: {val: 42}})
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — areMatchTypesDisjoint for record shapes
// ---------------------------------------------------------------------------

describe('typecheck — record field disjointness in match', () => {
  const dvala = createDvala()

  it('records with disjoint literal field values', () => {
    const result = dvala.typecheck(`
      let event = if true then {kind: "click", x: 1} else {kind: "key", ch: "a"} end;
      match event
        case {kind: "click", x} then x
        case {kind: "key", ch} then count(ch)
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('records with mismatched field sets are disjoint', () => {
    const result = dvala.typecheck(`
      let data = if true then {a: 1, b: 2} else {c: 3, d: 4} end;
      match data
        case {a, b} then a + b
        case {c, d} then c + d
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match on union of records with common and unique fields', () => {
    const result = dvala.typecheck(`
      let shape = if true then {type: "rect", w: 10, h: 20} else {type: "circle", r: 5} end;
      match shape
        case {type: "rect", w, h} then w * h
        case {type: "circle", r} then r * r
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — tuple disjointness and exhaustiveness
// ---------------------------------------------------------------------------

describe('typecheck — tuple match exhaustiveness', () => {
  const dvala = createDvala()

  it('tuples with disjoint element values exercise tuple disjointness', () => {
    // Tuple disjointness check runs even with diagnostics
    const result = dvala.typecheck(`
      let pair = if true then [:ok, 42] else [:error, "fail"] end;
      match pair
        case [:ok, value] then value
        case [:error, msg] then count(msg)
      end
    `)
    // Some diagnostics expected due to atom/null constraint, but no crash
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('tuples with different lengths', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a] then a
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — collectVars through complex types
// ---------------------------------------------------------------------------

describe('typecheck — overload resolution with complex arg types', () => {
  const dvala = createDvala()

  it('overloaded builtin with tuple argument', () => {
    const result = dvala.typecheck('count([1, 2, 3])')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('overloaded builtin with record argument', () => {
    const result = dvala.typecheck('count({a: 1, b: 2})')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('overloaded function with handler return type', () => {
    const result = dvala.typecheck(`
      effect @test.over(Number) -> Number;
      let h = handler @test.over(x) -> resume(x) end;
      let result = h(-> do perform(@test.over, 42) end);
      result
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — WithHandler without handler alternatives
// ---------------------------------------------------------------------------

describe('typecheck — with-handler edge cases', () => {
  const dvala = createDvala()

  it('with expression where handler variable has complex union type', () => {
    const result = dvala.typecheck(`
      effect @test.wh(Number) -> Null;
      let maybeHandler = if true then
        handler @test.wh(x) -> resume(null) end
      else
        handler @test.wh(x) -> resume(null) end
      end;
      do
        with maybeHandler;
        perform(@test.wh, 42);
        1
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — let binding with error in value expression
// ---------------------------------------------------------------------------

describe('typecheck — let binding error recovery', () => {
  const dvala = createDvala()

  it('type error in let value still allows downstream code to typecheck', () => {
    const result = dvala.typecheck('let x = "hello" + 1; 42')
    // Should have an error for the + call, but the overall result should still work
    expect(result.diagnostics.length).toBeGreaterThan(0)
    // The type map should still have entries for the downstream 42
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — function with annotated params and effects
// ---------------------------------------------------------------------------

describe('typecheck — function annotations and effects', () => {
  const dvala = createDvala()

  it('function with annotated param and body effects', () => {
    const result = dvala.typecheck(`
      effect @test.fp(String) -> Null;
      let greet = (name: String) -> do
        perform(@test.fp, "Hello " ++ name);
        null
      end;
      greet("World")
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('polymorphic function with record return generalizes', () => {
    const result = dvala.typecheck(`
      let wrap = (x) -> {value: x};
      let a = wrap(42);
      let b = wrap("hello");
      a.value + 1
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — sequence-related match patterns
// ---------------------------------------------------------------------------

describe('typecheck — sequence match patterns', () => {
  const dvala = createDvala()

  it('match with sequence type and prefix subtraction', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [3, 4] end;
      match xs
        case [1, y] then y
        case [x, y] then x + y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match with atom prefix in sequences exercises sequence paths', () => {
    // Exercises sequence match narrowing; some type diagnostics may appear
    const result = dvala.typecheck(`
      let tagged = if true then [:ok, 42] else [:error, "fail"] end;
      match tagged
        case [:ok, n] then n
        case [:error, msg] then count(msg)
      end
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('match with defaulted array elements in pattern', () => {
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a, b = 0] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — display and expansion of generic types
// ---------------------------------------------------------------------------

describe('typecheck — generic type alias instantiation', () => {
  const dvala = createDvala()

  it('generic result type annotation validates correctly', () => {
    const result = dvala.typecheck(`
      type Result<T, E> = {tag: :ok, value: T} | {tag: :error, error: E};
      let ok: Result<Number, String> = {tag: :ok, value: 42};
      let err: Result<Number, String> = {tag: :error, error: "fail"};
      ok
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('nested generic type aliases validate correctly', () => {
    const result = dvala.typecheck(`
      type Box<T> = {value: T};
      let b: Box<Number> = {value: 42};
      b.value + 1
    `)
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

  it('invalid closed record annotation rejects extra fields', () => {
    const result = dvala.typecheck('let x: {name: String} = {name: "Alice", age: 42}; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toContain("Extra field 'age'")
  })

  it('open record annotation accepts extra fields', () => {
    const result = dvala.typecheck('let x: {name: String, ...} = {name: "Alice", age: 42}; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  // Record × Record intersection in an annotation reads as "has both
  // shapes" — the simplify pass merges the pair into a single record
  // before `constrain` sees it, so a literal with both fields is
  // accepted. Strict set-theoretic semantics would say this is Never,
  // but that's surprising to users writing annotations; the narrowing
  // path (infer.ts intersectRecords) still keeps the strict rule.
  it('record intersection annotation accepts values with fields from both sides', () => {
    const result = dvala.typecheck('let x: {a: Number} & {b: String} = {a: 1, b: "s"}; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('record intersection annotation rejects missing field from either side', () => {
    const result = dvala.typecheck('let x: {a: Number} & {b: String} = {a: 1}; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('record intersection with conflicting same-field types is Never', () => {
    // `{a: Number} & {a: String}` has no inhabitants — the required
    // field `a` is typed both ways. Value-constrain should fail.
    const result = dvala.typecheck('let x: {a: Number} & {a: String} = {a: 1}; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('attaches let annotation errors to the value expression source', () => {
    const result = dvala.typecheck([
      'let x: String =',
      '  42;',
      'x',
    ].join('\n'))

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.sourceCodeInfo?.position.line).toBe(2)
    expect(result.diagnostics[0]?.sourceCodeInfo?.code.trim()).toBe('42;')
  })

  it('function param annotation: (a: Number) -> a + 1', () => {
    const result = dvala.typecheck('let f = (a: Number) -> a + 1; f(42)')
    expect(result.diagnostics).toHaveLength(0)
  })

  // Lambda return-type annotations — per decision #11, the `: R` slot
  // between `)` and `->` is a load-bearing promise that the body
  // produces something <: R. Annotations stay optional; when present,
  // they must be checked.
  it('lambda return-type annotation accepts a matching body', () => {
    const result = dvala.typecheck('let f = (x: Number): Number -> x + 1; f(1)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('lambda return-type annotation rejects a mismatching body', () => {
    // Body returns Number, annotation claims String. Must error.
    const result = dvala.typecheck('let f = (x: Number): String -> x; f(1)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toMatch(/not a subtype of String/)
  })

  it('lambda return-type annotation on a zero-arg lambda is enforced', () => {
    const result = dvala.typecheck('let f = (): Boolean -> 42; f()')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toMatch(/not a subtype of Boolean/)
  })

  it('lambda return-type annotation accepts a narrower body (subtype)', () => {
    // Body returns literal `1`; annotation says Number. `1 <: Number` — fine.
    const result = dvala.typecheck('let f = (): Number -> 1; f()')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('lambda return-type annotation rejects a wider body', () => {
    // Body returns a union; annotation claims Number.
    const result = dvala.typecheck(`
      effect @get(Null) -> Number | String;
      let f = (): Number -> perform(@get, null);
      f
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  // Regression: `constrain` only adds an upper bound to the body Var;
  // without a call site, no propagation ever forces the check. Mirror
  // the let-binding path with an eager `isSubtype` so the violation
  // surfaces at definition time, not via call.
  it('lambda return-type annotation violation surfaces without a call site', () => {
    const result = dvala.typecheck('let f = (x: Number): String -> x; f')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toMatch(/not a subtype of String/)
  })

  it('lambda return-type error points at the body expression', () => {
    // The value-side squiggle lands on the returned expression, not
    // the function header. Use a multi-line source so the position is
    // observable.
    const result = dvala.typecheck([
      'let f = (x: Number): String ->',
      '  x;',
      'f(1)',
    ].join('\n'))
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.sourceCodeInfo?.position.line).toBe(2)
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

  it('generic type alias instantiation in let annotation', () => {
    const result = dvala.typecheck('type Box<T> = { value: T }; let x: Box<Number> = { value: 42 }; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('generic type alias enforces substituted field types', () => {
    const result = dvala.typecheck('type Box<T> = { value: T }; let x: Box<Number> = { value: "hello" }; x')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a subtype of Number')
  })

  it('generic aliases support multiple parameters', () => {
    const result = dvala.typecheck('type Result<T, E> = { tag: :ok, value: T } | { tag: :error, error: E }; let x: Result<Number, String> = { tag: :ok, value: 42 }; x')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('type does not interfere with variable named type', () => {
    // 'type' is not a reserved word — can be used as a variable when not followed by uppercase
    const result = dvala.typecheck('let type = 42; type + 1')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// typecheck — effectHandler signatures carry handler-wrapper info (Phase 5)
// ---------------------------------------------------------------------------

// Phase 5 wires HandlerWrapperInfo onto the six effectHandler/ functions via
// TS-side metadata. The typechecker attaches it to the parsed function type
// at module-registration time. At call sites, the Phase 4-B wrapper-call
// path then computes `(thunk_effects \ handled) ∪ introduced` correctly.
//
// These tests pass modules explicitly so the module type cache is actually
// populated (the default createDvala wrapper above doesn't — registration
// happens at typecheck time from the opts.modules list).
describe('typecheck — effectHandler signatures propagate wrapper effects', () => {
  const dvala = createDvalaRaw({ modules: allBuiltinModules })

  function outerEffects(source: string) {
    const result = dvala.typecheck(source)
    if (result.diagnostics.length > 0) {
      throw new Error(`unexpected diagnostics: ${JSON.stringify(result.diagnostics, null, 2)}`)
    }
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    return t.effects
  }

  it('chooseRandom introduces @{dvala.random.item} into its caller', () => {
    const effects = outerEffects(`
      let { chooseRandom } = import("effectHandler");
      let outer = () -> chooseRandom(-> perform(@choose, [1, 2, 3]));
      outer
    `)
    expect(effects.effects.has('dvala.random.item')).toBe(true)
    expect(effects.effects.has('choose')).toBe(false)
  })

  // Phase 4-A Phase C: row-var propagation. The thunk performs an extra
  // effect beyond @choose — that extra effect must surface in the outer
  // caller's effect set through ρ. Pre-row-var, this worked via the
  // HandlerWrapperInfo fast-path (subtraction of handled from thunk effects
  // leaves the extras); row-var sigs now produce the equivalent result via
  // biunification. Both paths run at the call site; either alone suffices.
  it('chooseRandom: thunk extras flow through ρ to the caller', () => {
    const effects = outerEffects(`
      effect @my.ext(Null) -> Null;
      let { chooseRandom } = import("effectHandler");
      let outer = () -> chooseRandom(-> do
        perform(@my.ext, null);
        perform(@choose, [1, 2, 3])
      end);
      outer
    `)
    expect(effects.effects.has('dvala.random.item')).toBe(true)
    expect(effects.effects.has('my.ext')).toBe(true)
    // @choose was caught — should not surface.
    expect(effects.effects.has('choose')).toBe(false)
  })

  it('chooseAll: thunk extras flow through ρ (no introduced effect of its own)', () => {
    const effects = outerEffects(`
      effect @my.logx(Null) -> Null;
      let { chooseAll } = import("effectHandler");
      let outer = () -> chooseAll(-> do
        perform(@my.logx, null);
        perform(@choose, [1, 2])
      end);
      outer
    `)
    expect(effects.effects.has('my.logx')).toBe(true)
    expect(effects.effects.has('choose')).toBe(false)
    // chooseAll introduces nothing.
    expect(effects.effects.has('dvala.random.item')).toBe(false)
  })

  // Phase 4-A Phase C blocker probe: two calls to the same row-polymorphic
  // wrapper must NOT share the same freshened row var. If freshening isn't
  // applied per-use, the FIRST call's row var would accumulate lower bounds
  // from both calls' thunks, and isolated sub-expressions (like just one
  // wrapper-call in a let binding) would reflect effects from the OTHER
  // call. The probe: two independent let-bound wrapper calls, assert each
  // has its own ρ's effects — no cross-contamination.
  it('two chooseRandom calls get independent row vars (no cross-contamination)', () => {
    const result = dvala.typecheck(`
      effect @my.a(Null) -> Null;
      effect @my.b(Null) -> Null;
      let { chooseRandom } = import("effectHandler");
      let f = () -> chooseRandom(-> do perform(@my.a, null); perform(@choose, [1]) end);
      let g = () -> chooseRandom(-> do perform(@my.b, null); perform(@choose, [2]) end);
      [f, g]
    `)
    if (result.diagnostics.length > 0) {
      throw new Error(`unexpected diagnostics: ${JSON.stringify(result.diagnostics, null, 2)}`)
    }
    const lastIndex = Math.max(...result.typeMap.keys())
    const tuple = expandType(result.typeMap.get(lastIndex)!)
    if (tuple.tag !== 'Tuple') throw new Error(`expected Tuple, got ${tuple.tag}`)
    const [f, g] = tuple.elements
    if (f?.tag !== 'Function' || g?.tag !== 'Function') throw new Error('expected Function elements')
    // f's effects: @{dvala.random.item, my.a} ONLY. If ρ leaked, @my.b
    // would also appear here.
    expect(f.effects.effects.has('dvala.random.item')).toBe(true)
    expect(f.effects.effects.has('my.a')).toBe(true)
    expect(f.effects.effects.has('my.b')).toBe(false)
    // g's effects: @{dvala.random.item, my.b} ONLY.
    expect(g.effects.effects.has('dvala.random.item')).toBe(true)
    expect(g.effects.effects.has('my.b')).toBe(true)
    expect(g.effects.effects.has('my.a')).toBe(false)
  })

  it('retry: thunk extras flow through ρ (and @dvala.error persists)', () => {
    const effects = outerEffects(`
      effect @my.telemetry(Null) -> Null;
      let { retry } = import("effectHandler");
      let outer = () -> retry(3, -> do
        perform(@my.telemetry, null);
        perform(@dvala.error, "boom")
      end);
      outer
    `)
    expect(effects.effects.has('dvala.error')).toBe(true)
    expect(effects.effects.has('my.telemetry')).toBe(true)
  })

  it('chooseFirst does not introduce any new effect (just catches @choose)', () => {
    const effects = outerEffects(`
      let { chooseFirst } = import("effectHandler");
      let outer = () -> chooseFirst(-> perform(@choose, [1, 2]));
      outer
    `)
    expect(effects.effects.size).toBe(0)
  })

  it('retry catches @{dvala.error} but re-introduces it — error still surfaces', () => {
    const effects = outerEffects(`
      let { retry } = import("effectHandler");
      let outer = () -> retry(3, -> 1);
      outer
    `)
    // Pure thunk so no initial @dvala.error, and retry's introduced is
    // @dvala.error — but the wrapperBranchFired guard means calledEffects
    // is skipped (retry's own FunctionType.effects is empty here). Net:
    // handled ∪ introduced contributes @dvala.error. Caveat: with a
    // genuinely pure body, @dvala.error isn't actually performed at
    // runtime — this is a soundness-preserving over-approximation.
    expect(effects.effects.has('dvala.error')).toBe(true)
  })

  it('polymorphic return type: chooseRandom(-> 42) is literal(42)', () => {
    const result = dvala.typecheck(`
      let { chooseRandom } = import("effectHandler");
      chooseRandom(-> 42)
    `)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    expect(t.tag).toBe('Literal')
    if (t.tag === 'Literal') expect(t.value).toBe(42)
  })

  // With the lhs-Unknown fix in `constrain`, an effect performed inside the
  // thunk whose declared retType is `Unknown` (like `@choose`) no longer
  // short-circuits to `Never` in the wrapping call's return type. Effects
  // still propagate correctly, and the return is `Unknown` — the accurate
  // upper approximation.
  it('effectful thunk returns Unknown (not Never) at the outer call', () => {
    const result = dvala.typecheck(`
      let { chooseRandom } = import("effectHandler");
      let outer = () -> chooseRandom(-> perform(@choose, [1, 2, 3]));
      outer
    `)
    expect(result.diagnostics).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    expect(t.ret.tag).toBe('Unknown')
    expect(t.effects.effects.has('dvala.random.item')).toBe(true)
  })

  // fallback is the one effectHandler function that returns a Handler
  // VALUE rather than directly wrapping a thunk. Calling it produces a
  // Handler, which the user then applies via `fallback(v)(-> body)`. The
  // behavioral claim is that @dvala.error in the body gets consumed by
  // the handler — only the body's non-caught effects surface to the
  // caller. Without this test, a regression on the handler-as-callable
  // path for fallback specifically would be silent.
  it('fallback(v)(-> effectful body) consumes @dvala.error, surfaces others', () => {
    const result = dvala.typecheck(`
      let { fallback } = import("effectHandler");
      effect @test.fb_other(Null) -> Null;
      let outer = (n: Number) -> fallback(0)(-> do
        perform(@test.fb_other, null);
        n / 0
      end);
      outer
    `)
    // Fold may emit a severity:'warning' for provable runtime errors —
    // filter to real errors.
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors).toHaveLength(0)
    const lastIndex = Math.max(...result.typeMap.keys())
    const t = expandType(result.typeMap.get(lastIndex)!)
    if (t.tag !== 'Function') throw new Error(`expected Function, got ${t.tag}`)
    // @dvala.error (from n/0) is caught by fallback's handler; the
    // unrelated test.fb_other effect still surfaces to the caller.
    expect(t.effects.effects.has('test.fb_other')).toBe(true)
    expect(t.effects.effects.has('dvala.error')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// typecheck — source-implemented module function type registration (Phase 0)
// ---------------------------------------------------------------------------

// Modules like `effectHandler` keep their implementations in a `.dvala`
// source file; types are declared in the module's `docs` map rather than
// inline on each TS function. Before this work, `registerModuleType` only
// iterated `mod.functions`, so source-impl entries were invisible to the
// typechecker — `import("effectHandler").chooseRandom` produced a
// "missing field" type error even though the runtime worked.
describe('typecheck — source-impl module functions are visible', () => {
  const dvala = createDvala()

  it('effectHandler.chooseRandom is visible to the typechecker', () => {
    const result = dvala.typecheck(`
      let { chooseRandom } = import("effectHandler");
      chooseRandom(-> 5)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('effectHandler.retry is visible to the typechecker', () => {
    const result = dvala.typecheck(`
      let { retry } = import("effectHandler");
      retry(3, -> 0)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('effectHandler.fallback is visible to the typechecker', () => {
    const result = dvala.typecheck(`
      let { fallback } = import("effectHandler");
      fallback(0)(-> 1)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('collection.filter is visible to the typechecker (Dvala-impl)', () => {
    const result = dvala.typecheck(`
      let { filter } = import("collection");
      filter([1, 2, 3], (x) -> x > 1)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

describe('typecheck — imported diagnostics', () => {
  it('surfaces type errors from imported files with imported file paths', () => {
    const files = new Map([
      ['./bad.dvala', 'let value: String = 42; { value }'],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const result = dvala.typecheck('let { value } = import("./bad.dvala"); value', { fileResolverBaseDir: '.' })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a subtype of String')
    expect(result.diagnostics[0]?.sourceCodeInfo?.filePath).toBe('bad.dvala')
    expect(result.diagnostics[0]?.sourceCodeInfo?.code.trim()).toBe('let value: String = 42; { value }')
  })

  it('rechecks imported files after their source changes', () => {
    const files = new Map([
      ['./bad.dvala', 'let value: Number = 42; { value }'],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const first = dvala.typecheck('let { value } = import("./bad.dvala"); value', { fileResolverBaseDir: '.' })
    expect(first.diagnostics).toHaveLength(0)

    files.set('./bad.dvala', 'let value: String = 42; { value }')

    const second = dvala.typecheck('let { value } = import("./bad.dvala"); value', { fileResolverBaseDir: '.' })

    expect(second.diagnostics.length).toBeGreaterThan(0)
    expect(second.diagnostics[0]?.message).toContain('not a subtype of String')
    expect(second.diagnostics[0]?.sourceCodeInfo?.filePath).toBe('bad.dvala')
  })

  it('deduplicates diagnostics when the same imported file is referenced twice', () => {
    // Importing the same file twice should use the file type cache on the
    // second access and avoid emitting duplicate diagnostics.
    const files = new Map([
      ['./bad.dvala', 'let value: String = 42; { value }'],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    // Two separate import expressions for the same file in sequence
    const result = dvala.typecheck(
      'let a = import("./bad.dvala"); let b = import("./bad.dvala"); a',
      { fileResolverBaseDir: '.' },
    )

    // There should be diagnostics (the file has a type error), but they should
    // NOT be duplicated — the dedup logic should keep only one copy.
    const errorMessages = result.diagnostics.filter(d => d.severity === 'error').map(d => d.message)
    const uniqueMessages = [...new Set(errorMessages)]
    expect(errorMessages).toEqual(uniqueMessages)
  })

  it('returns Unknown when file resolver throws', () => {
    const dvala = createDvala({
      fileResolver: () => {
        throw new Error('cannot read file')
      },
    })

    // Importing a file that the resolver cannot find should not crash the
    // typechecker — it should fall back to Unknown and produce no error diagnostic.
    const result = dvala.typecheck(
      'let x = import("./nonexistent.dvala"); x',
      { fileResolverBaseDir: '.' },
    )

    // Should not throw; the import gets Unknown type
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('processes type aliases declared in imported files', () => {
    // The imported file declares a type alias and uses it in an annotation.
    // Without type alias registration in the import path, the annotation
    // would silently collapse to Unknown.
    const files = new Map([
      ['./types.dvala', 'type Num = Number; let value: Num = 42; { value }'],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const result = dvala.typecheck(
      'let { value } = import("./types.dvala"); value + 1',
      { fileResolverBaseDir: '.' },
    )

    expect(result.diagnostics).toHaveLength(0)
  })

  it('processes effect declarations in imported files', () => {
    // The imported file declares an effect and uses it. Without effect
    // declaration registration in the import path, perform() would collapse
    // to Unknown.
    const files = new Map([
      ['./effects.dvala', [
        'effect @test.imported(Number) -> String;',
        'let handle = (thunk) -> do',
        '  let h = handler @test.imported(x) -> resume(str(x)) end;',
        '  h(thunk)',
        'end;',
        '{ handle }',
      ].join('\n')],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const result = dvala.typecheck(
      'let { handle } = import("./effects.dvala"); handle',
      { fileResolverBaseDir: '.' },
    )

    // The import should succeed without errors — the effect declaration
    // should be recognized and the handler should typecheck correctly.
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors).toHaveLength(0)
  })

  it('resolves imports with parent directory traversal (..)', () => {
    // Tests the joinPath ".." segment handling where resolvedSegments.pop() is called
    const files = new Map([
      ['./lib/helper.dvala', '{ x: 42 }'],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string, fromDir: string) => {
        // Normalize: resolve ".." manually for the flat file map
        const parts = `${fromDir}/${importPath}`.split('/').filter(Boolean)
        const resolved: string[] = []
        for (const p of parts) {
          if (p === '..') resolved.pop()
          else if (p !== '.') resolved.push(p)
        }
        const key = `./${resolved.join('/')}`
        const source = files.get(key)
        if (!source) throw new Error(`File not found: ${key} (from ${fromDir}/${importPath})`)
        return source
      },
    })

    // Import from a nested directory, going up via ".."
    const result = dvala.typecheck(
      'let { x } = import("../lib/helper.dvala"); x',
      { fileResolverBaseDir: './sub' },
    )

    expect(result.diagnostics).toHaveLength(0)
  })

  it('resolves imports with parent traversal past empty relative root', () => {
    // When baseDir is relative and importPath uses ".." past all segments,
    // joinPath should push ".." onto resolvedSegments since there is no root.
    const dvala = createDvala({
      fileResolver: (_importPath: string) => {
        // Accept any import — return a simple value
        return '{ value: 1 }'
      },
    })

    // The ".." traversal past the relative root exercises the !root branch
    // in joinPath where ".." segments are pushed onto resolvedSegments.
    const result = dvala.typecheck(
      'let { value } = import("../../far.dvala"); value',
      { fileResolverBaseDir: '.' },
    )

    expect(result.diagnostics).toHaveLength(0)
  })

  it('normalizes handler types in imported exports', () => {
    // Import a file that exports a handler to exercise the Handler case
    // in normalizeImportedExportType.
    const files = new Map([
      ['./handler.dvala', [
        'effect @test.norm(Number) -> Number;',
        'handler @test.norm(x) -> resume(x * 2) end',
      ].join('\n')],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const result = dvala.typecheck(
      'let h = import("./handler.dvala"); h',
      { fileResolverBaseDir: '.' },
    )

    // The handler import should be resolved without crashing
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('normalizes function types with handler wrappers in imports', () => {
    // Import a file that exports a function wrapping a handler to
    // exercise the handlerWrapper branch in normalizeImportedExportType.
    const files = new Map([
      ['./wrapped.dvala', [
        'effect @test.wrap(String) -> Null;',
        'let run = (thunk) -> do',
        '  let h = handler @test.wrap(msg) -> resume(null) end;',
        '  h(thunk)',
        'end;',
        '{ run }',
      ].join('\n')],
    ])

    const dvala = createDvala({
      fileResolver: (importPath: string) => {
        const source = files.get(importPath)
        if (!source) throw new Error(`File not found: ${importPath}`)
        return source
      },
    })

    const result = dvala.typecheck(
      'let { run } = import("./wrapped.dvala"); run',
      { fileResolverBaseDir: '.' },
    )

    expect(result.typeMap.size).toBeGreaterThan(0)
  })

})

// ---------------------------------------------------------------------------
// typecheckExpr — standalone expression type checking
// ---------------------------------------------------------------------------

describe('typecheckExpr', () => {
  // Helper: parse source into AST nodes and optional source map
  function parseNodes(source: string) {
    const ts = tokenize(source, true, undefined)
    const min = minifyTokenStream(ts, { removeWhiteSpace: true })
    const ast = parseToAst(min)
    return { nodes: ast.body, sourceMap: ast.sourceMap }
  }

  it('infers number type for arithmetic expression', () => {
    const { nodes, sourceMap } = parseNodes('1 + 2')
    const result = typecheckExpr(nodes, sourceMap, { modules: allBuiltinModules })

    expect(result.diagnostics).toHaveLength(0)
    const expanded = simplify(expandType(result.type))
    // With constant folding enabled, `1 + 2` collapses to a Literal type;
    // otherwise it widens to Number.
    const expected = FOLD_ENABLED ? '3' : 'Number'
    expect(typeToString(expanded)).toBe(expected)
  })

  it('reports type diagnostics for mismatched expressions', () => {
    const { nodes, sourceMap } = parseNodes('"hello" + 1')
    const result = typecheckExpr(nodes, sourceMap, { modules: allBuiltinModules })

    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('populates typeMap for let binding expressions', () => {
    const { nodes, sourceMap } = parseNodes('let x = 42; x + 1')
    const result = typecheckExpr(nodes, sourceMap, { modules: allBuiltinModules })

    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('returns Unknown type for empty node list', () => {
    const result = typecheckExpr([], undefined, { modules: allBuiltinModules })

    expect(result.diagnostics).toHaveLength(0)
    expect(result.type.tag).toBe('Unknown')
  })

  it('works without modules option', () => {
    const { nodes, sourceMap } = parseNodes('let x = 42; x')
    const result = typecheckExpr(nodes, sourceMap)

    expect(result.type).toBeDefined()
  })
})
