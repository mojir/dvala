import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { astModule } from '../src/builtin/modules/ast'

const dvala = createDvala({ modules: [astModule] })
const run = (code: string) => dvala.run(code)

describe('ast module', () => {
  describe('constructors', () => {
    it('should create number nodes', () => {
      expect(run('let { num } = import(ast); num(42)')).toEqual(['Num', 42, 0])
    })

    it('should create string nodes', () => {
      expect(run('let { strNode } = import(ast); strNode("hello")')).toEqual(['Str', 'hello', 0])
    })

    it('should create boolean nodes', () => {
      expect(run('let { bool } = import(ast); bool(true)')).toEqual(['Reserved', 'true', 0])
      expect(run('let { bool } = import(ast); bool(false)')).toEqual(['Reserved', 'false', 0])
    })

    it('should create null nodes', () => {
      expect(run('let { nil } = import(ast); nil()')).toEqual(['Reserved', 'null', 0])
    })

    it('should create symbol nodes', () => {
      expect(run('let { sym } = import(ast); sym("x")')).toEqual(['Sym', 'x', 0])
    })

    it('should create builtin nodes', () => {
      expect(run('let { builtin } = import(ast); builtin("+")')).toEqual(['Builtin', '+', 0])
    })

    it('should create effect nodes', () => {
      expect(run('let { effectNode } = import(ast); effectNode("dvala.io.print")')).toEqual(['Effect', 'dvala.io.print', 0])
    })

    it('should create call nodes', () => {
      const result = run('let { call, builtin, num } = import(ast); call(builtin("+"), [num(1), num(2)])')
      expect(result).toEqual(['Call', [['Builtin', '+', 0], [['Num', 1, 0], ['Num', 2, 0]]], 0])
    })

    it('should create if nodes', () => {
      const result = run('let { ifNode, sym, num } = import(ast); ifNode(sym("x"), num(1), num(2))')
      expect(result).toEqual(['If', [['Sym', 'x', 0], ['Num', 1, 0], ['Num', 2, 0]], 0])
    })

    it('should create if nodes without else', () => {
      const result = run('let { ifNode, sym, num } = import(ast); ifNode(sym("x"), num(1))')
      expect(result).toEqual(['If', [['Sym', 'x', 0], ['Num', 1, 0]], 0])
    })

    it('should create block nodes', () => {
      const result = run('let { block, num } = import(ast); block([num(1), num(2)])')
      expect(result).toEqual(['Block', [['Num', 1, 0], ['Num', 2, 0]], 0])
    })
  })

  describe('predicates', () => {
    it('should detect node types', () => {
      expect(run('let { isNum, num } = import(ast); isNum(num(42))')).toBe(true)
      expect(run('let { isNum, strNode } = import(ast); isNum(strNode("x"))')).toBe(false)
      expect(run('let { isStr, strNode } = import(ast); isStr(strNode("x"))')).toBe(true)
      expect(run('let { isSym, sym } = import(ast); isSym(sym("x"))')).toBe(true)
      expect(run('let { isBuiltin, builtin } = import(ast); isBuiltin(builtin("+"))')).toBe(true)
      expect(run('let { isCall, call, builtin, num } = import(ast); isCall(call(builtin("+"), [num(1)]))')).toBe(true)
      expect(run('let { isBool, bool } = import(ast); isBool(bool(true))')).toBe(true)
      expect(run('let { isNil, nil } = import(ast); isNil(nil())')).toBe(true)
      expect(run('let { isEffectNode, effectNode } = import(ast); isEffectNode(effectNode("dvala.io.print"))')).toBe(true)
    })

    it('should return false for non-matching types', () => {
      expect(run('let { isNum } = import(ast); isNum(42)')).toBe(false)
      expect(run('let { isNum } = import(ast); isNum("hello")')).toBe(false)
      expect(run('let { isNum } = import(ast); isNum(null)')).toBe(false)
    })

    it('should detect valid AST nodes', () => {
      expect(run('let { isAstNode, num } = import(ast); isAstNode(num(42))')).toBe(true)
      expect(run('let { isAstNode } = import(ast); isAstNode([1, 2, 3])')).toBe(false)
      expect(run('let { isAstNode } = import(ast); isAstNode(42)')).toBe(false)
    })
  })

  describe('accessors', () => {
    it('should return node type tag', () => {
      expect(run('let { nodeType, num } = import(ast); nodeType(num(42))')).toBe('Num')
      expect(run('let { nodeType, sym } = import(ast); nodeType(sym("x"))')).toBe('Sym')
    })

    it('should return payload', () => {
      expect(run('let { payload, num } = import(ast); payload(num(42))')).toBe(42)
      expect(run('let { payload, strNode } = import(ast); payload(strNode("hello"))')).toBe('hello')
    })
  })

  describe('prettyPrint', () => {
    it('should print number literals', () => {
      expect(run('let { prettyPrint, num } = import(ast); prettyPrint(num(42))')).toBe('42')
    })

    it('should print string literals', () => {
      expect(run('let { prettyPrint, strNode } = import(ast); prettyPrint(strNode("hello"))')).toBe('"hello"')
    })

    it('should print boolean and null', () => {
      expect(run('let { prettyPrint, bool } = import(ast); prettyPrint(bool(true))')).toBe('true')
      expect(run('let { prettyPrint, nil } = import(ast); prettyPrint(nil())')).toBe('null')
    })

    it('should print symbols', () => {
      expect(run('let { prettyPrint, sym } = import(ast); prettyPrint(sym("x"))')).toBe('x')
    })

    it('should print binary expressions as infix', () => {
      expect(run('let { prettyPrint, call, builtin, num } = import(ast); prettyPrint(call(builtin("+"), [num(1), num(2)]))')).toBe('1 + 2')
    })

    it('should print function calls as prefix', () => {
      expect(run('let { prettyPrint, call, sym, num } = import(ast); prettyPrint(call(sym("f"), [num(1), num(2)]))')).toBe('f(1, 2)')
    })

    it('should print if expressions', () => {
      expect(run('let { prettyPrint, ifNode, sym, num } = import(ast); prettyPrint(ifNode(sym("x"), num(1), num(2)))')).toBe('if x then 1 else 2 end')
    })

    it('should print if without else', () => {
      expect(run('let { prettyPrint, ifNode, sym, num } = import(ast); prettyPrint(ifNode(sym("x"), num(1)))')).toBe('if x then 1 end')
    })

    it('should print code template AST', () => {
      expect(run('let { prettyPrint } = import(ast); prettyPrint(quote 1 + 2 end)')).toBe('1 + 2')
    })

    it('should print effect references', () => {
      expect(run('let { prettyPrint, effectNode } = import(ast); prettyPrint(effectNode("dvala.io.print"))')).toBe('@dvala.io.print')
    })
  })

  describe('round-trip with macros', () => {
    it('should construct AST that evaluates correctly', () => {
      // Verify that constructors produce AST that macros can return
      expect(run(`
        let { call, builtin, num } = import(ast);
        let id = macro (ast) -> ast;
        let addNode = call(builtin("+"), [num(20), num(22)]);
        id(20 + 22)
      `)).toBe(42)
    })
  })
})
