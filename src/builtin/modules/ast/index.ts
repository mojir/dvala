import { NodeTypes, isNodeType } from '../../../constants/constants'
import { prettyPrint } from '../../../prettyPrint'
import { TypeError } from '../../../errors'
import type { Any, Arr } from '../../../interface'
import { toFixedArity } from '../../../utils/arity'
import { toAny } from '../../../utils'
import { assertString } from '../../../typeGuards/string'
import { assertNumber } from '../../../typeGuards/number'
import type { BuiltinNormalExpressions, FunctionDocs } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'
import type { SourceCodeInfo } from '../../../tokenizer/token'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that a value is an AST node (array with string type tag). */
function assertAstNode(value: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts value is [string, unknown, number] {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'string') {
    throw new TypeError('Expected an AST node [type, payload, nodeId]', sourceCodeInfo)
  }
}

function assertArray(value: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts value is Arr {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected an array', sourceCodeInfo)
  }
}

// ---------------------------------------------------------------------------
// Constructors — produce AST data with nodeId 0
// ---------------------------------------------------------------------------

const astFunctions: BuiltinNormalExpressions = {
  // --- Value constructors ---
  'num': {
    evaluate: ([n], sourceCodeInfo): Any => {
      assertNumber(n, sourceCodeInfo)
      return toAny([NodeTypes.Num, n, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { n: { type: 'number' } },
      variants: [{ argumentNames: ['n'] }],
      description: 'Creates a number AST node.',
      examples: [
        'let { num } = import(ast); num(42)',
      ],
    },
  },
  'strNode': {
    evaluate: ([s], sourceCodeInfo): Any => {
      assertString(s, sourceCodeInfo)
      return toAny([NodeTypes.Str, s, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Creates a string AST node.',
      examples: [
        'let { strNode } = import(ast); strNode("hello")',
      ],
    },
  },
  'bool': {
    evaluate: ([b], sourceCodeInfo): Any => {
      if (typeof b !== 'boolean') throw new TypeError('Expected a boolean', sourceCodeInfo)
      return toAny([NodeTypes.Reserved, b ? 'true' : 'false', 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { b: { type: 'boolean' } },
      variants: [{ argumentNames: ['b'] }],
      description: 'Creates a boolean AST node.',
      examples: [
        'let { bool } = import(ast); bool(true)',
      ],
    },
  },
  'nil': {
    evaluate: (): Any => {
      return toAny([NodeTypes.Reserved, 'null', 0])
    },
    arity: toFixedArity(0),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: {},
      variants: [{ argumentNames: [] }],
      description: 'Creates a null AST node.',
      examples: [
        'let { nil } = import(ast); nil()',
      ],
    },
  },

  // --- Identifier constructors ---
  'sym': {
    evaluate: ([name], sourceCodeInfo): Any => {
      assertString(name, sourceCodeInfo)
      return toAny([NodeTypes.Sym, name, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { name: { type: 'string' } },
      variants: [{ argumentNames: ['name'] }],
      description: 'Creates a symbol (variable reference) AST node.',
      examples: [
        'let { sym } = import(ast); sym("x")',
      ],
    },
  },
  'builtin': {
    evaluate: ([name], sourceCodeInfo): Any => {
      assertString(name, sourceCodeInfo)
      return toAny([NodeTypes.Builtin, name, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { name: { type: 'string' } },
      variants: [{ argumentNames: ['name'] }],
      description: 'Creates a builtin function reference AST node.',
      examples: [
        'let { builtin } = import(ast); builtin("+")',
      ],
    },
  },
  'effectNode': {
    evaluate: ([name], sourceCodeInfo): Any => {
      assertString(name, sourceCodeInfo)
      return toAny([NodeTypes.Effect, name, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { name: { type: 'string' } },
      variants: [{ argumentNames: ['name'] }],
      description: 'Creates an effect reference AST node.',
      examples: [
        'let { effectNode } = import(ast); effectNode("dvala.io.print")',
      ],
    },
  },

  // --- Compound constructors ---
  'call': {
    evaluate: ([fn, args], sourceCodeInfo): Any => {
      assertAstNode(fn, sourceCodeInfo)
      assertArray(args, sourceCodeInfo)
      return toAny([NodeTypes.Call, [fn, args], 0])
    },
    arity: toFixedArity(2),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: {
        fn: { type: 'array', description: 'Function AST node.' },
        args: { type: 'array', description: 'Array of argument AST nodes.' },
      },
      variants: [{ argumentNames: ['fn', 'args'] }],
      description: 'Creates a function call AST node.',
      examples: [
        'let { call, builtin, num } = import(ast); call(builtin("+"), [num(1), num(2)])',
      ],
    },
  },
  'ifNode': {
    evaluate: ([cond, then, else_], sourceCodeInfo): Any => {
      assertAstNode(cond, sourceCodeInfo)
      assertAstNode(then, sourceCodeInfo)
      // else_ can be null/undefined for if-without-else
      if (else_ !== null && else_ !== undefined) {
        assertAstNode(else_, sourceCodeInfo)
      }
      const payload = else_ !== null && else_ !== undefined ? [cond, then, else_] : [cond, then]
      return toAny([NodeTypes.If, payload, 0])
    },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: {
        cond: { type: 'array', description: 'Condition AST node.' },
        thenBranch: { type: 'array', description: 'Then-branch AST node.' },
        elseBranch: { type: 'array', description: 'Else-branch AST node (optional).' },
      },
      variants: [
        { argumentNames: ['cond', 'thenBranch'] },
        { argumentNames: ['cond', 'thenBranch', 'elseBranch'] },
      ],
      description: 'Creates an if-expression AST node.',
      examples: [
        'let { ifNode, sym, num } = import(ast); ifNode(sym("x"), num(1), num(2))',
      ],
    },
  },
  'block': {
    evaluate: ([stmts], sourceCodeInfo): Any => {
      assertArray(stmts, sourceCodeInfo)
      return toAny([NodeTypes.Block, stmts, 0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'array' },
      args: { stmts: { type: 'array', description: 'Array of statement AST nodes.' } },
      variants: [{ argumentNames: ['stmts'] }],
      description: 'Creates a block (do...end) AST node.',
      examples: [
        'let { block, num } = import(ast); block([num(1), num(2)])',
      ],
    },
  },

  // --- Predicates ---
  'nodeType': {
    evaluate: ([node], sourceCodeInfo): Any => {
      assertAstNode(node, sourceCodeInfo)
      return (node as unknown[])[0] as string
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'string' },
      args: { node: { type: 'array', description: 'An AST node.' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns the type tag of an AST node (e.g., "Num", "Str", "Call").',
      examples: [
        'let { nodeType, num } = import(ast); nodeType(num(42))',
        'let { nodeType, sym } = import(ast); nodeType(sym("x"))',
      ],
    },
  },
  'isNum': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Num,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a number literal.',
      examples: ['let { isNum, num } = import(ast); isNum(num(42))'],
    },
  },
  'isStr': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Str,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a string literal.',
      examples: ['let { isStr, strNode } = import(ast); isStr(strNode("hi"))'],
    },
  },
  'isSym': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Sym,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a symbol (variable reference).',
      examples: ['let { isSym, sym } = import(ast); isSym(sym("x"))'],
    },
  },
  'isBuiltin': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Builtin,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a builtin function reference.',
      examples: ['let { isBuiltin, builtin } = import(ast); isBuiltin(builtin("+"))'],
    },
  },
  'isCall': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Call,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a function call.',
      examples: ['let { isCall, call, builtin, num } = import(ast); isCall(call(builtin("+"), [num(1)]))'],
    },
  },
  'isIf': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.If,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is an if-expression.',
      examples: ['let { isIf, ifNode, sym, num } = import(ast); isIf(ifNode(sym("x"), num(1), num(2)))'],
    },
  },
  'isBlock': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Block,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a block (do...end).',
      examples: ['let { isBlock, block, num } = import(ast); isBlock(block([num(1)]))'],
    },
  },
  'isLet': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Let,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a let-binding.',
      examples: ['let { isLet } = import(ast); isLet(quote let x = 1 end)'],
    },
  },
  'isFn': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Function,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a function definition.',
      examples: ['let { isFn } = import(ast); isFn(quote (x) -> x end)'],
    },
  },
  'isBool': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Reserved && (node[1] === 'true' || node[1] === 'false'),
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a boolean literal.',
      examples: ['let { isBool, bool } = import(ast); isBool(bool(true))'],
    },
  },
  'isNil': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Reserved && node[1] === 'null',
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is a null literal.',
      examples: ['let { isNil, nil } = import(ast); isNil(nil())'],
    },
  },
  'isEffectNode': {
    evaluate: ([node]): boolean => Array.isArray(node) && node[0] === NodeTypes.Effect,
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the AST node is an effect reference.',
      examples: ['let { isEffectNode, effectNode } = import(ast); isEffectNode(effectNode("dvala.io.print"))'],
    },
  },
  'isAstNode': {
    evaluate: ([node]): boolean => {
      return Array.isArray(node) && node.length >= 2 && typeof node[0] === 'string' && isNodeType(node[0])
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'boolean' },
      args: { node: { type: 'any' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns true if the value is a valid AST node (array starting with a known type tag).',
      examples: [
        'let { isAstNode, num } = import(ast); isAstNode(num(42))',
        'let { isAstNode } = import(ast); isAstNode([1, 2, 3])',
      ],
    },
  },

  // --- Accessors ---
  'payload': {
    evaluate: ([node], sourceCodeInfo): Any => {
      assertAstNode(node, sourceCodeInfo)
      return (node as unknown[])[1] as Any
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'any' },
      args: { node: { type: 'array', description: 'An AST node.' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Returns the payload (second element) of an AST node.',
      examples: [
        'let { payload, num } = import(ast); payload(num(42))',
        'let { payload, strNode } = import(ast); payload(strNode("hello"))',
      ],
    },
  },

  // --- Pretty printing ---
  'prettyPrint': {
    evaluate: ([node], sourceCodeInfo): string => {
      assertAstNode(node, sourceCodeInfo)
      return prettyPrint(node)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'ast',
      returns: { type: 'string' },
      args: { node: { type: 'array', description: 'An AST node.' } },
      variants: [{ argumentNames: ['node'] }],
      description: 'Converts an AST node back to readable Dvala source code.',
      examples: [
        'let { prettyPrint, num } = import(ast); prettyPrint(num(42))',
        'let { prettyPrint, call, builtin, num } = import(ast); prettyPrint(call(builtin("+"), [num(1), num(2)]))',
        'let { prettyPrint } = import(ast); prettyPrint(quote 1 + 2 end)',
      ],
    },
  },
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

// Build docs from the additional module-level docs
const additionalDocs: Record<string, FunctionDocs> = {}

export const astModule: DvalaModule = {
  name: 'ast',
  functions: astFunctions,
  source: '{}',
  docs: { ...moduleDocsFromFunctions(astFunctions), ...additionalDocs },
}
