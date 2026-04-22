import { describe, expect, it } from 'vitest'
import { NodeTypes } from '../constants/constants'
import { TypeError, UserDefinedError } from '../errors'
import type { Any } from '../interface'
import { parse } from '../parser'
import type { AstNode, NumberNode, StringNode } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { fromJS, toJS } from '../utils/interop'
import { listSize, listToArray, PersistentMap, PersistentVector } from '../utils/persistent'
import type { ContextStack } from './ContextStack'
import { createContextStack } from './ContextStack'
import type {
  AndFrame,
  ArrayBuildFrame,
  ContinuationStack,
  Frame,
  IfBranchFrame,
  LetBindFrame,
  FiniteCheckFrame,
  ObjectBuildFrame,
  OrFrame,
  QqFrame,
  RecurFrame,
  SequenceFrame,
} from './frames'
import type { Step } from './step'
import { applyFrame, runAsyncTrampoline, runSyncTrampoline, stepNode, tick } from './trampoline-evaluator'

// Helper: parse a Dvala program and return its first AST node
function parseFirst(program: string) {
  const tokenStream = tokenize(program, true, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  const ast = parse(minified)
  return ast[0]!
}

// Helper: create a fresh, empty context stack
function emptyEnv(): ContextStack {
  return createContextStack()
}

// Helper: apply a frame synchronously (for unit tests where async is not expected)
function applyFrameSync(frame: Frame, value: Any, k: ContinuationStack): Step {
  const result = applyFrame(frame, value, k)
  if (result instanceof Promise) {
    throw new TypeError('Unexpected async result in applyFrameSync')
  }
  return result
}

// Helper: stepNode synchronously (for unit tests where async is not expected)
function stepNodeSync(node: AstNode, env: ContextStack, k: ContinuationStack): Step {
  const result = stepNode(node, env, k)
  if (result instanceof Promise) {
    throw new TypeError('Unexpected async result in stepNodeSync')
  }
  return result
}

// Helper: run the trampoline to completion using runSyncTrampoline.
// Applies toJS() so callers can compare against plain arrays/objects (matching dvala.run() semantics).
function runTrampoline(step: Step): unknown {
  return toJS(runSyncTrampoline(step) as Any)
}

// ---------------------------------------------------------------------------
// tick — core step engine
// ---------------------------------------------------------------------------

describe('tick', () => {
  it('should return terminal ValueStep unchanged when k is empty', () => {
    const step: Step = { type: 'Value', value: 42, k: null }
    const next = tick(step)
    expect(next).toEqual({ type: 'Value', value: 42, k: null })
  })

  it('should apply top frame when ValueStep has non-empty k', () => {
    const thenNode: NumberNode = [NodeTypes.Num, 99, 0]
    const frame: IfBranchFrame = { type: 'IfBranch', thenNode, elseNode: undefined, env: emptyEnv() }
    const step: Step = { type: 'Value', value: true, k: { head: frame, tail: null } }
    const next = tick(step) as Step
    expect(next.type).toBe('Eval')
    if (next.type === 'Eval') {
      expect(next.node).toBe(thenNode)
    }
  })

  it('should dispatch EvalStep via stepNode', () => {
    const node = parseFirst('42')
    const step: Step = { type: 'Eval', node, env: emptyEnv(), k: null }
    const next = tick(step) as Step
    expect(next).toEqual({ type: 'Value', value: 42, k: null })
  })

  it('should dispatch ApplyStep via applyFrame', () => {
    const frame: FiniteCheckFrame = { type: 'FiniteCheck' }
    const step: Step = { type: 'Apply', frame, value: 42, k: null }
    const next = tick(step) as Step
    expect(next).toEqual({ type: 'Value', value: 42, k: null })
  })

  it('should run a full program via tick loop', () => {
    const node = parseFirst('1 + 2 + 3')
    const initial: Step = { type: 'Eval', node, env: emptyEnv(), k: null }
    let step: Step | Promise<Step> = initial
    for (let i = 0; i < 1000; i++) {
      if (step instanceof Promise)
        throw new TypeError('Unexpected async')
      if (step.type === 'Value' && listSize(step.k) === 0) {
        expect(step.value).toBe(6)
        return
      }
      step = tick(step)
    }
    throw new Error('tick loop did not terminate')
  })
})

// ---------------------------------------------------------------------------
// runSyncTrampoline / runAsyncTrampoline
// ---------------------------------------------------------------------------

describe('runSyncTrampoline', () => {
  it('should evaluate a simple expression', () => {
    const node = parseFirst('42')
    const initial: Step = { type: 'Eval', node, env: emptyEnv(), k: null }
    expect(runSyncTrampoline(initial)).toBe(42)
  })

  it('should evaluate a complex expression', () => {
    const node = parseFirst('(1 + 2) * (3 + 4)')
    const initial: Step = { type: 'Eval', node, env: emptyEnv(), k: null }
    expect(runSyncTrampoline(initial)).toBe(21)
  })

  it('should evaluate a terminal ValueStep immediately', () => {
    const initial: Step = { type: 'Value', value: 'done', k: null }
    expect(runSyncTrampoline(initial)).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// stepNode — leaf nodes
// ---------------------------------------------------------------------------

describe('stepNode', () => {
  describe('leaf nodes', () => {
    it('should return ValueStep for number literals', () => {
      const node = parseFirst('42')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      expect((step as { value: Any }).value).toBe(42)
    })

    it('should return ValueStep for negative number literals', () => {
      const node = parseFirst('-3.14')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(-3.14)
      }
    })

    it('should return ValueStep for string literals', () => {
      const node = parseFirst('"hello"')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe('hello')
      }
    })

    it('should return ValueStep for empty string', () => {
      const node = parseFirst('""')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step).toEqual({ type: 'Value', value: '', k: null })
    })

    it('should return ValueStep for reserved symbol true', () => {
      const node = parseFirst('true')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step).toEqual({ type: 'Value', value: true, k: null })
    })

    it('should return ValueStep for reserved symbol false', () => {
      const node = parseFirst('false')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step).toEqual({ type: 'Value', value: false, k: null })
    })

    it('should return ValueStep for reserved symbol null', () => {
      const node = parseFirst('null')
      const env = emptyEnv()
      const step = stepNodeSync(node, env, null)
      expect(step).toEqual({ type: 'Value', value: null, k: null })
    })

    it('should return ValueStep for user-defined symbol', () => {
      const node = parseFirst('x')
      const env = createContextStack({ globalContext: { x: { value: 10 } } })
      const step = stepNodeSync(node, env, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(10)
      }
    })

    it('should return ValueStep for builtin symbol', () => {
      const node = parseFirst('inc')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
    })
  })

  // ---------------------------------------------------------------------------
  // stepNode — normal expressions
  // ---------------------------------------------------------------------------

  describe('normal expressions', () => {
    it('should push EvalArgsFrame for normal expression with args', () => {
      const node = parseFirst('1 + 2')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(2) // EvalArgsFrame + FiniteCheckFrame
        expect(step.k?.head!.type).toBe('EvalArgs')
        expect(step.k?.tail?.head!.type).toBe('FiniteCheck')
      }
    })

    it('should dispatch immediately for no-arg normal expression', () => {
      const node = parseFirst('object()')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
    })
  })

  // ---------------------------------------------------------------------------
  // stepNode — special expressions
  // ---------------------------------------------------------------------------

  describe('special expressions', () => {
    it('should push IfBranchFrame for if expression', () => {
      const node = parseFirst('if true then 1 else 2 end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('IfBranch')
      }
    })

    it('should push AndFrame for && expression', () => {
      const node = parseFirst('&&(true, false)')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('And')
      }
    })

    it('should return true immediately for empty && expression', () => {
      const node = parseFirst('&&()')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(true)
      }
    })

    it('should push OrFrame for || expression', () => {
      const node = parseFirst('||(false, true)')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('Or')
      }
    })

    it('should return false immediately for empty || expression', () => {
      const node = parseFirst('||()')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(false)
      }
    })

    it('should push IfBranchFrame for if with false condition and else', () => {
      const node = parseFirst('if false then 1 else 2 end')
      const step = stepNodeSync(node, emptyEnv(), null)
      // Pushes an IfBranchFrame, then evaluates condition
      expect(step.type).toBe('Eval')
    })

    it('should push IfBranchFrame for if/else expression', () => {
      const node = parseFirst('if true then 1 else 2 end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('IfBranch')
      }
    })

    it('should evaluate non-empty block nodes', () => {
      const node = parseFirst('do null end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
    })

    it('should eval single-node block without SequenceFrame', () => {
      const node = parseFirst('do 42 end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(0)
      }
    })

    it('should push SequenceFrame for multi-node block', () => {
      const node = parseFirst('do 1; 2; 3 end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('Sequence')
      }
    })

    it('should push LetBindFrame for let expression', () => {
      const node = parseFirst('let x = 10;')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('LetBind')
      }
    })

    it('should return empty array for empty array literal', () => {
      const node = parseFirst('[]')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toEqual(PersistentVector.empty())
      }
    })

    it('should push ArrayBuildFrame for non-empty array literal', () => {
      const node = parseFirst('[1, 2, 3]')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('ArrayBuild')
      }
    })

    it('should return empty object for empty object literal', () => {
      const node = parseFirst('{}')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toEqual(PersistentMap.empty())
      }
    })

    it('should push ObjectBuildFrame for non-empty object literal', () => {
      const node = parseFirst('{ a: 1 }')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('ObjectBuild')
      }
    })

    it('should return a DvalaFunction for lambda', () => {
      const node = parseFirst('(x) -> x')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toHaveProperty('functionType', 'UserDefined')
      }
    })

    it('should return value for a symbol in scope', () => {
      const node = parseFirst('x')
      const env = createContextStack({ globalContext: { x: { value: 42 } } })
      const step = stepNodeSync(node, env, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(42)
      }
    })

    it('should push MatchFrame for match expression', () => {
      const node = parseFirst('match 1 case 1 then "one" case 2 then "two" end')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('Match')
      }
    })

    it('should push QqFrame for ?? expression', () => {
      const node = parseFirst('??(null, 1)')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('Qq')
      }
    })

    it('should push RecurFrame for recur', () => {
      const node = parseFirst('recur(1, 2)')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('Recur')
      }
    })

    it('should throw DvalaError for recur outside loop/function', () => {
      const node = parseFirst('recur()')
      expect(() => stepNodeSync(node, emptyEnv(), null)).toThrow('recur called outside of loop or function body')
    })

    it('should push LoopBindFrame for loop expression', () => {
      const node = parseFirst('loop (x = 0) -> x')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(1)
        expect(step.k?.head!.type).toBe('LoopBind')
      }
    })

    it('should push ForLoopFrame for for expression', () => {
      const node = parseFirst('for (x in [1, 2, 3]) -> x')
      const step = stepNodeSync(node, emptyEnv(), null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listToArray(step.k).some((f: Frame) => f.type === 'ForLoop')).toBe(true)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// applyFrame — individual frame types
// ---------------------------------------------------------------------------

describe('applyFrame', () => {
  describe('ifBranchFrame', () => {
    it('should evaluate then-branch when condition is truthy', () => {
      const thenNode: NumberNode = [NodeTypes.Num, 1, 0]
      const elseNode: NumberNode = [NodeTypes.Num, 2, 0]
      const frame: IfBranchFrame = {
        type: 'IfBranch',
        thenNode,
        elseNode,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, true, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(thenNode)
      }
    })

    it('should evaluate else-branch when condition is falsy', () => {
      const thenNode: NumberNode = [NodeTypes.Num, 1, 0]
      const elseNode: NumberNode = [NodeTypes.Num, 2, 0]
      const frame: IfBranchFrame = {
        type: 'IfBranch',
        thenNode,
        elseNode,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, false, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(elseNode)
      }
    })

    it('should reject malformed if nodes without an else-branch', () => {
      const thenNode: NumberNode = [NodeTypes.Num, 1, 0]
      const frame: IfBranchFrame = {
        type: 'IfBranch',
        thenNode,
        elseNode: undefined,
        env: emptyEnv(),
      }
      expect(() => applyFrameSync(frame, false, null)).toThrowError(TypeError)
    })
  })

  describe('sequenceFrame', () => {
    it('should return value when all nodes evaluated', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: SequenceFrame = {
        type: 'Sequence',
        nodes,
        index: 2, // past the last node
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 42, null)
      expect(step).toEqual({ type: 'Value', value: 42, k: null })
    })

    it('should evaluate next node when more remain', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0], [NodeTypes.Num, 3, 0]]
      const frame: SequenceFrame = {
        type: 'Sequence',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 'ignored', null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
      }
    })

    it('should not push frame for last node', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: SequenceFrame = {
        type: 'Sequence',
        nodes,
        index: 1, // last node index
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 'ignored', null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(listSize(step.k)).toBe(0) // no additional frame for last node
      }
    })
  })

  describe('andFrame', () => {
    it('should short-circuit on falsy value', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: AndFrame = {
        type: 'And',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, false, null)
      expect(step).toEqual({ type: 'Value', value: false, k: null })
    })

    it('should continue on truthy value with more nodes', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0], [NodeTypes.Num, 3, 0]]
      const frame: AndFrame = {
        type: 'And',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, true, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
      }
    })

    it('should return value when all truthy and at last node', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0]]
      const frame: AndFrame = {
        type: 'And',
        nodes,
        index: 1, // past last
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 42, null)
      expect(step).toEqual({ type: 'Value', value: 42, k: null })
    })
  })

  describe('orFrame', () => {
    it('should short-circuit on truthy value', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: OrFrame = {
        type: 'Or',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 42, null)
      expect(step).toEqual({ type: 'Value', value: 42, k: null })
    })

    it('should continue on falsy value', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0], [NodeTypes.Num, 3, 0]]
      const frame: OrFrame = {
        type: 'Or',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, false, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
      }
    })
  })

  describe('qqFrame', () => {
    it('should return value if non-null', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: QqFrame = {
        type: 'Qq',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 42, null)
      expect(step).toEqual({ type: 'Value', value: 42, k: null })
    })

    it('should advance when value is null', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: QqFrame = {
        type: 'Qq',
        nodes,
        index: 1,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, null, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
      }
    })
  })

  describe('arrayBuildFrame', () => {
    it('should add value and advance', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: ArrayBuildFrame = {
        type: 'ArrayBuild',
        nodes,
        index: 0,
        result: PersistentVector.empty(),
        isSpread: false,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 10, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
      }
    })

    it('should return result when all elements are done', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0]]
      const resultVec = PersistentVector.from([10])
      const frame: ArrayBuildFrame = {
        type: 'ArrayBuild',
        nodes,
        index: 0,
        result: resultVec,
        isSpread: false,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 20, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toEqual(fromJS([10, 20]))
      }
    })

    it('should spread array values', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0]]
      const frame: ArrayBuildFrame = {
        type: 'ArrayBuild',
        nodes,
        index: 0,
        result: PersistentVector.empty(),
        isSpread: true,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, fromJS([1, 2, 3]), null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toEqual(fromJS([1, 2, 3]))
      }
    })
  })

  describe('objectBuildFrame', () => {
    it('should store key and evaluate value', () => {
      const keyNode: StringNode = [NodeTypes.Str, 'a', 0]
      const valueNode: NumberNode = [NodeTypes.Num, 1, 0]
      const frame: ObjectBuildFrame = {
        type: 'ObjectBuild',
        entries: [[keyNode, valueNode]],
        index: 0,
        result: PersistentMap.empty(),
        currentKey: null,
        isSpread: false,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 'a', null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(valueNode)
        expect(step.k?.head!.type).toBe('ObjectBuild')
        const newFrame = step.k?.head as ObjectBuildFrame
        expect(newFrame.currentKey).toBe('a')
      }
    })

    it('should store value and return object when done', () => {
      const keyNode: StringNode = [NodeTypes.Str, 'a', 0]
      const valueNode: NumberNode = [NodeTypes.Num, 1, 0]
      const frame: ObjectBuildFrame = {
        type: 'ObjectBuild',
        entries: [[keyNode, valueNode]],
        index: 0,
        result: PersistentMap.empty(),
        currentKey: 'a',
        isSpread: false,
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 42, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toEqual(fromJS({ a: 42 }))
      }
    })
  })

  describe('recurFrame', () => {
    it('should throw DvalaError when recur has no target frame', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0]]
      const frame: RecurFrame = {
        type: 'Recur',
        nodes,
        index: 1,
        params: PersistentVector.empty(),
        env: emptyEnv(),
      }
      expect(() => applyFrameSync(frame, 42, null)).toThrow('recur called outside of loop or function body')
    })

    it('should continue collecting when more params remain', () => {
      const nodes: NumberNode[] = [[NodeTypes.Num, 1, 0], [NodeTypes.Num, 2, 0]]
      const frame: RecurFrame = {
        type: 'Recur',
        nodes,
        index: 1,
        params: PersistentVector.empty(),
        env: emptyEnv(),
      }
      const step = applyFrameSync(frame, 10, null)
      expect(step.type).toBe('Eval')
      if (step.type === 'Eval') {
        expect(step.node).toBe(nodes[1])
        expect(step.k?.head!.type).toBe('Recur')
      }
    })
  })

  describe('finiteCheckFrame', () => {
    it('should pass finite values through', () => {
      const frame: FiniteCheckFrame = { type: 'FiniteCheck' }
      const step = applyFrameSync(frame, 42, null)
      expect(step.type).toBe('Value')
      if (step.type === 'Value') {
        expect(step.value).toBe(42)
      }
    })

    it('should throw on NaN value', () => {
      const frame: FiniteCheckFrame = { type: 'FiniteCheck' }
      expect(() => applyFrameSync(frame, Number.NaN, null)).toThrow('Number is not finite')
    })

    it('should throw on positive Infinity', () => {
      const frame: FiniteCheckFrame = { type: 'FiniteCheck' }
      expect(() => applyFrameSync(frame, Number.POSITIVE_INFINITY, null)).toThrow('Number is not finite')
    })

    it('should throw on negative Infinity', () => {
      const frame: FiniteCheckFrame = { type: 'FiniteCheck' }
      expect(() => applyFrameSync(frame, Number.NEGATIVE_INFINITY, null)).toThrow('Number is not finite')
    })
  })

  describe('letBindFrame', () => {
    it('should bind a simple value', () => {
      const env = emptyEnv()
      const frame: LetBindFrame = {
        type: 'LetBind',
        target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'x', 0], undefined], 0],
        env,
      }
      // applyLetBind now returns a step with LetBindCompleteFrame on the stack
      // Run the full trampoline to get the final value
      const step = applyFrameSync(frame, 42, null)
      const finalValue = runTrampoline(step)
      expect(finalValue).toBe(42)
      // Also verify the binding was added to the environment
      expect(env.getValue('x')).toBe(42)
    })
  })
})

// ---------------------------------------------------------------------------
// Integration: full trampoline evaluation
// ---------------------------------------------------------------------------

describe('trampoline integration', () => {
  it('should evaluate number literal', () => {
    const node = parseFirst('42')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(42)
  })

  it('should evaluate string literal', () => {
    const node = parseFirst('"hello"')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe('hello')
  })

  it('should evaluate boolean literals', () => {
    expect(runTrampoline(stepNodeSync(parseFirst('true'), emptyEnv(), null))).toBe(true)
    expect(runTrampoline(stepNodeSync(parseFirst('false'), emptyEnv(), null))).toBe(false)
  })

  it('should evaluate null', () => {
    expect(runTrampoline(stepNodeSync(parseFirst('null'), emptyEnv(), null))).toBe(null)
  })

  it('should evaluate addition', () => {
    const node = parseFirst('1 + 2')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(3)
  })

  it('should evaluate nested arithmetic', () => {
    const node = parseFirst('2 * 3 + 4')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(10)
  })

  it('should evaluate if expression', () => {
    const node = parseFirst('if true then 1 else 2 end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(1)
  })

  it('should evaluate if with false condition', () => {
    const node = parseFirst('if false then 1 else 2 end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(2)
  })

  it('should evaluate negated if expression', () => {
    const node = parseFirst('if not(true) then 1 else 2 end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(2)
  })

  it('should evaluate && short circuit', () => {
    expect(runTrampoline(stepNodeSync(parseFirst('&&(false, 1)'), emptyEnv(), null))).toBe(false)
    expect(runTrampoline(stepNodeSync(parseFirst('&&(true, 42)'), emptyEnv(), null))).toBe(42)
  })

  it('should evaluate || short circuit', () => {
    expect(runTrampoline(stepNodeSync(parseFirst('||(42, false)'), emptyEnv(), null))).toBe(42)
    expect(runTrampoline(stepNodeSync(parseFirst('||(false, 99)'), emptyEnv(), null))).toBe(99)
  })

  it('should evaluate if/else if expression', () => {
    const node = parseFirst('if false then 1 else if true then 2 else null end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(2)
  })

  it('should evaluate ?? nullish coalescing', () => {
    expect(runTrampoline(stepNodeSync(parseFirst('??(null, 42)'), emptyEnv(), null))).toBe(42)
    expect(runTrampoline(stepNodeSync(parseFirst('??(10, 42)'), emptyEnv(), null))).toBe(10)
  })

  it('should evaluate do block', () => {
    const node = parseFirst('do 1; 2; 3 end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(3)
  })

  it('should evaluate let binding', () => {
    const node = parseFirst('let x = 42;')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(42)
  })

  it('should evaluate array literal', () => {
    const node = parseFirst('[1, 2, 3]')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toEqual([1, 2, 3])
  })

  it('should evaluate object literal', () => {
    const node = parseFirst('{ a: 1, b: 2 }')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toEqual({ a: 1, b: 2 })
  })

  it('should evaluate lambda and immediate call', () => {
    const node = parseFirst('((x) -> x + 1)(10)')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(11)
  })

  it('should evaluate perform(@dvala.error) as error', () => {
    const node = parseFirst('perform(@dvala.error, { message: "test error" })')
    expect(() => runTrampoline(stepNodeSync(node, emptyEnv(), null))).toThrow(UserDefinedError)
  })

  it('should evaluate do...with handler on success', () => {
    const node = parseFirst('do with handler @dvala.error(arg) -> resume(0) end; 42 end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(42)
  })

  it('should evaluate string functions', () => {
    const node = parseFirst('str("hello", " ", "world")')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe('hello world')
  })

  it('should evaluate match expression', () => {
    const node = parseFirst('match 2 case 1 then "one" case 2 then "two" end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe('two')
  })

  it('should evaluate user-defined variable', () => {
    const node = parseFirst('x')
    const env = createContextStack({ globalContext: { x: { value: 'hello' } } })
    const step = stepNodeSync(node, env, null)
    expect(runTrampoline(step)).toBe('hello')
  })

  it('should evaluate loop with recur', () => {
    const node = parseFirst('loop (x = 0) -> if x < 5 then recur(x + 1) else x end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(5)
  })

  // 100K-iteration trampoline tests are CPU-bound and flake at vitest's
  // default 5s timeout when CI runs many test files in parallel and
  // starves the worker. Locally they finish in <1s; the bump is just
  // headroom against scheduling jitter, not a real perf regression.
  it('should handle deep loop recur without stack overflow (TCE)', () => {
    // 100,000 iterations would overflow a recursive evaluator's call stack.
    // The trampoline handles this via proper tail call elimination:
    // handleRecur slices the continuation stack at the LoopIterateFrame,
    // replacing it rather than growing the stack.
    const node = parseFirst('loop (n = 100000) -> if n > 0 then recur(n - 1) else n end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(0)
  }, 30000)

  it('should handle deep function recur without stack overflow (TCE)', () => {
    // Same principle for user-defined functions: handleRecur finds the
    // FnBodyFrame and calls setupUserDefinedCall with the remaining stack,
    // replacing the old frame rather than growing.
    const node = parseFirst('(n -> if n > 0 then recur(n - 1) else n end)(100000)')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(0)
  }, 30000)

  it('should handle deep mutual recur accumulating a result', () => {
    // Verify that recur correctly rebinds multiple parameters
    const node = parseFirst('loop (n = 100000, acc = 0) -> if n > 0 then recur(n - 1, acc + 1) else acc end')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(100000)
  }, 30000)

  it('should handle recur in function with multi-expression body', () => {
    // recur in the last expression of a multi-expression body
    const node = parseFirst(`
      ((n, acc) -> do
        let unused = n * 2;
        if n > 0 then recur(n - 1, acc + n) else acc end
      end)(100, 0)
    `)
    const step = stepNodeSync(node, emptyEnv(), null)
    // sum from 1 to 100 = 5050
    expect(runTrampoline(step)).toBe(5050)
  })

  it('should evaluate for loop', () => {
    const node = parseFirst('for (x in [1, 2, 3]) -> x * 2')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toEqual([2, 4, 6])
  })

  it('should evaluate for (formerly doseq)', () => {
    const node = parseFirst('for (x in [1, 2, 3]) -> x')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toEqual([1, 2, 3])
  })

  it('should evaluate nested function calls', () => {
    const node = parseFirst('(1 + 2) + (3 + 4)')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(10)
  })

  it('should evaluate array as function', () => {
    const node = parseFirst('[1, 2, 3](1)')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(2)
  })

  it('should evaluate object as function', () => {
    const node = parseFirst('{ a: 1, b: 2 }("b")')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(2)
  })

  it('should evaluate string as function', () => {
    const node = parseFirst('"a"({ a: 42 })')
    const step = stepNodeSync(node, emptyEnv(), null)
    expect(runTrampoline(step)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// runSyncTrampoline / runAsyncTrampoline parity
// ---------------------------------------------------------------------------

describe('sync/async trampoline parity', () => {
  // Both wrappers share the same tick() engine. These tests confirm
  // identical results for purely synchronous programs.

  const programs: [string, Any][] = [
    ['42', 42],
    ['"hello"', 'hello'],
    ['true', true],
    ['null', null],
    ['1 + 2 + 3', 6],
    ['(1 + 2) * (3 + 4)', 21],
    ['if true then 1 else 2 end', 1],
    ['if false then 1 else 2 end', 2],
    ['if false then 1 else if true then 2 else null end', 2],
    ['&& (true, true, 3)', 3],
    ['|| (false, false, 5)', 5],
    ['??(null, 42)', 42],
    ['do 1; 2; 3 end', 3],
    ['[1, 2, 3]', fromJS([1, 2, 3])],
    ['{ a: 1, b: 2 }', fromJS({ a: 1, b: 2 })],
    ['((x) -> x * 2)(21)', 42],
    ['loop (x = 0) -> if x < 5 then recur(x + 1) else x end', 5],
    ['(n -> if n > 0 then recur(n - 1) else n end)(10)', 0],
    ['do with handler @dvala.error(arg) -> resume(0) end; 1 + 2 end', 3],
    ['do with handler @dvala.error(arg) -> resume("caught") end; perform(@dvala.error, "oops") end', 'caught'],
    ['for (x in [1, 2, 3]) -> x * 10', fromJS([10, 20, 30])],
    ['match 3 case 1 then "one" case 3 then "three" end', 'three'],
  ]

  for (const [program, expected] of programs) {
    it(`sync and async produce same result for: ${program}`, async () => {
      const node = parseFirst(program)
      const syncStep: Step = { type: 'Eval', node, env: emptyEnv(), k: null }
      const asyncStep: Step = { type: 'Eval', node, env: emptyEnv(), k: null }

      const syncResult = runSyncTrampoline(syncStep)
      const asyncResult = await runAsyncTrampoline(asyncStep)

      expect(syncResult).toEqual(expected)
      expect(asyncResult).toEqual(expected)
    })
  }
})
