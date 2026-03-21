/**
 * Trampoline evaluator — explicit-stack evaluation engine.
 *
 * `stepNode(node, env, k)` maps an AST node to the next `Step`.
 * `applyFrame(frame, value, k)` processes a completed sub-result against a frame.
 * `tick(step)` processes one step and returns the next (or a Promise<Step> for async).
 * `runSyncTrampoline(step)` runs the trampoline synchronously to completion.
 * `runAsyncTrampoline(step)` runs the trampoline asynchronously to completion.
 *
 * Entry points:
 * - `evaluate(ast, contextStack)` — evaluate an AST (sync or async)
 * - `evaluateNode(node, contextStack)` — evaluate a single node (sync or async)
 *
 * Design principles:
 * - `stepNode` is always synchronous and returns `Step`.
 * - `applyFrame` may return `Step | Promise<Step>` when normal expressions
 *   or compound function types produce async results.
 * - Normal built-in expressions are called directly with pre-evaluated args.
 * - All binding and pattern matching use frame-based slot processing.
 * - All state lives in frames (no JS closures) — enabling serialization later.
 */

import { builtin } from '../builtin'
import { getAllBindingTargetNames } from '../builtin/bindingNode'
import { extractArrayRest, extractObjectRest, extractValueByPath, flattenBindingPattern, validateBindingRootType } from '../builtin/bindingSlot'
import type { BindingSlot } from '../builtin/bindingSlot'
import {
  checkArrayLengthConstraint,
  checkObjectTypeConstraint,
  checkTypeAtPath,
  extractMatchArrayRest,
  extractMatchObjectRest,
  extractMatchValueByPath,
  flattenMatchPattern,
} from '../builtin/matchSlot'
import type { LoopBindingNode } from '../builtin/specialExpressions/loops'
import type { MatchCase } from '../builtin/specialExpressions/match'
import { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import { NodeTypes, getNodeTypeName } from '../constants/constants'
import { DvalaError, UndefinedSymbolError, UserDefinedError } from '../errors'
import { getUndefinedSymbols } from '../getUndefinedSymbols'
import type { Any, Arr, Obj } from '../interface'
import { parse } from '../parser'
import type {
  Ast,
  AstNode,
  BindingNode,
  BindingTarget,
  DvalaFunction,
  EffectRef,
  EvaluatedFunction,
  FunctionLike,
  NormalExpressionNode,
  NumberNode,
  PartialFunction,
  ReservedSymbolNode,
  SpecialExpressionNode,
  StringNode,
  SymbolNode,
  TemplateStringNode,
  HandleNextFunction,
  UserDefinedFunction,
} from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { reservedSymbolRecord } from '../tokenizer/reservedNames'
import type { SourceCodeInfo } from '../tokenizer/token'
import { tokenize } from '../tokenizer/tokenize'
import { asNonUndefined, isUnknownRecord } from '../typeGuards'
import { annotate } from '../typeGuards/annotatedCollections'
import { isNormalBuiltinSymbolNode, isNormalExpressionNodeWithName, isSpreadNode, isUserDefinedSymbolNode } from '../typeGuards/astNode'
import { asAny, asFunctionLike, assertEffect, assertSeq, isAny, isEffect, isObj } from '../typeGuards/dvala'
import { isDvalaFunction, isUserDefinedFunction } from '../typeGuards/dvalaFunction'
import { assertNumber, isNumber } from '../typeGuards/number'
import { assertString } from '../typeGuards/string'
import { deepEqual, toAny } from '../utils'
import { arityAcceptsMin, assertNumberOfParams, toFixedArity } from '../utils/arity'
import { valueToString } from '../utils/debug/debugTools'
import type { MaybePromise } from '../utils/maybePromise'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import type { EffectContext, EffectHandler, Handlers, RunResult, Snapshot, SnapshotState } from './effectTypes'
import { HaltSignal, ResumeFromSignal, SUSPENDED_MESSAGE, SuspensionSignal, createSnapshot, effectNameMatchesPattern, findMatchingHandlers, generateUUID, isHaltSignal, isResumeFromSignal, isSuspensionSignal } from './effectTypes'
import type { ContextStack } from './ContextStack'
import { getEffectRef } from './effectRef'
import type { DeserializeOptions } from './suspension'
import { deserializeFromObject, serializeSuspensionBlob, serializeTerminalSnapshot, serializeToObject } from './suspension'
import { getStandardEffectHandler } from './standardEffects'
import type {
  AndFrame,
  ArrayBuildFrame,
  AutoCheckpointFrame,
  BindingSlotContext,
  BindingSlotFrame,
  CallFnFrame,
  ComplementFrame,
  CompFrame,
  CondFrame,
  ContinuationStack,
  DebugStepFrame,
  EffectResumeFrame,
  EffectRefFrame,
  EvalArgsFrame,
  EvaluatedWithHandler,
  EveryPredFrame,
  FnArgBindFrame,
  FnArgSlotCompleteFrame,
  FnBodyFrame,
  FnRestArgCompleteFrame,
  ForElementBindCompleteFrame,
  ForLetBindFrame,
  ForLoopFrame,
  Frame,
  HandleSetupFrame,
  HandleWithFrame,
  HandlerInvokeFrame,
  IfBranchFrame,
  ImportMergeFrame,
  JuxtFrame,
  LetBindCompleteFrame,
  LetBindFrame,
  LoopBindCompleteFrame,
  LoopBindFrame,
  LoopIterateFrame,
  MatchFrame,
  MatchSlotContext,
  MatchSlotFrame,
  NanCheckFrame,
  ObjectBuildFrame,
  OrFrame,
  ParallelResumeFrame,
  PerformArgsFrame,
  QqFrame,
  RecurFrame,
  RecurLoopRebindFrame,
  SequenceFrame,
  SomePredFrame,
  TemplateStringBuildFrame,
  TryWithFrame,
} from './frames'
import type { Context } from './interface'
import type { Step } from './step'

// Re-export for external use
export type { Step }

// ---------------------------------------------------------------------------
// Value-as-function helpers
// ---------------------------------------------------------------------------

function evaluateObjectAsFunction(fn: Obj, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.length !== 1)
    throw new DvalaError('Object as function requires one string parameter.', sourceCodeInfo)
  const key = params[0]
  assertString(key, sourceCodeInfo)
  return toAny(fn[key])
}

function evaluateArrayAsFunction(fn: Arr, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.length !== 1)
    throw new DvalaError('Array as function requires one non negative integer parameter.', sourceCodeInfo)
  const index = params[0]
  assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })
  return toAny(fn[index])
}

function evaluateStringAsFunction(fn: string, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.length !== 1)
    throw new DvalaError('String as function requires one Obj parameter.', sourceCodeInfo)
  const param = toAny(params[0])
  if (isObj(param))
    return toAny((param)[fn])
  if (isNumber(param, { integer: true }))
    return toAny(fn[param])
  throw new DvalaError(
    `string as function expects Obj or integer parameter, got ${valueToString(param)}`,
    sourceCodeInfo,
  )
}

function evaluateNumberAsFunction(fn: number, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  assertNumber(fn, undefined, { integer: true })
  if (params.length !== 1)
    throw new DvalaError('Number as function requires one Arr parameter.', sourceCodeInfo)
  const param = params[0]
  assertSeq(param, sourceCodeInfo)
  return toAny(param[fn])
}

// ---------------------------------------------------------------------------
// Reserved symbol evaluation
// ---------------------------------------------------------------------------

function evaluateReservedSymbol(node: ReservedSymbolNode): Any {
  const reservedName = node[1]
  if (!['true', 'false', 'null'].includes(reservedName)) {
    throw new DvalaError(`Reserved symbol ${reservedName} cannot be evaluated`, node[2])
  }
  const value = reservedSymbolRecord[reservedName]
  return asNonUndefined(value, node[2])
}

// ---------------------------------------------------------------------------
// Lambda helper (closure capture) — used by stepSpecialExpression for lambda
// ---------------------------------------------------------------------------

function evaluateFunction(
  fn: [BindingTarget[], AstNode[], ...unknown[]],
  contextStack: ContextStack,
): EvaluatedFunction {
  const functionContext: Context = {}
  const context = fn[0].reduce((ctx: Context, arg) => {
    Object.keys(getAllBindingTargetNames(arg)).forEach(name => {
      ctx[name] = { value: null }
    })
    return ctx
  }, {})
  const undefinedSymbols = getUndefinedSymbols(fn[1], contextStack.new(context), builtin)
  undefinedSymbols.forEach(name => {
    const value = contextStack.getValue(name)
    if (isAny(value)) {
      functionContext[name] = { value }
    }
  })
  return [fn[0], fn[1], functionContext]
}

// ---------------------------------------------------------------------------
// stepNode — map an AST node to the next Step
// ---------------------------------------------------------------------------

/**
 * Given an AST node, its environment, and a continuation stack, return
 * the next Step for the trampoline to process.
 *
 * Leaf nodes (numbers, strings, symbols) immediately produce values.
 * Compound nodes (expressions) push frames and return sub-evaluations.
 */
export function stepNode(node: AstNode, env: ContextStack, k: ContinuationStack): Step | Promise<Step> {
  switch (node[0]) {
    case NodeTypes.Number:
      return { type: 'Value', value: (node as NumberNode)[1], k }
    case NodeTypes.String:
      return { type: 'Value', value: (node as StringNode)[1], k }
    case NodeTypes.NormalBuiltinSymbol:
    case NodeTypes.SpecialBuiltinSymbol:
    case NodeTypes.UserDefinedSymbol:
      return { type: 'Value', value: env.evaluateSymbol(node as SymbolNode), k }
    case NodeTypes.ReservedSymbol:
      return { type: 'Value', value: evaluateReservedSymbol(node as ReservedSymbolNode), k }
    case NodeTypes.NormalExpression:
      return stepNormalExpression(node as NormalExpressionNode, env, k)
    case NodeTypes.SpecialExpression:
      return stepSpecialExpression(node as SpecialExpressionNode, env, k)
    case NodeTypes.TemplateString:
      return stepTemplateString(node as TemplateStringNode, env, k)
    case NodeTypes.EffectName:
      return { type: 'Value', value: getEffectRef(node[1] as string), k }
    /* v8 ignore next 2 */
    default:
      throw new DvalaError(`${getNodeTypeName(node[0])}-node cannot be evaluated`, node[2])
  }
}

// ---------------------------------------------------------------------------
// stepTemplateString — evaluate interpolated segments and concatenate
// ---------------------------------------------------------------------------

function stepTemplateString(node: TemplateStringNode, env: ContextStack, k: ContinuationStack): Step {
  const segments = node[1]
  const sourceCodeInfo = node[2]

  if (segments.length === 0) {
    return { type: 'Value', value: '', k }
  }

  const frame: TemplateStringBuildFrame = {
    type: 'TemplateStringBuild',
    segments,
    index: 0,
    result: '',
    env,
    sourceCodeInfo,
  }

  return { type: 'Eval', node: segments[0]!, env, k: [frame, ...k] }
}

// ---------------------------------------------------------------------------
// stepNormalExpression — start evaluating a function call's arguments
// ---------------------------------------------------------------------------

/**
 * Normal expressions: evaluate arguments left-to-right, then dispatch.
 * Push EvalArgsFrame + NanCheckFrame, then start evaluating the first arg.
 */
function stepNormalExpression(node: NormalExpressionNode, env: ContextStack, k: ContinuationStack): Step | Promise<Step> {
  const argNodes = node[1][1]
  const sourceCodeInfo = node[2]

  // NaN guard wraps the final result
  const nanFrame: NanCheckFrame = { type: 'NanCheck', sourceCodeInfo }

  // Argument evaluator frame
  const evalArgsFrame: EvalArgsFrame = {
    type: 'EvalArgs',
    node,
    index: 0,
    params: [],
    placeholders: [],
    env,
    sourceCodeInfo,
  }

  // Find the first real argument to evaluate (skip leading placeholders)
  let startIndex = 0
  while (startIndex < argNodes.length) {
    const arg = argNodes[startIndex]!
    if (arg[0] === NodeTypes.ReservedSymbol && arg[1] === '_') {
      evalArgsFrame.placeholders.push(evalArgsFrame.params.length)
      startIndex++
    } else {
      break
    }
  }
  evalArgsFrame.index = startIndex

  if (startIndex >= argNodes.length) {
    // No real args to evaluate — dispatch immediately
    return dispatchCall(evalArgsFrame, [nanFrame, ...k])
  }

  // Start evaluating the first real argument
  const firstArg = argNodes[startIndex]!
  const newK: ContinuationStack = [evalArgsFrame, nanFrame, ...k]
  if (isSpreadNode(firstArg)) {
    return { type: 'Eval', node: firstArg[1], env, k: newK }
  }
  return { type: 'Eval', node: firstArg, env, k: newK }
}

// ---------------------------------------------------------------------------
// stepSpecialExpression — push frame for a special expression
// ---------------------------------------------------------------------------

/**
 * Special expressions: push a frame appropriate to the expression type
 * and return an EvalStep for the first sub-expression.
 */
function stepSpecialExpression(node: SpecialExpressionNode, env: ContextStack, k: ContinuationStack): Step | Promise<Step> {
  const sourceCodeInfo = node[2]
  const type = node[1][0]

  switch (type) {
    // --- if / unless ---
    case specialExpressionTypes.if:
    case specialExpressionTypes.unless: {
      const [conditionNode, thenNode, elseNode] = node[1][1] as [AstNode, AstNode, AstNode?]
      const frame: IfBranchFrame = {
        type: 'IfBranch',
        thenNode,
        elseNode,
        inverted: type === specialExpressionTypes.unless,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: conditionNode, env, k: [frame, ...k] }
    }

    // --- && (and) ---
    case specialExpressionTypes['&&']: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return { type: 'Value', value: true, k }
      }
      const frame: AndFrame = {
        type: 'And',
        nodes,
        index: 1,
        env,
        sourceCodeInfo,
      }
      if (nodes.length === 1) {
        return { type: 'Eval', node: nodes[0]!, env, k }
      }
      return { type: 'Eval', node: nodes[0]!, env, k: [frame, ...k] }
    }

    // --- || (or) ---
    case specialExpressionTypes['||']: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return { type: 'Value', value: false, k }
      }
      const frame: OrFrame = {
        type: 'Or',
        nodes,
        index: 1,
        env,
        sourceCodeInfo,
      }
      if (nodes.length === 1) {
        return { type: 'Eval', node: nodes[0]!, env, k }
      }
      return { type: 'Eval', node: nodes[0]!, env, k: [frame, ...k] }
    }

    // --- ?? (nullish coalescing) ---
    case specialExpressionTypes['??']: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return { type: 'Value', value: null, k }
      }
      // Check if the first node is an undefined user symbol
      const firstNode = nodes[0]!
      if (isUserDefinedSymbolNode(firstNode) && env.lookUp(firstNode) === null) {
        // Undefined symbol — treat as null, skip to next
        // Single-arg with undefined symbol — unreachable: ??(x) uses evaluateAsNormalExpression, infix requires 2+ operands
        /* v8 ignore next 3 */
        if (nodes.length === 1) {
          return { type: 'Value', value: null, k }
        }
        const frame: QqFrame = {
          type: 'Qq',
          nodes,
          index: 2,
          env,
          sourceCodeInfo,
        }
        const nextNode = nodes[1]!
        if (isUserDefinedSymbolNode(nextNode) && env.lookUp(nextNode) === null) {
          // Also undefined — continue skipping
          return skipUndefinedQq(frame, k)
        }
        if (nodes.length === 2) {
          return { type: 'Eval', node: nextNode, env, k }
        }
        return { type: 'Eval', node: nextNode, env, k: [frame, ...k] }
      }
      const frame: QqFrame = {
        type: 'Qq',
        nodes,
        index: 1,
        env,
        sourceCodeInfo,
      }
      // Single-arg — unreachable: ??(x) uses evaluateAsNormalExpression, infix requires 2+ operands
      /* v8 ignore next 3 */
      if (nodes.length === 1) {
        return { type: 'Eval', node: firstNode, env, k }
      }
      return { type: 'Eval', node: firstNode, env, k: [frame, ...k] }
    }

    // --- cond ---
    case specialExpressionTypes.cond: {
      const cases = node[1][1] as [AstNode, AstNode][]
      if (cases.length === 0) {
        return { type: 'Value', value: null, k }
      }
      const frame: CondFrame = {
        type: 'Cond',
        phase: 'test',
        cases,
        index: 0,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: cases[0]![0], env, k: [frame, ...k] }
    }

    // --- match ---
    case specialExpressionTypes.match: {
      const matchValueNode = node[1][1] as AstNode
      const cases = node[1][2] as MatchCase[]
      const frame: MatchFrame = {
        type: 'Match',
        phase: 'matchValue',
        matchValue: null,
        cases,
        index: 0,
        bindings: {},
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: matchValueNode, env, k: [frame, ...k] }
    }

    // --- block (do...end, do...with...end) ---
    case specialExpressionTypes.block: {
      const nodes = node[1][1] as AstNode[]
      const withHandlerNodes = node[1][2] as [AstNode, AstNode][] | undefined
      const newContext: Context = {}
      const newEnv = env.create(newContext)

      // If there are effect handlers, evaluate effect refs via frames
      if (withHandlerNodes && withHandlerNodes.length > 0) {
        const effectRefFrame: EffectRefFrame = {
          type: 'EffectRef',
          handlerNodes: withHandlerNodes,
          evaluatedHandlers: [],
          index: 0,
          bodyNodes: nodes,
          bodyEnv: newEnv,
          env,
          sourceCodeInfo,
        }
        const firstEffectExpr = withHandlerNodes[0]![0]
        return { type: 'Eval', node: firstEffectExpr, env, k: [effectRefFrame, ...k] }
      }

      // No effect handlers — evaluate body directly
      if (nodes.length === 0) {
        return { type: 'Value', value: null, k }
      }
      if (nodes.length === 1) {
        return { type: 'Eval', node: nodes[0]!, env: newEnv, k }
      }
      const frame: SequenceFrame = {
        type: 'Sequence',
        nodes,
        index: 1,
        env: newEnv,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: nodes[0]!, env: newEnv, k: [frame, ...k] }
    }

    // --- let ---
    case specialExpressionTypes.let: {
      const bindingNode = node[1][1] as BindingNode
      const target = bindingNode[1][0]
      const valueNode = bindingNode[1][1]
      const frame: LetBindFrame = {
        type: 'LetBind',
        target,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: valueNode, env, k: [frame, ...k] }
    }

    // --- loop ---
    case specialExpressionTypes.loop: {
      const bindingNodes = node[1][1] as BindingNode[]
      const body = node[1][2] as AstNode
      // Parser requires at least one binding — zero bindings is parser-prevented
      /* v8 ignore start */
      if (bindingNodes.length === 0) {
        // No bindings — just evaluate the body with an empty context
        const newContext: Context = {}
        const frame: LoopIterateFrame = {
          type: 'LoopIterate',
          bindingNodes,
          bindingContext: newContext,
          body,
          env: env.create(newContext),
          sourceCodeInfo,
        }
        return { type: 'Eval', node: body, env: env.create(newContext), k: [frame, ...k] }
      }
      /* v8 ignore stop */
      // Start evaluating the first binding's value
      const frame: LoopBindFrame = {
        type: 'LoopBind',
        phase: 'value',
        bindingNodes,
        index: 0,
        context: {},
        body,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: bindingNodes[0]![1][1], env, k: [frame, ...k] }
    }

    // --- for / doseq ---
    case specialExpressionTypes.for:
    case specialExpressionTypes.doseq: {
      const loopBindings = node[1][1] as LoopBindingNode[]
      const body = node[1][2] as AstNode
      const returnResult = type === specialExpressionTypes.for
      // Parser requires at least one loop binding — zero bindings is parser-prevented
      /* v8 ignore next 3 */
      if (loopBindings.length === 0) {
        return { type: 'Value', value: returnResult ? [] : null, k }
      }
      const context: Context = {}
      const newEnv = env.create(context)
      const frame: ForLoopFrame = {
        type: 'ForLoop',
        returnResult,
        bindingNodes: loopBindings,
        body,
        result: [],
        phase: 'evalCollection',
        bindingLevel: 0,
        levelStates: [],
        context,
        env: newEnv,
        sourceCodeInfo,
      }
      // Evaluate the first binding's collection expression
      const firstBinding = loopBindings[0]!
      const collectionNode = firstBinding[0][1][1] // bindingNode → [target, valueNode]
      return { type: 'Eval', node: collectionNode, env: newEnv, k: [frame, ...k] }
    }

    // --- recur ---
    case specialExpressionTypes.recur: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return handleRecur([], k, sourceCodeInfo)
      }
      const frame: RecurFrame = {
        type: 'Recur',
        nodes,
        index: 1,
        params: [],
        env,
        sourceCodeInfo,
      }
      if (nodes.length === 1) {
        // Only one param — evaluate it, then recur
        const singleFrame: RecurFrame = { ...frame, index: 1 }
        return { type: 'Eval', node: nodes[0]!, env, k: [singleFrame, ...k] }
      }
      return { type: 'Eval', node: nodes[0]!, env, k: [frame, ...k] }
    }

    // --- array ---
    case specialExpressionTypes.array: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return { type: 'Value', value: [], k }
      }
      const firstNode = nodes[0]!
      const isFirstSpread = isSpreadNode(firstNode)
      const frame: ArrayBuildFrame = {
        type: 'ArrayBuild',
        nodes,
        index: 0,
        result: [],
        isSpread: isFirstSpread,
        env,
        sourceCodeInfo,
      }
      return {
        type: 'Eval',
        node: isFirstSpread ? firstNode[1] : firstNode,
        env,
        k: [frame, ...k],
      }
    }

    // --- object ---
    case specialExpressionTypes.object: {
      const nodes = node[1][1] as AstNode[]
      if (nodes.length === 0) {
        return { type: 'Value', value: {}, k }
      }
      const firstNode = nodes[0]!
      const isFirstSpread = isSpreadNode(firstNode)
      const frame: ObjectBuildFrame = {
        type: 'ObjectBuild',
        nodes,
        index: 0,
        result: {},
        currentKey: null,
        isSpread: isFirstSpread,
        env,
        sourceCodeInfo,
      }
      return {
        type: 'Eval',
        node: isFirstSpread ? firstNode[1] : firstNode,
        env,
        k: [frame, ...k],
      }
    }

    // --- lambda (fn / ->) ---
    case specialExpressionTypes['0_lambda']: {
      const fn = node[1][1] as [BindingTarget[], AstNode[], ...unknown[]]
      const evaluatedFunc = evaluateFunction(fn, env)
      const min = evaluatedFunc[0].filter(arg => arg[0] !== bindingTargetTypes.rest && arg[1][1] === undefined).length
      const max = evaluatedFunc[0].some(arg => arg[0] === bindingTargetTypes.rest) ? undefined : evaluatedFunc[0].length
      const arity = { min: min > 0 ? min : undefined, max }
      const dvalaFunction: DvalaFunction = {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo: node[2],
        functionType: 'UserDefined',
        name: undefined,
        evaluatedfunction: evaluatedFunc,
        arity,
        docString: '',
      }
      return { type: 'Value', value: dvalaFunction, k }
    }

    // --- defined? ---
    case specialExpressionTypes['defined?']: {
      const symbolNode = node[1][1] as SymbolNode
      if (!isUserDefinedSymbolNode(symbolNode)) {
        return { type: 'Value', value: true, k }
      }
      const lookUpResult = env.lookUp(symbolNode)
      return { type: 'Value', value: lookUpResult !== null, k }
    }

    // --- import ---
    case specialExpressionTypes.import: {
      const moduleName = node[1][1] as string
      // Check for value modules first (file modules from bundles)
      const valueModule = env.getValueModule(moduleName)
      if (valueModule.found) {
        return { type: 'Value', value: valueModule.value as Any, k }
      }
      // Fall back to builtin modules
      const dvalaModule = env.getModule(moduleName)
      if (!dvalaModule) {
        throw new DvalaError(`Unknown module: '${moduleName}'`, sourceCodeInfo)
      }
      const result: Obj = {}
      for (const [functionName, expression] of Object.entries(dvalaModule.functions)) {
        result[functionName] = {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'Module',
          moduleName,
          functionName,
          arity: expression.arity,
        }
      }
      // Module source evaluation — initCoreDvalaSources pre-evaluates core module sources at startup
      // and modules with .source are resolved before reaching this trampoline path
      /* v8 ignore start */
      if (dvalaModule.source) {
        const nodes = parse(minifyTokenStream(tokenize(dvalaModule.source, false, undefined), { removeWhiteSpace: true }))
        const sourceEnv = env.create({})
        const mergeFrame: ImportMergeFrame = { type: 'ImportMerge', tsFunctions: result, moduleName, module: dvalaModule, env, sourceCodeInfo }
        if (nodes.length === 1) {
          return { type: 'Eval', node: nodes[0]!, env: sourceEnv, k: [mergeFrame, ...k] }
        }
        const sequenceFrame: SequenceFrame = { type: 'Sequence', nodes, index: 1, env: sourceEnv }
        return { type: 'Eval', node: nodes[0]!, env: sourceEnv, k: [sequenceFrame, mergeFrame, ...k] }
      }
      /* v8 ignore stop */
      env.registerValueModule(moduleName, result)
      return { type: 'Value', value: result, k }
    }

    // --- effect ---
    case specialExpressionTypes.effect: {
      const effectName = node[1][1] as string
      return { type: 'Value', value: getEffectRef(effectName), k }
    }

    // --- perform ---
    case specialExpressionTypes.perform: {
      const effectExpr = node[1][1] as AstNode
      const payloadExpr = node[1][2] as AstNode | undefined
      const allNodes = payloadExpr ? [effectExpr, payloadExpr] : [effectExpr]
      if (allNodes.length === 1) {
        // Only the effect expression, no payload — evaluate effect then dispatch
        const frame: PerformArgsFrame = {
          type: 'PerformArgs',
          argNodes: allNodes,
          index: 1,
          params: [],
          env,
          sourceCodeInfo,
        }
        return { type: 'Eval', node: allNodes[0]!, env, k: [frame, ...k] }
      }
      const frame: PerformArgsFrame = {
        type: 'PerformArgs',
        argNodes: allNodes,
        index: 1,
        params: [],
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: allNodes[0]!, env, k: [frame, ...k] }
    }

    // --- parallel ---
    case specialExpressionTypes.parallel: {
      const branches = node[1][1] as AstNode[]
      return { type: 'Parallel', branches, env, k }
    }

    // --- race ---
    case specialExpressionTypes.race: {
      const branches = node[1][1] as AstNode[]
      return { type: 'Race', branches, env, k }
    }

    // --- handle...with ---
    case specialExpressionTypes.handle: {
      const bodyExprs = node[1][1] as AstNode[]
      const handlersExpr = node[1][2] as AstNode
      // First evaluate the handlers expression, then set up the HandleWithFrame
      const setupFrame: HandleSetupFrame = {
        type: 'HandleSetup',
        bodyExprs,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: handlersExpr, env, k: [setupFrame, ...k] }
    }

    /* v8 ignore next 2 */
    default:
      throw new DvalaError(`Unknown special expression type: ${type}`, sourceCodeInfo)
  }
}

// ---------------------------------------------------------------------------
// dispatchCall — dispatch a function call after args are evaluated
// ---------------------------------------------------------------------------

/**
 * After all arguments are collected in an EvalArgsFrame, determine what
 * to call and return the next Step.
 */
function dispatchCall(frame: EvalArgsFrame, k: ContinuationStack): Step | Promise<Step> {
  const { node, params, placeholders, env, sourceCodeInfo } = frame

  if (isNormalExpressionNodeWithName(node)) {
    const nameSymbol = node[1][0]

    // --- Partial application ---
    if (placeholders.length > 0) {
      const fn = env.evaluateSymbol(nameSymbol)
      const partialFunction: PartialFunction = {
        [FUNCTION_SYMBOL]: true,
        function: asFunctionLike(fn, sourceCodeInfo),
        functionType: 'Partial',
        params,
        placeholders,
        sourceCodeInfo,
        arity: toFixedArity(placeholders.length),
      }
      return { type: 'Value', value: partialFunction, k }
    }

    // --- Named builtin ---
    if (isNormalBuiltinSymbolNode(nameSymbol)) {
      const builtinType = nameSymbol[1]
      const normalExpression = builtin.allNormalExpressions[builtinType]!
      if (env.pure && normalExpression.pure === false) {
        throw new DvalaError(`Cannot call impure function '${normalExpression.name}' in pure mode`, sourceCodeInfo)
      }
      // dvalaImpl dispatch — initCoreDvalaSources sets dvalaImpl on core expressions at startup,
      // module expressions get dvalaImpl via ImportMerge, but the trampoline import handler
      // resolves modules from the valueModules cache so this path is never reached
      /* v8 ignore next 3 */
      if (normalExpression.dvalaImpl) {
        return setupUserDefinedCall(normalExpression.dvalaImpl, params, env, sourceCodeInfo, k)
      }
      const result = normalExpression.evaluate(params, sourceCodeInfo, env)
      return wrapMaybePromiseAsStep(result, k)
    }

    // --- Named user-defined ---
    const fn = env.getValue(nameSymbol[1])
    if (fn !== undefined) {
      return dispatchFunction(asFunctionLike(fn, sourceCodeInfo), params, placeholders, env, sourceCodeInfo, k)
    }
    throw new UndefinedSymbolError(nameSymbol[1], sourceCodeInfo)
  } else {
    // --- Anonymous function expression ---
    // The function expression is the first payload element; need to evaluate it
    const fnNode: AstNode = node[1][0]
    const callFrame: CallFnFrame = {
      type: 'CallFn',
      params,
      placeholders,
      env,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: fnNode, env, k: [callFrame, ...k] }
  }
}

/**
 * Dispatch a resolved function value with pre-evaluated parameters.
 */
function dispatchFunction(fn: FunctionLike, params: Arr, placeholders: number[], env: ContextStack, sourceCodeInfo: SourceCodeInfo | undefined, k: ContinuationStack): Step | Promise<Step> {
  if (placeholders.length > 0) {
    const partialFunction: PartialFunction = {
      [FUNCTION_SYMBOL]: true,
      function: fn,
      functionType: 'Partial',
      params,
      placeholders,
      sourceCodeInfo,
      arity: toFixedArity(placeholders.length),
    }
    return { type: 'Value', value: partialFunction, k }
  }

  if (isDvalaFunction(fn)) {
    return dispatchDvalaFunction(fn, params, env, sourceCodeInfo, k)
  }

  // Non-function callables: arrays, objects, strings, numbers
  if (Array.isArray(fn)) {
    return { type: 'Value', value: evaluateArrayAsFunction(fn, params, sourceCodeInfo), k }
  }
  if (isObj(fn)) {
    return { type: 'Value', value: evaluateObjectAsFunction(fn, params, sourceCodeInfo), k }
  }
  if (typeof fn === 'string') {
    return { type: 'Value', value: evaluateStringAsFunction(fn, params, sourceCodeInfo), k }
  }
  if (isNumber(fn)) {
    return { type: 'Value', value: evaluateNumberAsFunction(fn, params, sourceCodeInfo), k }
  }
  /* v8 ignore next 1 */
  throw new DvalaError('Unexpected function type', sourceCodeInfo)
}

/**
 * Dispatch a DvalaFunction. User-defined functions are set up with frames;
 * some compound function types still use the recursive executor for iteration.
 */
function dispatchDvalaFunction(fn: DvalaFunction, params: Arr, env: ContextStack, sourceCodeInfo: SourceCodeInfo | undefined, k: ContinuationStack): Step | Promise<Step> {
  switch (fn.functionType) {
    case 'UserDefined': {
      return setupUserDefinedCall(fn, params, env, sourceCodeInfo, k)
    }
    // Simple compound types: no recursion needed
    case 'Constantly': {
      // (constantly value) returns value regardless of params
      return { type: 'Value', value: fn.value, k }
    }
    case 'EffectMatcher': {
      // Pure regex/string matching - no evaluation needed
      assertNumberOfParams({ min: 1, max: 1 }, params.length, fn.sourceCodeInfo ?? sourceCodeInfo)
      const effectRef = params[0]
      assertEffect(effectRef, sourceCodeInfo)
      const effectName = effectRef.name
      if (fn.matchType === 'string') {
        return { type: 'Value', value: effectNameMatchesPattern(effectName, fn.pattern), k }
      }
      const regexp = new RegExp(fn.pattern, fn.flags)
      return { type: 'Value', value: regexp.test(effectName), k }
    }
    case 'HandleNext': {
      // next(eff, arg) — dispatch to the next handler in the chain
      assertNumberOfParams({ min: 2, max: 2 }, params.length, fn.sourceCodeInfo ?? sourceCodeInfo)
      const nextEff = params[0] as Any
      const nextArg = params[1] as Any
      assertEffect(nextEff, sourceCodeInfo)
      const { handlers, handlerIndex, resumeK } = fn
      const rk = resumeK as ContinuationStack

      if (handlerIndex >= handlers.length) {
        // No more handlers in the chain — propagate past the HandleWithFrame.
        // Mark the EffectResumeFrame as no longer executing the handler body,
        // so that errors from downstream dispatch can be caught by the same scope.
        const topFrame = k[0]
        if (topFrame?.type === 'EffectResume') {
          topFrame.handlerExecuting = false
        }
        // skipCheckpointCapture prevents double-capturing checkpoints that were
        // already captured upstream before the handler chain was invoked.
        return { type: 'Perform', effect: nextEff, arg: nextArg, k, sourceCodeInfo, skipCheckpointCapture: true }
      }

      // Call handlers[handlerIndex](eff, arg, nextNextFn)
      const nextNextFn = buildNextFunction(handlers, handlerIndex + 1, rk, sourceCodeInfo)
      const handler = handlers[handlerIndex]!
      const fnLike = asFunctionLike(handler, sourceCodeInfo)
      // The handler runs on the same k (which has EffectResumeFrame → outerK)
      return dispatchFunction(fnLike, [nextEff, nextArg, nextNextFn], [], env, sourceCodeInfo, k)
    }
    // Param-transforming compound types: transform and re-dispatch
    case 'Partial': {
      const actualParams = [...fn.params]
      if (params.length !== fn.placeholders.length) {
        throw new DvalaError(`(partial) expects ${fn.placeholders.length} arguments, got ${params.length}.`, sourceCodeInfo)
      }
      const paramsCopy = [...params]
      for (const placeholderIndex of fn.placeholders) {
        actualParams.splice(placeholderIndex, 0, paramsCopy.shift())
      }
      return dispatchFunction(fn.function, actualParams, [], env, sourceCodeInfo, k)
    }
    case 'Fnull': {
      const fnulledParams = params.map((param, index) => (param === null ? toAny(fn.params[index]) : param))
      return dispatchFunction(fn.function, fnulledParams, [], env, sourceCodeInfo, k)
    }
    // Complement: call wrapped function, then negate result
    case 'Complement': {
      const frame: ComplementFrame = { type: 'Complement', sourceCodeInfo }
      return dispatchFunction(fn.function, params, [], env, sourceCodeInfo, [frame, ...k])
    }
    // Comp: chain function calls right-to-left
    case 'Comp': {
      const fns = fn.params
      if (fns.length === 0) {
        if (params.length !== 1)
          throw new DvalaError(`(comp) expects one argument, got ${valueToString(params.length)}.`, sourceCodeInfo)
        return { type: 'Value', value: asAny(params[0], sourceCodeInfo), k }
      }
      // Start with the last function
      const startIndex = fns.length - 1
      const frame: CompFrame = { type: 'Comp', fns, index: startIndex - 1, env, sourceCodeInfo }
      return dispatchFunction(asFunctionLike(fns[startIndex], sourceCodeInfo), params, [], env, sourceCodeInfo, [frame, ...k])
    }
    // Juxt: call each function with same params, collect results
    case 'Juxt': {
      const fns = fn.params
      if (fns.length === 0) {
        return { type: 'Value', value: [] as Arr, k }
      }
      const frame: JuxtFrame = { type: 'Juxt', fns, params, index: 1, results: [], env, sourceCodeInfo }
      return dispatchFunction(asFunctionLike(fns[0], sourceCodeInfo), params, [], env, sourceCodeInfo, [frame, ...k])
    }
    // EveryPred: short-circuit AND across all (predicate, param) pairs
    case 'EveryPred': {
      const checks: { fn: FunctionLike; param: Any }[] = []
      for (const f of fn.params) {
        for (const p of params) {
          checks.push({ fn: asFunctionLike(f, sourceCodeInfo), param: p as Any })
        }
      }
      if (checks.length === 0) {
        return { type: 'Value', value: true, k }
      }
      const frame: EveryPredFrame = { type: 'EveryPred', checks, index: 1, env, sourceCodeInfo }
      const firstCheck = checks[0]!
      return dispatchFunction(firstCheck.fn, [firstCheck.param], [], env, sourceCodeInfo, [frame, ...k])
    }
    // SomePred: short-circuit OR across all (predicate, param) pairs
    case 'SomePred': {
      const checks: { fn: FunctionLike; param: Any }[] = []
      for (const f of fn.params) {
        for (const p of params) {
          checks.push({ fn: asFunctionLike(f, sourceCodeInfo), param: p as Any })
        }
      }
      if (checks.length === 0) {
        return { type: 'Value', value: false, k }
      }
      const frame: SomePredFrame = { type: 'SomePred', checks, index: 1, env, sourceCodeInfo }
      const firstCheck = checks[0]!
      return dispatchFunction(firstCheck.fn, [firstCheck.param], [], env, sourceCodeInfo, [frame, ...k])
    }
    case 'SpecialBuiltin': {
      const specialExpression = asNonUndefined(builtin.specialExpressions[fn.specialBuiltinSymbolType], sourceCodeInfo)
      if (specialExpression.evaluateAsNormalExpression) {
        const result = specialExpression.evaluateAsNormalExpression(params, sourceCodeInfo, env)
        return wrapMaybePromiseAsStep(result, k)
      }
      throw new DvalaError(`Special builtin function ${fn.specialBuiltinSymbolType} is not supported as normal expression.`, sourceCodeInfo)
    }
    case 'Module': {
      const dvalaModule = env.getModule(fn.moduleName)
      if (!dvalaModule) {
        throw new DvalaError(`Module '${fn.moduleName}' not found.`, sourceCodeInfo)
      }
      const expression = dvalaModule.functions[fn.functionName]
      if (!expression) {
        throw new DvalaError(`Function '${fn.functionName}' not found in module '${fn.moduleName}'.`, sourceCodeInfo)
      }
      if (env.pure && expression.pure === false) {
        throw new DvalaError(`Cannot call impure function '${fn.functionName}' in pure mode`, sourceCodeInfo)
      }
      assertNumberOfParams(expression.arity, params.length, sourceCodeInfo)
      if (expression.dvalaImpl) {
        return setupUserDefinedCall(expression.dvalaImpl, params, env, sourceCodeInfo, k)
      }
      const result = expression.evaluate(params, sourceCodeInfo, env)
      return wrapMaybePromiseAsStep(result, k)
    }
    case 'Builtin': {
      const normalExpression = builtin.allNormalExpressions[fn.normalBuiltinSymbolType]!
      if (env.pure && normalExpression.pure === false) {
        throw new DvalaError(`Cannot call impure function '${normalExpression.name}' in pure mode`, sourceCodeInfo)
      }
      if (normalExpression.dvalaImpl) {
        return setupUserDefinedCall(normalExpression.dvalaImpl, params, env, sourceCodeInfo, k)
      }
      const result = normalExpression.evaluate(params, sourceCodeInfo, env)
      return wrapMaybePromiseAsStep(result, k)
    }
  }
}

/**
 * Set up a user-defined function call: bind params, push FnBodyFrame.
 *
 * Uses frame-based binding slots for all argument binding, enabling
 * suspension/serialization at any point during destructuring.
 */
function setupUserDefinedCall(fn: UserDefinedFunction, params: Arr, env: ContextStack, sourceCodeInfo: SourceCodeInfo | undefined, k: ContinuationStack): Step {
  if (!arityAcceptsMin(fn.arity, params.length)) {
    throw new DvalaError(`Expected ${fn.arity} arguments, got ${params.length}.`, sourceCodeInfo)
  }
  const evaluatedFunc = fn.evaluatedfunction
  const args = evaluatedFunc[0]
  const nbrOfNonRestArgs = args.filter(arg => arg[0] !== bindingTargetTypes.rest).length
  const context: Context = { self: { value: fn } }

  // Start binding the first provided argument using slots
  return continueArgSlotBinding(fn, params, 0, nbrOfNonRestArgs, context, env, sourceCodeInfo, k)
}

/**
 * Continue binding function arguments using slot-based binding.
 * Handles provided args, defaults, rest, then proceeds to body.
 */
function continueArgSlotBinding(
  fn: UserDefinedFunction,
  params: Arr,
  argIndex: number,
  nbrOfNonRestArgs: number,
  context: Context,
  outerEnv: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const evaluatedFunc = fn.evaluatedfunction
  const args = evaluatedFunc[0]
  const closureContext = evaluatedFunc[2]
  const bindingEnv = outerEnv.create(closureContext).create(context)

  // Phase 1: Bind provided args (not needing defaults)
  if (argIndex < params.length && argIndex < nbrOfNonRestArgs) {
    const param = toAny(params[argIndex])
    const argTarget = args[argIndex]!
    const completeFrame: FnArgSlotCompleteFrame = {
      type: 'FnArgSlotComplete',
      fn,
      params,
      argIndex,
      nbrOfNonRestArgs,
      context,
      outerEnv,
      sourceCodeInfo,
    }
    return startBindingSlots(argTarget, param, bindingEnv, sourceCodeInfo, [completeFrame, ...k])
  }

  // Phase 2: Bind args needing defaults
  if (argIndex < nbrOfNonRestArgs) {
    return continueBindingArgs(fn, params, argIndex, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo, k)
  }

  // Phase 3: Handle rest argument
  return handleRestArgAndBody(fn, params, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo, k)
}

/**
 * Handle rest argument binding and proceed to body evaluation.
 */
function handleRestArgAndBody(
  fn: UserDefinedFunction,
  params: Arr,
  nbrOfNonRestArgs: number,
  context: Context,
  outerEnv: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const evaluatedFunc = fn.evaluatedfunction
  const args = evaluatedFunc[0]
  const closureContext = evaluatedFunc[2]
  const bindingEnv = outerEnv.create(closureContext).create(context)

  // Handle rest argument
  const rest: Arr = params.slice(nbrOfNonRestArgs).map(toAny)
  const restArgument = args.find(arg => arg[0] === bindingTargetTypes.rest)
  if (restArgument) {
    // Use startBindingSlots for rest arg with completion frame
    const completeFrame: FnRestArgCompleteFrame = {
      type: 'FnRestArgComplete',
      fn,
      context,
      outerEnv,
      sourceCodeInfo,
    }
    return startBindingSlots(restArgument, rest, bindingEnv, sourceCodeInfo, [completeFrame, ...k])
  }

  // No rest arg - proceed directly to body
  return proceedToFnBody(fn, context, outerEnv, sourceCodeInfo, k)
}

/**
 * Start evaluating function body.
 */
function proceedToFnBody(
  fn: UserDefinedFunction,
  context: Context,
  outerEnv: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const evaluatedFunc = fn.evaluatedfunction
  const closureContext = evaluatedFunc[2]
  const bodyEnv = outerEnv.create(closureContext).create(context)
  const bodyNodes = fn.evaluatedfunction[1]
  if (bodyNodes.length === 0) {
    return { type: 'Value', value: null, k }
  }

  const fnBodyFrame: FnBodyFrame = {
    type: 'FnBody',
    fn,
    bodyIndex: 1,
    env: bodyEnv,
    outerEnv,
    sourceCodeInfo,
  }

  return { type: 'Eval', node: bodyNodes[0]!, env: bodyEnv, k: [fnBodyFrame, ...k] }
}

// ---------------------------------------------------------------------------
// applyFrame — process a completed sub-result against a frame
// ---------------------------------------------------------------------------

/**
 * Given a completed sub-expression value and the top frame from the
 * continuation stack, determine the next Step.
 */
export function applyFrame(frame: Frame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  switch (frame.type) {
    case 'Sequence':
      return applySequence(frame, value, k)
    case 'IfBranch':
      return applyIfBranch(frame, value, k)
    case 'Cond':
      return applyCond(frame, value, k)
    case 'Match':
      return applyMatch(frame, value, k)
    case 'And':
      return applyAnd(frame, value, k)
    case 'Or':
      return applyOr(frame, value, k)
    case 'Qq':
      return applyQq(frame, value, k)
    case 'TemplateStringBuild':
      return applyTemplateStringBuild(frame, value, k)
    case 'ArrayBuild':
      return applyArrayBuild(frame, value, k)
    case 'ObjectBuild':
      return applyObjectBuild(frame, value, k)
    case 'LetBind':
      return applyLetBind(frame, value, k)
    case 'LetBindComplete':
      return applyLetBindComplete(frame, value, k)
    case 'LoopBind':
      return applyLoopBind(frame, value, k)
    case 'LoopBindComplete':
      return applyLoopBindComplete(frame, value, k)
    case 'LoopIterate':
      return applyLoopIterate(frame, value, k)
    case 'ForLoop':
      return applyForLoop(frame, value, k)
    case 'ForElementBindComplete':
      return applyForElementBindComplete(frame, value, k)
    case 'ForLetBind':
      return applyForLetBind(frame, value, k)
    case 'Recur':
      return applyRecur(frame, value, k)
    case 'RecurLoopRebind':
      return applyRecurLoopRebind(frame, value, k)
    case 'PerformArgs':
      return applyPerformArgs(frame, value, k)
    case 'TryWith':
      return applyTryWith(value, k)
    case 'EffectResume':
      return applyEffectResume(frame, value, k)
    case 'HandleSetup':
      return applyHandleSetup(frame, value, k)
    case 'HandleWith':
      // Body completed — return value (frame is just a marker on the stack)
      return { type: 'Value', value, k }
    case 'ParallelResume':
      return applyParallelResume(frame, value, k)
    case 'EvalArgs':
      return applyEvalArgs(frame, value, k)
    case 'CallFn':
      return applyCallFn(frame, value, k)
    case 'FnBody':
      return applyFnBody(frame, value, k)
    case 'FnArgBind':
      return applyFnArgBind(frame, value, k)
    case 'FnArgSlotComplete':
      return applyFnArgSlotComplete(frame, value, k)
    case 'FnRestArgComplete':
      return applyFnRestArgComplete(frame, value, k)
    case 'BindingSlot':
      return applyBindingSlot(frame, value, k)
    case 'MatchSlot':
      return applyMatchSlot(frame, value, k)
    case 'EffectRef':
      return applyEffectRef(frame, value, k)
    case 'HandlerInvoke':
      return applyHandlerInvoke(frame, value, k)
    case 'Complement':
      // Negate the result of the wrapped function
      return { type: 'Value', value: !value, k }
    case 'Comp':
      return applyComp(frame, value, k)
    case 'Juxt':
      return applyJuxt(frame, value, k)
    case 'EveryPred':
      return applyEveryPred(frame, value, k)
    case 'SomePred':
      return applySomePred(frame, value, k)
    case 'NanCheck':
      return applyNanCheck(frame, value, k)
    case 'DebugStep':
      return applyDebugStep(frame, value, k)
    case 'ImportMerge': {
      const dvalaFunctions = isObj(value) ? value : {}
      // Set dvalaImpl on module expressions for functions overridden by .dvala source
      for (const [name, fn] of Object.entries(dvalaFunctions)) {
        const expression = frame.module.functions[name]
        if (expression && isUserDefinedFunction(fn)) {
          expression.dvalaImpl = fn
        }
      }
      // Merge: .dvala functions that DON'T have a matching TS expression override entirely
      // (they are module-only .dvala functions). Functions WITH a TS expression keep
      // the Module function value (arity checking preserved) and dispatch via dvalaImpl.
      const dvalaOnlyFunctions: Obj = {}
      for (const [name, fn] of Object.entries(dvalaFunctions)) {
        if (!frame.module.functions[name]) {
          dvalaOnlyFunctions[name] = fn
        }
      }
      const merged = { ...frame.tsFunctions, ...dvalaOnlyFunctions }
      frame.env.registerValueModule(frame.moduleName, merged)
      return { type: 'Value', value: merged, k }
    }
    case 'AutoCheckpoint':
      return applyAutoCheckpoint(frame, k)
    /* v8 ignore next 2 */
    default: {
      const _exhaustive: never = frame
      throw new DvalaError(`Unhandled frame type: ${(_exhaustive as Frame).type}`, undefined)
    }
  }
}

// ---------------------------------------------------------------------------
// Frame apply handlers
// ---------------------------------------------------------------------------

function applySequence(frame: SequenceFrame, _value: Any, k: ContinuationStack): Step {
  const { nodes, index, env } = frame
  if (index >= nodes.length) {
    // All nodes evaluated — return the last value
    return { type: 'Value', value: _value, k }
  }
  // More nodes to evaluate
  const newFrame: SequenceFrame = { ...frame, index: index + 1 }
  if (index === nodes.length - 1) {
    // Last node — no need for frame
    return { type: 'Eval', node: nodes[index]!, env, k }
  }
  return { type: 'Eval', node: nodes[index]!, env, k: [newFrame, ...k] }
}

function applyIfBranch(frame: IfBranchFrame, value: Any, k: ContinuationStack): Step {
  const { thenNode, elseNode, inverted, env } = frame
  const condition = inverted ? !value : value
  if (condition) {
    return { type: 'Eval', node: thenNode, env, k }
  }
  if (elseNode) {
    return { type: 'Eval', node: elseNode, env, k }
  }
  return { type: 'Value', value: null, k }
}

function applyCond(frame: CondFrame, value: Any, k: ContinuationStack): Step {
  const { cases, index, env } = frame

  if (frame.phase === 'test') {
    if (value) {
      // Test is truthy — evaluate the body
      return { type: 'Eval', node: cases[index]![1], env, k }
    }
    // Test is falsy — try next case
    const nextIndex = index + 1
    if (nextIndex >= cases.length) {
      return { type: 'Value', value: null, k }
    }
    const newFrame: CondFrame = { ...frame, index: nextIndex }
    return { type: 'Eval', node: cases[nextIndex]![0], env, k: [newFrame, ...k] }
  }

  // phase === 'body' — body has been evaluated
  return { type: 'Value', value, k }
}

function applyMatch(frame: MatchFrame, value: Any, k: ContinuationStack): Step {
  const { cases, env } = frame

  if (frame.phase === 'matchValue') {
    // matchValue has been evaluated — start processing cases
    const matchValue = value
    return processMatchCase({ ...frame, matchValue, phase: 'guard' }, k)
  }

  if (frame.phase === 'guard') {
    // Guard was evaluated
    if (!value) {
      // Guard failed — try next case
      const newFrame: MatchFrame = { ...frame, index: frame.index + 1, bindings: {} }
      return processMatchCase(newFrame, k)
    }
    // Guard passed — evaluate body
    const context: Context = {}
    for (const [name, val] of Object.entries(frame.bindings)) {
      context[name] = { value: val }
    }
    const newEnv = env.create(context)
    return { type: 'Eval', node: cases[frame.index]![1], env: newEnv, k }
  }

  // phase === 'body' — body has been evaluated
  return { type: 'Value', value, k }
}

/**
 * Process match cases starting from `frame.index`.
 * Uses frame-based slot processing for pattern matching.
 */
function processMatchCase(frame: MatchFrame, k: ContinuationStack): Step {
  const { matchValue, cases, index, env, sourceCodeInfo } = frame

  if (index >= cases.length) {
    // No more cases — match failed
    return { type: 'Value', value: null, k }
  }

  const [pattern] = cases[index]!
  return startMatchSlots(pattern, matchValue, frame, env, sourceCodeInfo, k)
}

function applyAnd(frame: AndFrame, value: Any, k: ContinuationStack): Step {
  if (!value) {
    return { type: 'Value', value, k }
  }
  const { nodes, index, env } = frame
  if (index >= nodes.length) {
    return { type: 'Value', value, k }
  }
  if (index === nodes.length - 1) {
    // Last node — no need for frame
    return { type: 'Eval', node: nodes[index]!, env, k }
  }
  const newFrame: AndFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: nodes[index]!, env, k: [newFrame, ...k] }
}

function applyOr(frame: OrFrame, value: Any, k: ContinuationStack): Step {
  if (value) {
    return { type: 'Value', value, k }
  }
  const { nodes, index, env } = frame
  if (index >= nodes.length) {
    return { type: 'Value', value, k }
  }
  if (index === nodes.length - 1) {
    return { type: 'Eval', node: nodes[index]!, env, k }
  }
  const newFrame: OrFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: nodes[index]!, env, k: [newFrame, ...k] }
}

function applyQq(frame: QqFrame, value: Any, k: ContinuationStack): Step {
  // If value is non-null, we found our result
  if (value !== null) {
    return { type: 'Value', value, k }
  }
  return advanceQq(frame, k)
}

/** Advance ?? to the next node, skipping undefined user symbols. */
function advanceQq(frame: QqFrame, k: ContinuationStack): Step {
  const { nodes, env } = frame
  let { index } = frame

  // Skip undefined user symbols
  while (index < nodes.length) {
    const node = nodes[index]!
    if (isUserDefinedSymbolNode(node) && env.lookUp(node) === null) {
      index++
      continue
    }
    break
  }

  if (index >= nodes.length) {
    return { type: 'Value', value: null, k }
  }

  if (index === nodes.length - 1) {
    // Last node — no need for frame
    return { type: 'Eval', node: nodes[index]!, env, k }
  }

  const newFrame: QqFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: nodes[index]!, env, k: [newFrame, ...k] }
}

/** Skip undefined user symbols in ?? until we find one to evaluate. */
function skipUndefinedQq(frame: QqFrame, k: ContinuationStack): Step {
  return advanceQq(frame, k)
}

function applyTemplateStringBuild(frame: TemplateStringBuildFrame, value: Any, k: ContinuationStack): Step {
  const { segments, env } = frame
  const result = frame.result + String(value)

  const nextIndex = frame.index + 1
  if (nextIndex >= segments.length) {
    return { type: 'Value', value: result, k }
  }

  const newFrame: TemplateStringBuildFrame = { ...frame, index: nextIndex, result }
  return { type: 'Eval', node: segments[nextIndex]!, env, k: [newFrame, ...k] }
}

function applyArrayBuild(frame: ArrayBuildFrame, value: Any, k: ContinuationStack): Step {
  const { nodes, result, env, sourceCodeInfo } = frame

  // Process the completed value
  if (frame.isSpread) {
    if (!Array.isArray(value)) {
      throw new DvalaError('Spread value is not an array', sourceCodeInfo)
    }
    result.push(...value)
  } else {
    result.push(value)
  }

  // Advance to next element
  const nextIndex = frame.index + 1
  if (nextIndex >= nodes.length) {
    return { type: 'Value', value: result, k }
  }

  const nextNode = nodes[nextIndex]!
  const isNextSpread = isSpreadNode(nextNode)
  const newFrame: ArrayBuildFrame = { ...frame, index: nextIndex, isSpread: isNextSpread }
  return {
    type: 'Eval',
    node: isNextSpread ? nextNode[1] : nextNode,
    env,
    k: [newFrame, ...k],
  }
}

function applyObjectBuild(frame: ObjectBuildFrame, value: Any, k: ContinuationStack): Step {
  const { nodes, result, env, sourceCodeInfo } = frame

  if (frame.isSpread) {
    // Spread value should be an object
    if (!isUnknownRecord(value)) {
      throw new DvalaError('Spread value is not an object', sourceCodeInfo)
    }
    Object.assign(result, value)
    // Advance to next entry
    const nextIndex = frame.index + 1
    if (nextIndex >= nodes.length) {
      return { type: 'Value', value: result, k }
    }
    const nextNode = nodes[nextIndex]!
    const isNextSpread = isSpreadNode(nextNode)
    const newFrame: ObjectBuildFrame = { ...frame, index: nextIndex, currentKey: null, isSpread: isNextSpread }
    return {
      type: 'Eval',
      node: isNextSpread ? nextNode[1] : nextNode,
      env,
      k: [newFrame, ...k],
    }
  }

  if (frame.currentKey === null) {
    // We just evaluated a key expression
    assertString(value, sourceCodeInfo)
    const valueNode = nodes[frame.index + 1]
    if (valueNode === undefined) {
      throw new DvalaError('Missing value for key', sourceCodeInfo)
    }
    const newFrame: ObjectBuildFrame = { ...frame, currentKey: value }
    return { type: 'Eval', node: valueNode, env, k: [newFrame, ...k] }
  } else {
    // We just evaluated a value expression
    result[frame.currentKey] = value
    // Advance to next key-value pair
    const nextIndex = frame.index + 2
    if (nextIndex >= nodes.length) {
      return { type: 'Value', value: result, k }
    }
    const nextNode = nodes[nextIndex]!
    const isNextSpread = isSpreadNode(nextNode)
    const newFrame: ObjectBuildFrame = { ...frame, index: nextIndex, currentKey: null, isSpread: isNextSpread }
    return {
      type: 'Eval',
      node: isNextSpread ? nextNode[1] : nextNode,
      env,
      k: [newFrame, ...k],
    }
  }
}

function applyLetBind(frame: LetBindFrame, value: Any, k: ContinuationStack): Step {
  const { target, env, sourceCodeInfo } = frame

  // Push completion frame to receive the binding record
  const completeFrame: LetBindCompleteFrame = {
    type: 'LetBindComplete',
    originalValue: value,
    env,
    sourceCodeInfo,
  }

  // Start processing binding slots with linearized approach
  return startBindingSlots(target, value, env, sourceCodeInfo, [completeFrame, ...k])
}

function applyLetBindComplete(frame: LetBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { originalValue, env, sourceCodeInfo } = frame

  // Add the binding record to the environment
  env.addValues(record as Record<string, Any>, sourceCodeInfo)

  // Return the original RHS value (which is what `let x = expr` evaluates to)
  return { type: 'Value', value: originalValue, k }
}

function applyLoopBind(frame: LoopBindFrame, value: Any, k: ContinuationStack): Step {
  const { bindingNodes, index, context, body, env, sourceCodeInfo } = frame

  // Value for the current binding has been evaluated
  const bindingNode = bindingNodes[index]!
  const target = bindingNode[1][0]

  // Push completion frame to receive the binding record
  const completeFrame: LoopBindCompleteFrame = {
    type: 'LoopBindComplete',
    bindingNodes,
    index,
    context,
    body,
    env,
    sourceCodeInfo,
  }

  // Start processing binding slots with linearized approach
  return startBindingSlots(target, value, env.create(context), sourceCodeInfo, [completeFrame, ...k])
}

function applyLoopBindComplete(frame: LoopBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { bindingNodes, index, context, body, env, sourceCodeInfo } = frame

  // Add the binding record to the loop context
  Object.entries(record as Record<string, Any>).forEach(([name, val]) => {
    context[name] = { value: val }
  })

  // Move to next binding
  const nextIndex = index + 1
  if (nextIndex >= bindingNodes.length) {
    // All bindings done — set up the loop iteration
    const loopEnv = env.create(context)
    const iterateFrame: LoopIterateFrame = {
      type: 'LoopIterate',
      bindingNodes,
      bindingContext: context,
      body,
      env: loopEnv,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: body, env: loopEnv, k: [iterateFrame, ...k] }
  }

  // Evaluate next binding's value expression (in context with previous bindings)
  const newFrame: LoopBindFrame = {
    type: 'LoopBind',
    phase: 'value',
    bindingNodes,
    index: nextIndex,
    context,
    body,
    env,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: bindingNodes[nextIndex]![1][1], env: env.create(context), k: [newFrame, ...k] }
}

function applyLoopIterate(_frame: LoopIterateFrame, value: Any, k: ContinuationStack): Step {
  // Body has been evaluated successfully — return the value
  // (recur is handled by the RecurFrame, which will pop back to this frame)
  return { type: 'Value', value, k }
}

function applyForLoop(frame: ForLoopFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { returnResult, bindingNodes, result, env, sourceCodeInfo } = frame
  const { asColl, isSeq } = getCollectionUtils()

  switch (frame.phase) {
    case 'evalCollection': {
      // A collection expression has been evaluated
      const coll = asColl(value, sourceCodeInfo)
      const seq = isSeq(coll) ? coll : Object.entries(coll as Obj)

      if ((seq as Arr).length === 0) {
        // Empty collection — abort this level
        return handleForAbort(frame, k)
      }

      // Store collection for this level
      const levelStates = [...frame.levelStates]
      levelStates[frame.bindingLevel] = { collection: seq as Arr, index: 0 }

      // Process the first element's binding
      const binding = bindingNodes[frame.bindingLevel]!
      const targetNode = binding[0][1][0]
      const element = (seq as Arr)[0]

      const elValue = asAny(element, sourceCodeInfo)

      // Push completion frame and use frame-based binding
      const completeFrame: ForElementBindCompleteFrame = {
        type: 'ForElementBindComplete',
        forFrame: { ...frame, levelStates },
        levelStates,
        env,
        sourceCodeInfo,
      }
      return startBindingSlots(targetNode, elValue, env, sourceCodeInfo, [completeFrame, ...k])
    }

    case 'evalWhen': {
      // When-guard has been evaluated
      if (!value) {
        // When-guard failed — advance to next element
        return advanceForElement(frame, k)
      }
      // Check while-guard
      const binding = bindingNodes[frame.bindingLevel]!
      const whileNode = binding[3]
      if (whileNode) {
        const newFrame: ForLoopFrame = { ...frame, phase: 'evalWhile' }
        return { type: 'Eval', node: whileNode, env, k: [newFrame, ...k] }
      }
      return processForNextLevel(frame, k)
    }

    case 'evalWhile': {
      if (!value) {
        // While-guard failed — skip remaining elements at this level
        const levelStates = [...frame.levelStates]
        levelStates[frame.bindingLevel] = {
          ...levelStates[frame.bindingLevel]!,
          index: Number.POSITIVE_INFINITY,
        }
        return advanceForElement({ ...frame, levelStates }, k)
      }
      return processForNextLevel(frame, k)
    }

    case 'evalBody': {
      // Body has been evaluated
      if (returnResult) {
        result.push(value)
      }
      // Advance innermost binding to next element
      return advanceForElement(frame, k)
    }

  }
}

/** Handle for-loop abort: no more elements at the outermost level. */
function handleForAbort(frame: ForLoopFrame, k: ContinuationStack): Step {
  return { type: 'Value', value: frame.returnResult ? frame.result : null, k }
}

/** Advance to the next element at the current binding level. */
function advanceForElement(frame: ForLoopFrame, k: ContinuationStack): Step | Promise<Step> {
  const { bindingNodes, env, sourceCodeInfo } = frame
  const levelStates = [...frame.levelStates]
  const bindingLevel = frame.bindingLevel

  // Advance the innermost level
  const currentLevel = bindingLevel
  const currentState = levelStates[currentLevel]!
  const nextElementIndex = currentState.index + 1

  if (nextElementIndex >= currentState.collection.length) {
    // No more elements at this level — back up
    if (currentLevel === 0) {
      return handleForAbort(frame, k)
    }
    // Move to next element of the parent level
    return advanceForElement({ ...frame, bindingLevel: currentLevel - 1 }, k)
  }

  // Process next element at current level
  levelStates[currentLevel] = { ...currentState, index: nextElementIndex }
  const binding = bindingNodes[currentLevel]!
  const targetNode = binding[0][1][0]
  const element = currentState.collection[nextElementIndex]
  const elValue = asAny(element, sourceCodeInfo)

  const completeFrame: ForElementBindCompleteFrame = {
    type: 'ForElementBindComplete',
    forFrame: { ...frame, levelStates, bindingLevel: currentLevel },
    levelStates,
    env,
    sourceCodeInfo,
  }
  return startBindingSlots(targetNode, elValue, env, sourceCodeInfo, [completeFrame, ...k])
}

/** Handle completion of for-loop element binding. */
function applyForElementBindComplete(frame: ForElementBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { forFrame, levelStates, env, sourceCodeInfo } = frame

  // Add the binding record to the context
  Object.entries(record as Record<string, Any>).forEach(([name, val]) => {
    forFrame.context[name] = { value: val }
  })

  // Process let-bindings if any
  const binding = forFrame.bindingNodes[forFrame.bindingLevel]!
  const letBindings = binding[1]
  if (letBindings.length > 0) {
    return startForLetBindings(forFrame, levelStates, letBindings, 0, env, sourceCodeInfo, k)
  }

  // Process when-guard if any
  return processForGuards(forFrame, levelStates, k)
}

/** Start processing let-bindings at the current for-loop level. */
function startForLetBindings(
  forFrame: ForLoopFrame,
  levelStates: ForLoopFrame['levelStates'],
  letBindings: BindingNode[],
  letIndex: number,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const bindingNode = letBindings[letIndex]!
  const bindingValue = bindingNode[1][1]

  // Push frame to process the binding after value is evaluated
  const letBindFrame: ForLetBindFrame = {
    type: 'ForLetBind',
    phase: 'evalValue',
    forFrame,
    levelStates,
    letBindings,
    letIndex,
    env,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: bindingValue, env, k: [letBindFrame, ...k] }
}

/** Handle continuation after evaluating a for-loop let-binding value or destructuring. */
function applyForLetBind(frame: ForLetBindFrame, value: Any, k: ContinuationStack): Step {
  const { phase, forFrame, levelStates, letBindings, letIndex, env, sourceCodeInfo } = frame

  if (phase === 'evalValue') {
    // Value evaluated — now destructure
    const bindingNode = letBindings[letIndex]!
    const target = bindingNode[1][0]

    // Push frame for destructuring completion
    const destructureFrame: ForLetBindFrame = {
      type: 'ForLetBind',
      phase: 'destructure',
      forFrame,
      levelStates,
      letBindings,
      letIndex,
      currentValue: value,
      env,
      sourceCodeInfo,
    }
    return startBindingSlots(target, value, env, sourceCodeInfo, [destructureFrame, ...k])
  }

  // phase === 'destructure' — binding record received
  Object.entries(value as Record<string, Any>).forEach(([name, val]) => {
    forFrame.context[name] = { value: val }
  })

  // Move to next let-binding
  const nextIndex = letIndex + 1
  if (nextIndex >= letBindings.length) {
    // All let-bindings done — process guards
    return processForGuards(forFrame, levelStates, k)
  }

  // Evaluate next let-binding
  return startForLetBindings(forFrame, levelStates, letBindings, nextIndex, env, sourceCodeInfo, k)
}

/** Process when/while guards at the current level. */
function processForGuards(frame: ForLoopFrame, levelStates: ForLoopFrame['levelStates'], k: ContinuationStack): Step {
  const { bindingNodes, env } = frame
  const binding = bindingNodes[frame.bindingLevel]!
  const whenNode = binding[2]
  const whileNode = binding[3]

  if (whenNode) {
    const newFrame: ForLoopFrame = { ...frame, levelStates, phase: 'evalWhen' }
    return { type: 'Eval', node: whenNode, env, k: [newFrame, ...k] }
  }

  if (whileNode) {
    const newFrame: ForLoopFrame = { ...frame, levelStates, phase: 'evalWhile' }
    return { type: 'Eval', node: whileNode, env, k: [newFrame, ...k] }
  }

  return processForNextLevel({ ...frame, levelStates }, k)
}

/** After guards pass, either go deeper (more binding levels) or evaluate body. */
function processForNextLevel(frame: ForLoopFrame, k: ContinuationStack): Step {
  const { bindingNodes, body, env } = frame
  const nextLevel = frame.bindingLevel + 1

  if (nextLevel < bindingNodes.length) {
    // Go deeper — evaluate the next level's collection
    const binding = bindingNodes[nextLevel]!
    const collectionNode = binding[0][1][1]
    const newFrame: ForLoopFrame = {
      ...frame,
      phase: 'evalCollection',
      bindingLevel: nextLevel,
    }
    return { type: 'Eval', node: collectionNode, env, k: [newFrame, ...k] }
  }

  // All levels bound — evaluate the body
  const newFrame: ForLoopFrame = { ...frame, phase: 'evalBody' }
  // Use env.create(frame.context) to ensure post-deserialization correctness:
  // after serialize/deserialize, frame.context and the context inside frame.env
  // may be separate objects, so mutations to frame.context won't be visible
  // through frame.env. Pushing frame.context on top guarantees current values.
  const bodyEnv = env.create(frame.context)
  return { type: 'Eval', node: body, env: bodyEnv, k: [newFrame, ...k] }
}

/**
 * Search the continuation stack for the nearest TryCatchFrame.
 * Since TryCatchFrame has been removed, this now always re-throws the error.
 * Kept as a helper for the transition period while `throw` still exists.
 */
/**
 * Try to route a DvalaError through the 'dvala.error' algebraic effect.
 *
 * Mirrors the dispatch logic in `dispatchPerform` but returns `null` instead
 * of throwing when no handler matches, so the caller can fall back to
 * re-throwing the error as a JS exception.
 *
 * Search order:
 * 1. Local `TryWithFrame` handlers (innermost first)
 * 2. Host handlers registered for `'dvala.error'`
 */
function tryDispatchDvalaError(
  error: DvalaError,
  k: ContinuationStack,
): Step | null {
  const effect = getEffectRef('dvala.error')
  const arg: Any = error.shortMessage

  // Convert runtime error to a perform(@dvala.error, msg) if there's a
  // handler that can catch it. Otherwise return null (caller re-throws).
  //
  // Walk k looking for handler frames (TryWith, HandleWith) or EffectResumeFrame
  // (which points back to the handler scope via resumeK).
  //
  // When inside a handler (EffectResumeFrame found):
  // - Error from handler body (frames above EffectResumeFrame): SKIP the
  //   source HandleWithFrame to prevent infinite recursion
  // - Error from nxt() propagation (EffectResumeFrame is first): do NOT skip,
  //   the same scope's @dvala.error handler should catch it
  for (let i = 0; i < k.length; i++) {
    const frame = k[i]!
    if (frame.type === 'TryWith' || frame.type === 'HandleWith') {
      // Found a handler directly in k — use full k so body frames above
      // the handler are preserved for proper resumption
      return { type: 'Perform', effect, arg, k, sourceCodeInfo: error.sourceCodeInfo }
    }
    if (frame.type === 'EffectResume') {
      // handlerExecuting=true: error from handler body → skip source HandleWithFrame
      // handlerExecuting=false: error from nxt() dispatch → same scope can catch it
      const skipFrame = frame.handlerExecuting ? frame.sourceHandleFrame : undefined
      const resumeK = frame.resumeK
      for (let j = 0; j < resumeK.length; j++) {
        const rFrame = resumeK[j]!
        if (rFrame.type === 'HandleWith' && rFrame === skipFrame) {
          // Splice out the skipped frame so dispatchPerform won't find it
          const patchedK = [...resumeK.slice(0, j), ...resumeK.slice(j + 1)]
          // Continue looking for an outer handler in the rest
          for (let jj = j; jj < patchedK.length; jj++) {
            const rrFrame = patchedK[jj]!
            if (rrFrame.type === 'HandleWith' || rrFrame.type === 'TryWith') {
              return { type: 'Perform', effect, arg, k: patchedK, sourceCodeInfo: error.sourceCodeInfo }
            }
          }
          return null // No outer handler
        }
        if (rFrame.type === 'HandleWith' || rFrame.type === 'TryWith') {
          return { type: 'Perform', effect, arg, k: resumeK, sourceCodeInfo: error.sourceCodeInfo }
        }
      }
      return null
    }
  }
  return null // No handler found
}

function applyRecur(frame: RecurFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { nodes, index, params, env } = frame
  params.push(value)

  if (index >= nodes.length) {
    // All recur params collected — handle recur via continuation stack
    return handleRecur(params, k, frame.sourceCodeInfo)
  }

  // Evaluate next param
  const newFrame: RecurFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: nodes[index]!, env, k: [newFrame, ...k] }
}

/**
 * Handle recur by searching the continuation stack for the nearest
 * LoopIterateFrame or FnBodyFrame, rebinding parameters, and restarting.
 * Uses frame-based slot binding for proper suspension support.
 */
function handleRecur(params: Arr, k: ContinuationStack, sourceCodeInfo: SourceCodeInfo | undefined): Step {
  for (let i = 0; i < k.length; i++) {
    const frame = k[i]!

    if (frame.type === 'LoopIterate') {
      // Found loop frame — start rebinding using slots
      const { bindingNodes, bindingContext, body, env } = frame
      const remainingK = k.slice(i + 1)

      if (params.length !== bindingNodes.length) {
        throw new DvalaError(
          `recur expected ${bindingNodes.length} parameters, got ${params.length}`,
          sourceCodeInfo,
        )
      }

      // Start the frame-based rebinding process
      return startRecurLoopRebind(bindingNodes, 0, params, bindingContext, body, env, remainingK, sourceCodeInfo)
    }

    if (frame.type === 'FnBody') {
      // Found function body frame — restart with new params
      const { fn, outerEnv } = frame
      const remainingK = k.slice(i + 1)
      return setupUserDefinedCall(fn, params, outerEnv, frame.sourceCodeInfo, remainingK)
    }
  }

  throw new DvalaError('recur called outside of loop or function body', sourceCodeInfo)
}

/**
 * Start rebinding loop variables during recur using slot-based binding.
 */
function startRecurLoopRebind(
  bindingNodes: BindingNode[],
  bindingIndex: number,
  params: Arr,
  bindingContext: Context,
  body: AstNode,
  env: ContextStack,
  remainingK: ContinuationStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
): Step {
  if (bindingIndex >= bindingNodes.length) {
    // All bindings complete — sync context and restart loop body
    const envContexts = env.getContextsRaw()
    const innermostContext = envContexts[0]!
    if (innermostContext !== bindingContext) {
      for (const [name, entry] of Object.entries(bindingContext)) {
        innermostContext[name] = entry
      }
    }

    // Push fresh LoopIterateFrame and re-evaluate body
    const newIterateFrame: LoopIterateFrame = {
      type: 'LoopIterate',
      bindingNodes,
      bindingContext,
      body,
      env,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: body, env, k: [newIterateFrame, ...remainingK] }
  }

  // Bind current node using slots
  const bindingNode = bindingNodes[bindingIndex]!
  const target = bindingNode[1][0]
  const param = toAny(params[bindingIndex])

  const rebindFrame: RecurLoopRebindFrame = {
    type: 'RecurLoopRebind',
    bindingNodes,
    bindingIndex,
    params,
    bindingContext,
    body,
    env,
    remainingK,
    sourceCodeInfo,
  }

  return startBindingSlots(target, param, env, sourceCodeInfo, [rebindFrame, ...remainingK])
}

/**
 * Handle completion of one loop binding during recur rebinding.
 */
function applyRecurLoopRebind(frame: RecurLoopRebindFrame, value: Any, _k: ContinuationStack): Step {
  const { bindingNodes, bindingIndex, params, bindingContext, body, env, remainingK, sourceCodeInfo } = frame

  // value is the binding record from startBindingSlots
  const record = value as Record<string, Any>
  Object.entries(record).forEach(([name, val]) => {
    bindingContext[name] = { value: val }
  })

  // Continue with next binding
  return startRecurLoopRebind(bindingNodes, bindingIndex + 1, params, bindingContext, body, env, remainingK, sourceCodeInfo)
}

function applyTryWith(_value: Any, k: ContinuationStack): Step {
  // Try body completed successfully — the with frame is discarded.
  // The value propagates up past the TryWithFrame.
  return { type: 'Value', value: _value, k }
}

function applyEffectResume(frame: EffectResumeFrame, value: Any, _k: ContinuationStack): Step {
  // The handler returned a value. Replace the continuation with resumeK
  // (the original continuation from the perform call site, with TryWithFrame
  // still on the stack for subsequent performs).
  // The _k (handler's remaining outer_k) is discarded — resumeK already
  // includes the full original continuation.
  return { type: 'Value', value, k: frame.resumeK }
}

/**
 * HandleSetup: the handlers expression has been evaluated.
 * Now push a HandleWithFrame around the body and evaluate it.
 */
function applyHandleSetup(frame: HandleSetupFrame, value: Any, k: ContinuationStack): Step {
  // value is the evaluated handlers expression — either a single function or an array of functions
  const handlers = Array.isArray(value) ? value : [value]

  const handleWithFrame: HandleWithFrame = {
    type: 'HandleWith',
    handlers: handlers as Any[],
    env: frame.env,
    sourceCodeInfo: frame.sourceCodeInfo,
  }

  // Build body as a sequence
  const { bodyExprs, env } = frame
  if (bodyExprs.length === 0) {
    return { type: 'Value', value: null, k: [handleWithFrame, ...k] }
  }
  if (bodyExprs.length === 1) {
    return { type: 'Eval', node: bodyExprs[0]!, env, k: [handleWithFrame, ...k] }
  }
  // Multiple body expressions — wrap in a sequence
  const sequenceFrame: SequenceFrame = {
    type: 'Sequence',
    nodes: bodyExprs,
    index: 1,
    env,
    sourceCodeInfo: frame.sourceCodeInfo,
  }
  return { type: 'Eval', node: bodyExprs[0]!, env, k: [sequenceFrame, handleWithFrame, ...k] }
}

/**
 * Convert a ParallelResumeFrame into a ParallelResumeStep.
 *
 * The value is the resume value from the host for the first suspended branch.
 * The actual resumption logic happens in `tick()` → `handleParallelResume()`
 * which has access to `handlers` and `signal`.
 */
function applyParallelResume(frame: ParallelResumeFrame, value: Any, k: ContinuationStack): Step {
  return {
    type: 'ParallelResume',
    value,
    branchCount: frame.branchCount,
    completedBranches: frame.completedBranches,
    suspendedBranches: frame.suspendedBranches,
    k,
  }
}

function applyPerformArgs(frame: PerformArgsFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { argNodes, index, params, env } = frame
  params.push(value)

  if (index >= argNodes.length) {
    // All values collected — first is the effect ref, second (optional) is the payload
    const effectRef = params[0]!
    assertEffect(effectRef, frame.sourceCodeInfo)
    // Pure mode check — effects are not allowed in pure mode
    if (env.pure) {
      throw new DvalaError(`Cannot perform effect '${effectRef.name}' in pure mode`, frame.sourceCodeInfo)
    }
    const arg = (params.length > 1 ? params[1]! : null) as Any
    // Produce a PerformStep — let the trampoline dispatch it
    return { type: 'Perform', effect: effectRef, arg, k, sourceCodeInfo: frame.sourceCodeInfo }
  }

  // Evaluate next arg
  const newFrame: PerformArgsFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: argNodes[index]!, env, k: [newFrame, ...k] }
}

/**
 * Dispatch a Perform step by searching the continuation stack for a matching
 * TryWithFrame. If found, evaluate the handler and use its return value as the
 * result of the perform call. If not found, throw an unhandled effect error.
 *
 * Handler semantics (per P&P / Dvala contract):
 * - Handler receives the perform args as an array: `([arg1, arg2]) -> ...`
 * - Handler's return value IS the resume value — no explicit resume needed
 * - Handlers run OUTSIDE the try/with scope — the TryWithFrame is removed
 *   from the handler's error/effect path. An EffectResumeFrame bridges the
 *   handler's return value back to the original continuation.
 * - The handler function's environment is the one captured at the with-clause,
 *   NOT the environment at the perform call site
 *
 * Continuation structure:
 *   Original k:   [...body_k, TryWithFrame(i), ...outer_k]
 *   Handler's k:  [EffectResumeFrame{resumeK=k}, ...outer_k]
 *   When handler returns V: EffectResumeFrame replaces k with original k,
 *   so V flows through body_k with TryWithFrame still on stack.
 */

/**
 * Check if a handler's case clause matches the given effect.
 * Supports two forms:
 * - EffectRef: exact name match (e.g. `eff == @dvala.error` in handle...with handler)
 * - Predicate function: called with the effect, truthy = match (legacy `case my-predicate`)
 *
 * Predicate functions must be synchronous — async predicates throw an error.
 */
function handlerMatchesEffect(
  handler: EvaluatedWithHandler,
  effect: EffectRef,
  env: ContextStack,
  sourceCodeInfo?: SourceCodeInfo,
): boolean {
  if (isEffect(handler.effectRef)) {
    return handler.effectRef.name === effect.name
  }
  if (isDvalaFunction(handler.effectRef)) {
    const step = dispatchFunction(handler.effectRef, [effect], [], env, sourceCodeInfo, [])
    if (step instanceof Promise) {
      throw new DvalaError('Effect handler predicates must be synchronous', sourceCodeInfo)
    }
    return !!runSyncTrampoline(step)
  }
  return false
}

/**
 * Invoke a matched handler for a performed effect.
 * Builds the handler continuation and dispatches the handler function.
 */
function invokeMatchedHandler(
  handler: EvaluatedWithHandler,
  frame: TryWithFrame,
  arg: Any,
  k: ContinuationStack,
  frameIndex: number,
  sourceCodeInfo?: SourceCodeInfo,
): Step | Promise<Step> {
  // resumeK = original k — handler's return value resumes here
  // (TryWithFrame stays on the stack for subsequent performs)
  const resumeK = k

  // Determine outer_k — skip TryWithFrame so errors and effects from the
  // handler propagate upward past the current do...with block.
  const outerK = k.slice(frameIndex + 1)

  // Handler's continuation: EffectResumeFrame bridges back to resumeK
  const effectResumeFrame: EffectResumeFrame = {
    type: 'EffectResume',
    resumeK,
    sourceCodeInfo,
  }
  const handlerK: ContinuationStack = [effectResumeFrame, ...outerK]

  // Evaluate the handler fn expression via trampoline (frame-based).
  // Push HandlerInvokeFrame to dispatch the handler after evaluation.
  const handlerInvokeFrame: HandlerInvokeFrame = {
    type: 'HandlerInvoke',
    arg,
    handlerK,
    handlerEnv: frame.env,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: handler.handlerNode, env: frame.env, k: [handlerInvokeFrame, ...outerK] }
}

/**
 * Build a HandleNextFunction for the given handler index in the chain.
 * When called with (eff, arg), it dispatches to handlers[handlerIndex].
 * If handlerIndex >= handlers.length, re-performs past the HandleWithFrame.
 */
function buildNextFunction(
  handlers: Any[],
  handlerIndex: number,
  resumeK: ContinuationStack,
  sourceCodeInfo?: SourceCodeInfo,
): HandleNextFunction {
  return {
    [FUNCTION_SYMBOL]: true,
    functionType: 'HandleNext',
    handlers,
    handlerIndex,
    resumeK,
    arity: { min: 2, max: 2 },
    sourceCodeInfo,
  }
}

/**
 * Invoke the handle...with handler chain when a perform matches a HandleWithFrame.
 *
 * Builds a `next` closure and calls handlers[0](eff, arg, next).
 * The handler's return value becomes the resume value for the perform.
 */
function invokeHandleWithChain(
  frame: HandleWithFrame,
  effect: EffectRef,
  arg: Any,
  k: ContinuationStack,
  frameIndex: number,
  sourceCodeInfo?: SourceCodeInfo,
): Step | Promise<Step> {
  const { handlers } = frame

  if (handlers.length === 0) {
    // No handlers — propagate past this frame by re-performing on the outer stack
    const outerK = k.slice(frameIndex + 1)
    return { type: 'Perform', effect, arg, k: outerK, sourceCodeInfo, skipCheckpointCapture: true }
  }

  // resumeK = original k — handler's return value resumes here
  const resumeK = k

  // outerK = continuation past the HandleWithFrame (for handler execution)
  const outerK = k.slice(frameIndex + 1)

  // EffectResumeFrame bridges handler's return value back to resumeK
  const effectResumeFrame: EffectResumeFrame = {
    type: 'EffectResume',
    resumeK,
    sourceHandleFrame: frame,
    handlerExecuting: true,
    sourceCodeInfo,
  }
  const handlerK: ContinuationStack = [effectResumeFrame, ...outerK]

  // Build next function for handler[1..n]
  const nextFn = buildNextFunction(handlers, 1, resumeK, sourceCodeInfo)

  // Call handlers[0](eff, arg, nextFn)
  const firstHandler = handlers[0]!
  const fnLike = asFunctionLike(firstHandler, sourceCodeInfo)
  return dispatchFunction(fnLike, [effect, arg, nextFn], [], frame.env, sourceCodeInfo, handlerK)
}

function dispatchPerform(effect: EffectRef, arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo, handlers?: Handlers, signal?: AbortSignal, snapshotState?: SnapshotState, skipCheckpointCapture?: boolean): Step | Promise<Step> {
  // dvala.checkpoint — unconditional snapshot capture before normal dispatch.
  // The snapshot is always captured regardless of whether any handler intercepts.
  // Skipped when re-dispatching from a HandleNextFunction fallthrough (already captured upstream).
  if (effect.name === 'dvala.checkpoint' && snapshotState && !skipCheckpointCapture) {
    const message = arg as string
    const continuation = serializeToObject(k)
    const snapshot = createSnapshot({
      continuation,
      timestamp: Date.now(),
      index: snapshotState.nextSnapshotIndex++,
      executionId: snapshotState.executionId,
      message,
    })
    snapshotState.snapshots.push(snapshot)
    if (snapshotState.maxSnapshots !== undefined && snapshotState.snapshots.length > snapshotState.maxSnapshots) {
      snapshotState.snapshots.shift()
    }
  }

  // Auto-checkpoint: dispatch a real dvala.checkpoint effect before the original effect.
  if (snapshotState?.autoCheckpoint && effect.name !== 'dvala.checkpoint') {
    // Skip if we're already inside an auto-checkpoint dispatch (phase: 'awaitEffect').
    const topFrame = k[0]
    if (topFrame?.type === 'AutoCheckpoint' && topFrame.phase === 'awaitEffect') {
      // Pop the marker frame and dispatch the original effect normally.
      k = k.slice(1)
    } else {
      const autoCheckpointFrame: AutoCheckpointFrame = {
        type: 'AutoCheckpoint',
        phase: 'awaitCheckpoint',
        effect,
        arg,
        sourceCodeInfo,
      }
      const checkpointMessage = `Auto checkpoint before ${effect.name}`
      return { type: 'Perform', effect: getEffectRef('dvala.checkpoint'), arg: checkpointMessage, k: [autoCheckpointFrame, ...k], sourceCodeInfo }
    }
  }

  for (let i = 0; i < k.length; i++) {
    const frame = k[i]!
    if (frame.type === 'TryWith') {
      // Search this frame's handlers for a matching effect
      for (const handler of frame.handlers) {
        if (handlerMatchesEffect(handler, effect, frame.env, sourceCodeInfo)) {
          return invokeMatchedHandler(handler, frame, arg, k, i, sourceCodeInfo)
        }
      }
    }
    if (frame.type === 'HandleWith') {
      return invokeHandleWithChain(frame, effect, arg, k, i, sourceCodeInfo)
    }
  }

  // No matching local handler found — dispatch to host handler if available.
  const matchingHostHandlers = findMatchingHandlers(effect.name, handlers)
  if (matchingHostHandlers.length > 0) {
    return dispatchHostHandler(effect.name, matchingHostHandlers, arg, k, signal, sourceCodeInfo, snapshotState)
  }

  // No host handler — check standard effects (dvala.io.println, dvala.time.now, etc.).
  const standardHandler = getStandardEffectHandler(effect.name)
  if (standardHandler) {
    return standardHandler(arg, k, sourceCodeInfo)
  }

  // dvala.checkpoint resolves to null when completely unhandled.
  if (effect.name === 'dvala.checkpoint') {
    return { type: 'Value', value: null, k }
  }

  // dvala.error is special — when unhandled, throw UserDefinedError
  // so the error message propagates as a proper user error.
  if (effect.name === 'dvala.error') {
    const message = typeof arg === 'string' ? arg : String(arg ?? 'Unknown error')
    throw new UserDefinedError(message, sourceCodeInfo)
  }

  // No handler at all — unhandled effect.
  throw new DvalaError(`Unhandled effect: '${effect.name}'`, sourceCodeInfo)
}

/**
 * Dispatch an effect to host-provided JavaScript handlers (middleware chain).
 *
 * Creates an `EffectContext` with `resume`, `suspend`, `fail`, and `next`
 * callbacks, then calls the first matching handler. If the handler calls
 * `next()`, the next handler in the chain is invoked with the same context
 * shape. If no more handlers remain after `next()`, the effect is unhandled.
 *
 * Each handler must call exactly one of `resume`, `suspend`, `fail`, or
 * `next` before its promise resolves (async) or before returning (sync).
 *
 * - `resume(value)` — resolves with a `ValueStep` that continues evaluation.
 * - `suspend(meta?)` — throws a `SuspensionSignal`.
 * - `fail(msg?)` — produces an `ErrorStep` routed through `dvala.error`.
 * - `next()` — pass to the next matching handler in the chain.
 *
 * Handlers may return `void` (synchronous) or `Promise<void>` (async).
 * When all handlers in a chain are synchronous, this function returns
 * a `Step` synchronously, allowing use from the sync trampoline.
 */
function dispatchHostHandler(
  effectName: string,
  matchingHandlers: [string, EffectHandler][],
  arg: Any,
  k: ContinuationStack,
  signal: AbortSignal | undefined,
  sourceCodeInfo: SourceCodeInfo | undefined,
  snapshotState?: SnapshotState,
): Step | Promise<Step> {
  const effectSignal = signal ?? new AbortController().signal

  // If the abort signal already fired before the handler was called, auto-suspend immediately.
  // This happens when a parallel group aborts (e.g. another branch suspended) before this
  // branch's dispatchHostHandler runs.
  if (effectSignal.aborted) {
    throwSuspension(k, undefined, effectName, arg)
  }

  type HandlerOutcome =
    | { kind: 'step'; step: Step }
    | { kind: 'asyncResume'; promise: Promise<Any> }
    | { kind: 'throw'; error: unknown }
    | { kind: 'next' }

  function resolveOutcome(o: HandlerOutcome, nextIndex: number): Step | Promise<Step> {
    switch (o.kind) {
      case 'step': return o.step
      case 'asyncResume': return o.promise.then(
        (v): Step => ({ type: 'Value', value: v, k }),
        (e): Step => ({ type: 'Error', error: e instanceof DvalaError ? e : new DvalaError(e instanceof Error ? e : `${e}`, sourceCodeInfo), k }),
      )
      case 'throw': throw o.error
      case 'next': return tryHandler(nextIndex)
    }
  }

  // Recursive helper: try handler at `index`, with `next()` advancing to `index + 1`.
  function tryHandler(index: number): Step | Promise<Step> {
    if (index >= matchingHandlers.length) {
      // All host handlers called next() — fall through to standard handlers
      const standardHandler = getStandardEffectHandler(effectName)
      if (standardHandler) {
        return standardHandler(arg, k, sourceCodeInfo)
      }

      if (effectName === 'dvala.error') {
        const message = typeof arg === 'string' ? arg : String(arg ?? 'Unknown error')
        throw new UserDefinedError(message, sourceCodeInfo)
      }
      // dvala.checkpoint resolves to null when all handlers call next().
      if (effectName === 'dvala.checkpoint') {
        return { type: 'Value', value: null, k }
      }
      throw new DvalaError(`Unhandled effect: '${effectName}'`, sourceCodeInfo)
    }

    const [_pattern, handler] = matchingHandlers[index]!

    let outcome: HandlerOutcome | undefined
    let settled = false

    function assertNotSettled(operation: string): void {
      if (settled) {
        throw new DvalaError(`Effect handler called ${operation}() after already calling another operation`, sourceCodeInfo)
      }
      settled = true
    }

    const ctx: EffectContext = {
      effectName,
      arg,
      signal: effectSignal,
      resume: (value: Any | Promise<Any>) => {
        assertNotSettled('resume')
        if (value instanceof Promise) {
          outcome = { kind: 'asyncResume', promise: value }
        } else {
          outcome = { kind: 'step', step: { type: 'Value', value, k } }
        }
      },
      fail: (msg?: string) => {
        assertNotSettled('fail')
        const errorMsg = msg ?? `Effect handler failed for '${effectName}'`
        outcome = { kind: 'step', step: { type: 'Error', error: new DvalaError(errorMsg, sourceCodeInfo), k } }
      },
      suspend: (meta?: Any) => {
        assertNotSettled('suspend')
        outcome = {
          kind: 'throw',
          error: new SuspensionSignal(
            k,
            snapshotState ? snapshotState.snapshots : [],
            snapshotState ? snapshotState.nextSnapshotIndex : 0,
            meta,
            effectName,
            arg,
          ),
        }
      },
      next: () => {
        assertNotSettled('next')
        outcome = { kind: 'next' }
      },
      get snapshots(): Snapshot[] { return snapshotState ? [...snapshotState.snapshots] : [] },
      checkpoint: (message: string, meta?: Any): Snapshot => {
        if (!snapshotState) {
          throw new DvalaError('checkpoint is not available outside effect-enabled execution', sourceCodeInfo)
        }
        const continuation = serializeToObject(k)
        const snapshot = createSnapshot({
          continuation,
          timestamp: Date.now(),
          index: snapshotState.nextSnapshotIndex++,
          executionId: snapshotState.executionId,
          message,
          ...(meta !== undefined ? { meta } : {}),
        })
        snapshotState.snapshots.push(snapshot)
        if (snapshotState.maxSnapshots !== undefined && snapshotState.snapshots.length > snapshotState.maxSnapshots) {
          snapshotState.snapshots.shift()
        }
        return snapshot
      },
      resumeFrom: (snapshot: Snapshot, value: Any) => {
        if (settled) {
          throw new DvalaError('Effect handler called resumeFrom() after already calling another operation', sourceCodeInfo)
        }
        if (!snapshotState) {
          throw new DvalaError('resumeFrom is not available outside effect-enabled execution', sourceCodeInfo)
        }
        const found = snapshotState.snapshots.find(s => s.index === snapshot.index && s.executionId === snapshot.executionId)
        if (!found) {
          throw new DvalaError(`Invalid snapshot: no snapshot with index ${snapshot.index} found in current run`, sourceCodeInfo)
        }
        settled = true
        outcome = { kind: 'throw', error: new ResumeFromSignal(found.continuation, value, found.index) }
      },
      halt: (value: Any = null) => {
        assertNotSettled('halt')
        outcome = {
          kind: 'throw',
          error: new HaltSignal(
            value,
            snapshotState ? snapshotState.snapshots : [],
            snapshotState ? snapshotState.nextSnapshotIndex : 0,
          ),
        }
      },
    }

    const handlerResult = handler(ctx)

    if (!(handlerResult instanceof Promise)) {
      // Synchronous handler — outcome must already be set
      if (!outcome) {
        throw new DvalaError(`Effect handler for '${effectName}' did not call resume(), fail(), suspend(), halt(), or next()`, sourceCodeInfo)
      }
      return resolveOutcome(outcome, index + 1)
    }

    // Async handler
    if (outcome) {
      // Handler settled synchronously before the async part
      handlerResult.catch(() => {}) // suppress unhandled rejection
      return resolveOutcome(outcome, index + 1)
    }

    // Not yet settled — wait for the handler's promise
    return handlerResult.then(
      () => {
        if (!outcome) {
          throw new DvalaError(`Effect handler for '${effectName}' did not call resume(), fail(), suspend(), halt(), or next()`, sourceCodeInfo)
        }
        return resolveOutcome(outcome, index + 1)
      },
      e => {
        if (outcome) {
          // Already settled — return that result, ignore the rejection
          return resolveOutcome(outcome, index + 1)
        }
        if (isSuspensionSignal(e) || isResumeFromSignal(e) || isHaltSignal(e)) {

          throw e
        }
        const errorStep: Step = {
          type: 'Error',
          error: e instanceof DvalaError ? e : new DvalaError(e instanceof Error ? e : `${e}`, sourceCodeInfo),
          k,
        }
        return errorStep
      },
    )
  }

  return tryHandler(0)
}

// ---------------------------------------------------------------------------
// Parallel & Race — concurrent branch execution
// ---------------------------------------------------------------------------

/**
 * Throw a SuspensionSignal. Factored out to a helper so ESLint's
 * `only-throw-literal` rule can be suppressed in one place.
 */
/** Combine two AbortSignals: aborts when either fires (or already aborted). */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController()
  if (a.aborted || b.aborted) {
    controller.abort()
    return controller.signal
  }
  a.addEventListener('abort', () => controller.abort(), { once: true })
  b.addEventListener('abort', () => controller.abort(), { once: true })
  return controller.signal
}

function throwSuspension(k: ContinuationStack, meta?: Any, effectName?: string, effectArg?: Any): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- SuspensionSignal is a signaling mechanism, not an error
  throw new SuspensionSignal(k, [], 0, meta, effectName, effectArg)
}

/**
 * Run a single trampoline branch to completion with effect handler support.
 *
 * This is the core building block for `parallel` and `race`. Each branch
 * runs as an independent trampoline invocation through `runEffectLoop`,
 * producing a `RunResult` that is either `completed`, `suspended`, or `error`.
 *
 * The branch receives the same `handlers` and the given `signal`, allowing
 * the caller to cancel branches via AbortController.
 */
async function runBranch(
  node: AstNode,
  env: ContextStack,
  handlers: Handlers | undefined,
  signal: AbortSignal,
): Promise<RunResult> {
  const initial: Step = { type: 'Eval', node, env, k: [] }
  return runEffectLoop(initial, handlers, signal)
}

/**
 * Execute a `parallel(...)` expression.
 *
 * Runs all branch expressions concurrently as independent trampoline
 * invocations using `Promise.allSettled`. Results are collected in order.
 *
 * Outcome:
 * - All branches complete → return `ValueStep` with array of results
 * - Any branch suspends → throw `SuspensionSignal` with a `ParallelResumeFrame`
 *   on the outer continuation. The host can resume branches one at a time.
 * - Any branch errors → throw the first error (other branches still complete
 *   but errors take priority)
 */
async function executeParallelBranches(
  branches: AstNode[],
  env: ContextStack,
  k: ContinuationStack,
  handlers: Handlers | undefined,
  signal: AbortSignal | undefined,
): Promise<Step> {
  // AbortController for this parallel group — aborted when any branch suspends,
  // which signals remaining effect handlers to auto-suspend via ctx.signal.
  const parallelAbort = new AbortController()
  const effectSignal = signal
    ? combineSignals(signal, parallelAbort.signal)
    : parallelAbort.signal

  // Run all branches concurrently; abort the group when a branch suspends
  const branchPromises = branches.map(async (branch, i): Promise<{ index: number; result: RunResult }> => {
    const result = await runBranch(branch, env, handlers, effectSignal)
    if (result.type === 'suspended') {
      parallelAbort.abort()
    }
    return { index: i, result }
  })
  const results = await Promise.allSettled(branchPromises)

  // Collect outcomes
  const completedBranches: { index: number; value: Any }[] = []
  const suspendedBranches: { index: number; snapshot: Snapshot }[] = []
  const errors: DvalaError[] = []

  for (const settled of results) {
    if (settled.status === 'rejected') {
      // branchPromises should never reject, but handle defensively
      errors.push(new DvalaError(`${settled.reason}`, undefined))
    } else {
      const { index, result } = settled.value
      switch (result.type) {
        case 'completed':
          completedBranches.push({ index, value: result.value })
          break
        case 'suspended':
          suspendedBranches.push({ index, snapshot: result.snapshot })
          break
        case 'error':
          errors.push(result.error)
          break
      }
    }
  }

  // If any branch errored, throw the first error
  if (errors.length > 0) {
    throw errors[0]!
  }

  // If any branch suspended, build a composite suspension
  if (suspendedBranches.length > 0) {
    // Build a ParallelResumeFrame on the outer continuation
    const parallelResumeFrame: ParallelResumeFrame = {
      type: 'ParallelResume',
      branchCount: branches.length,
      completedBranches,
      suspendedBranches: suspendedBranches.slice(1), // remaining after the first
    }
    const resumeK: ContinuationStack = [parallelResumeFrame, ...k]

    // Throw SuspensionSignal with the first suspended branch's meta and effect info
    const firstSuspended = suspendedBranches[0]!
    return throwSuspension(resumeK, firstSuspended.snapshot.meta, firstSuspended.snapshot.effectName, firstSuspended.snapshot.effectArg)
  }

  // All branches completed — build the result array in original order
  const resultArray: Any[] = Array.from({ length: branches.length })
  for (const { index, value } of completedBranches) {
    resultArray[index] = value
  }
  return { type: 'Value', value: resultArray, k }
}

/**
 * Execute a `race(...)` expression.
 *
 * Runs all branch expressions concurrently. The first branch to complete
 * wins — its value becomes the result. Losing branches are cancelled via
 * per-branch AbortControllers.
 *
 * Branch outcome priority: completed > suspended > errored.
 * - First completed branch wins immediately.
 * - Errored branches are silently dropped.
 * - If no branch completes but some suspend, the race suspends with only
 *   the outer continuation. The host provides the winner value directly.
 * - If all branches error, throw an aggregate error.
 */
async function executeRaceBranches(
  branches: AstNode[],
  env: ContextStack,
  k: ContinuationStack,
  handlers: Handlers | undefined,
  signal: AbortSignal | undefined,
): Promise<Step> {
  const parentSignal = signal ?? new AbortController().signal

  // Each branch gets its own AbortController so losers can be cancelled
  const branchControllers = branches.map(() => new AbortController())

  // Link: if parent signal aborts, abort all branches
  const onParentAbort = () => {
    for (const ctrl of branchControllers) {
      ctrl.abort(parentSignal.reason)
    }
  }
  parentSignal.addEventListener('abort', onParentAbort, { once: true })

  try {
    // Track the first branch to complete (temporal order, not positional)
    let winnerIndex = -1
    let winnerValue: Any = null

    // Run all branches concurrently, tracking completion order
    const branchPromises = branches.map(async (branch, i) => {
      const branchSignal = branchControllers[i]!.signal
      const result = await runBranch(branch, env, handlers, branchSignal)

      // First branch to complete wins (JavaScript is single-threaded,
      // so the first resolved promise's continuation runs first)
      if (result.type === 'completed' && winnerIndex < 0) {
        winnerIndex = i
        winnerValue = result.value
        // Cancel all other branches
        for (let j = 0; j < branchControllers.length; j++) {
          if (j !== i) {
            branchControllers[j]!.abort('race: branch lost')
          }
        }
      }
      return result
    })

    // Wait for all branches to settle (even cancelled ones)
    const results = await Promise.allSettled(branchPromises)

    // If we have a winner, return it
    if (winnerIndex >= 0) {
      return { type: 'Value', value: winnerValue, k }
    }

    // No completed branch — collect suspended and errored
    const suspendedMetas: Any[] = []
    const errors: DvalaError[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!
      if (result.status === 'rejected') {
        errors.push(new DvalaError(`${result.reason}`, undefined))
      } else {
        const r = result.value
        switch (r.type) {
          case 'suspended':
            suspendedMetas.push(r.snapshot.meta ?? null)
            break
          case 'error':
            errors.push(r.error)
            break
          /* v8 ignore next 3 */
          case 'completed':
            // Already handled via winnerIndex above
            break
        }
      }
    }

    // If some branches suspended, the race suspends
    if (suspendedMetas.length > 0) {
      // Race suspension: only outer k, host provides winner value directly
      // Meta contains all branch metas so host knows who is waiting
      const raceMeta: Any = { type: 'race', branches: suspendedMetas }
      throwSuspension(k, raceMeta)
    }

    // All branches errored — throw aggregate error
    const messages = errors.map(e => e.message).join('; ')
    throw new DvalaError(`race: all branches failed: ${messages}`, undefined)
  } finally {
    parentSignal.removeEventListener('abort', onParentAbort)
  }
}

/**
 * Handle a `ParallelResume` step — resume the first suspended branch.
 *
 * Called from `tick()` when a `ParallelResumeFrame` produces a
 * `ParallelResumeStep`. The value is the host's resume value for the
 * first pending suspended branch.
 *
 * Logic:
 * 1. The `completedBranches` already has the branches that completed before.
 * 2. The `value` is for the branch that was exposed to the host (the one
 *    whose meta was in the SuspensionSignal). We DON'T re-run any blob —
 *    the host has already decided the value.
 * 3. If more branches are suspended, throw another SuspensionSignal.
 * 4. If all branches are now done, build the result array.
 */
function handleParallelResume(
  step: Step & { type: 'ParallelResume' },
  _handlers: Handlers | undefined,
  _signal: AbortSignal | undefined,
): Step {
  const { value, branchCount, completedBranches, suspendedBranches, k } = step

  // The first suspended branch (whose meta was exposed) is now completed
  // We need to know its index — it was removed from suspendedBranches
  // and its index can be derived from what's missing.
  // Actually, looking at how we build this: the first suspended branch
  // was kept OUT of suspendedBranches (slice(1)), and its meta was used
  // in the SuspensionSignal. But we need its index!
  //
  // Let me reconsider: we need to track which branch index the host resume
  // value is for. The index is determined by what's NOT in completedBranches
  // or suspendedBranches.
  //
  // Better approach: store the current branch index explicitly.
  // Since we're in the middle of implementing, let me find the missing index.
  const completedIndices = new Set(completedBranches.map(b => b.index))
  const suspendedIndices = new Set(suspendedBranches.map(b => b.index))
  let currentBranchIndex = -1
  for (let i = 0; i < branchCount; i++) {
    if (!completedIndices.has(i) && !suspendedIndices.has(i)) {
      currentBranchIndex = i
      break
    }
  }

  // Add the just-resumed branch to completed
  const updatedCompleted = [...completedBranches, { index: currentBranchIndex, value }]

  // If more branches are suspended, suspend again with next one's meta
  if (suspendedBranches.length > 0) {
    const nextSuspended = suspendedBranches[0]!
    const remaining = suspendedBranches.slice(1)

    const parallelResumeFrame: ParallelResumeFrame = {
      type: 'ParallelResume',
      branchCount,
      completedBranches: updatedCompleted,
      suspendedBranches: remaining,
    }
    const resumeK: ContinuationStack = [parallelResumeFrame, ...k]
    return throwSuspension(resumeK, nextSuspended.snapshot.meta, nextSuspended.snapshot.effectName, nextSuspended.snapshot.effectArg)
  }

  // All branches now completed — build the result array in original order
  const resultArray: Any[] = Array.from({ length: branchCount })
  for (const { index, value: v } of updatedCompleted) {
    resultArray[index] = v
  }
  return { type: 'Value', value: resultArray, k }
}

function applyEvalArgs(frame: EvalArgsFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { node, params, placeholders, env } = frame
  const argNodes = node[1][1]
  const currentArgNode = argNodes[frame.index]!

  // Process the completed value
  if (isSpreadNode(currentArgNode)) {
    if (!Array.isArray(value)) {
      throw new DvalaError(`Spread operator requires an array, got ${valueToString(value)}`, currentArgNode[2])
    }
    params.push(...value)
  } else {
    params.push(value)
  }

  // Find the next real argument (skip placeholders)
  let nextIndex = frame.index + 1
  while (nextIndex < argNodes.length) {
    const nextArg = argNodes[nextIndex]!
    if (nextArg[0] === NodeTypes.ReservedSymbol && nextArg[1] === '_') {
      placeholders.push(params.length)
      nextIndex++
    } else {
      break
    }
  }

  if (nextIndex >= argNodes.length) {
    // All args evaluated — dispatch the call
    return dispatchCall({ ...frame, index: nextIndex }, k)
  }

  // Evaluate next argument
  const newFrame: EvalArgsFrame = { ...frame, index: nextIndex }
  const nextArg = argNodes[nextIndex]!
  if (isSpreadNode(nextArg)) {
    return { type: 'Eval', node: nextArg[1], env, k: [newFrame, ...k] }
  }
  return { type: 'Eval', node: nextArg, env, k: [newFrame, ...k] }
}

function applyCallFn(frame: CallFnFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  // `value` is the resolved function value
  const fn = asFunctionLike(value, frame.sourceCodeInfo)
  return dispatchFunction(fn, frame.params, frame.placeholders, frame.env, frame.sourceCodeInfo, k)
}

function applyFnBody(frame: FnBodyFrame, value: Any, k: ContinuationStack): Step {
  const { fn, bodyIndex, env } = frame
  const bodyNodes = fn.evaluatedfunction[1]

  if (bodyIndex >= bodyNodes.length) {
    // All body nodes evaluated — return the result
    return { type: 'Value', value, k }
  }

  // More body nodes to evaluate.
  // The FnBodyFrame is always pushed — even for the last body node — because
  // `handleRecur` walks the continuation stack looking for it. When recur fires
  // inside the last expression, handleRecur finds this frame, slices the stack
  // at that point, and calls setupUserDefinedCall with the remaining stack.
  // This replaces the old FnBodyFrame rather than growing the stack — achieving
  // proper tail call elimination.
  const newFrame: FnBodyFrame = { ...frame, bodyIndex: bodyIndex + 1 }
  return { type: 'Eval', node: bodyNodes[bodyIndex]!, env, k: [newFrame, ...k] }
}

/**
 * Handle function argument binding after a default value is evaluated.
 * Binds the value to the current argument using slots, then continues with remaining args.
 */
function applyFnArgBind(frame: FnArgBindFrame, value: Any, k: ContinuationStack): Step {
  const { fn, params, argIndex, context, outerEnv, sourceCodeInfo } = frame
  const evaluatedFunc = fn.evaluatedfunction
  const args = evaluatedFunc[0]
  const nbrOfNonRestArgs = args.filter(arg => arg[0] !== bindingTargetTypes.rest).length

  // Use startBindingSlots to bind the evaluated default value
  const arg = args[argIndex]!
  const closureContext = evaluatedFunc[2]
  const bindingEnv = outerEnv.create(closureContext).create(context)

  // Create completion frame to continue after binding
  const completeFrame: FnArgSlotCompleteFrame = {
    type: 'FnArgSlotComplete',
    fn,
    params,
    argIndex,
    nbrOfNonRestArgs,
    context,
    outerEnv,
    sourceCodeInfo,
  }

  return startBindingSlots(arg, value, bindingEnv, sourceCodeInfo, [completeFrame, ...k])
}

/**
 * Handle completion of slot-based binding for a function argument.
 * Merges the binding record into context and continues with next arg.
 */
function applyFnArgSlotComplete(frame: FnArgSlotCompleteFrame, value: Any, k: ContinuationStack): Step {
  const { fn, params, argIndex, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo } = frame

  // value is the binding record from startBindingSlots
  const record = value as Record<string, Any>
  Object.entries(record).forEach(([key, val]) => {
    context[key] = { value: val }
  })

  // Continue with remaining arguments
  return continueArgSlotBinding(fn, params, argIndex + 1, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo, k)
}

/**
 * Handle completion of rest argument slot-based binding.
 * Merges bindings into context and proceeds to body evaluation.
 */
function applyFnRestArgComplete(frame: FnRestArgCompleteFrame, value: Any, k: ContinuationStack): Step {
  const { fn, context, outerEnv, sourceCodeInfo } = frame

  // value is the binding record from startBindingSlots
  const record = value as Record<string, Any>
  Object.entries(record).forEach(([key, val]) => {
    context[key] = { value: val }
  })

  // Proceed to body evaluation
  return proceedToFnBody(fn, context, outerEnv, sourceCodeInfo, k)
}

/**
 * Continue binding function arguments starting from argIndex.
 * Handles only the default evaluation phase - rest handling moved to handleRestArgAndBody.
 */
function continueBindingArgs(
  fn: UserDefinedFunction,
  params: Arr,
  argIndex: number,
  nbrOfNonRestArgs: number,
  context: Context,
  outerEnv: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const evaluatedFunc = fn.evaluatedfunction
  const args = evaluatedFunc[0]
  const closureContext = evaluatedFunc[2]
  const bindingEnv = outerEnv.create(closureContext).create(context)

  // Continue binding optional params that need defaults
  for (let i = argIndex; i < nbrOfNonRestArgs; i++) {
    const arg = args[i]!
    const defaultNode = arg[1][1]
    if (!defaultNode) {
      throw new DvalaError(`Missing required argument ${i}`, sourceCodeInfo)
    }

    // Push frame to continue after default evaluation
    const frame: FnArgBindFrame = {
      type: 'FnArgBind',
      phase: 'default',
      fn,
      params,
      argIndex: i,
      context,
      outerEnv,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: defaultNode, env: bindingEnv, k: [frame, ...k] }
  }

  // All non-rest args bound, handle rest argument and proceed to body
  return handleRestArgAndBody(fn, params, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo, k)
}

/**
 * Start processing a binding pattern using linearized slots.
 * This is the entry point for frame-based destructuring.
 * @internal Exported for testing/incremental migration
 */
export function startBindingSlots(
  target: BindingTarget,
  rootValue: Any,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  // Validate root structure type (e.g., array binding requires array value)
  validateBindingRootType(target, rootValue, sourceCodeInfo)

  const slots = flattenBindingPattern(target)
  const record: Record<string, Any> = {}
  const contexts: BindingSlotContext[] = [{ slots, index: 0, rootValue }]
  return continueBindingSlots(contexts, record, env, sourceCodeInfo, k)
}

/**
 * Continue processing binding slots using the context stack.
 * Handles extracting values, evaluating defaults, and nested binding targets.
 */
function continueBindingSlots(
  contexts: BindingSlotContext[],
  record: Record<string, Any>,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  while (contexts.length > 0) {
    const ctx = contexts[contexts.length - 1]!

    if (ctx.index >= ctx.slots.length) {
      // All slots in this context done — pop and continue with parent
      contexts.pop()
      continue
    }

    const slot = ctx.slots[ctx.index]!

    if (slot.isRest) {
      // Rest binding — extract rest values
      if (slot.restKeys !== undefined) {
        // Object rest
        const parentValue = slot.path.length > 0
          ? extractValueByPath(ctx.rootValue, slot.path, sourceCodeInfo) ?? null
          : ctx.rootValue
        record[slot.name] = extractObjectRest(parentValue, slot.restKeys, sourceCodeInfo)
      } else if (slot.restIndex !== undefined) {
        // Array rest
        const parentValue = slot.path.length > 0
          ? extractValueByPath(ctx.rootValue, slot.path, sourceCodeInfo) ?? null
          : ctx.rootValue
        record[slot.name] = extractArrayRest(parentValue, slot.restIndex, sourceCodeInfo)
      } else {
        // Simple rest binding (e.g., ...args at function level)
        // The value is the root value at the current path
        const value = slot.path.length > 0
          ? extractValueByPath(ctx.rootValue, slot.path, sourceCodeInfo) ?? null
          : ctx.rootValue
        record[slot.name] = value
      }
      ctx.index++
      continue
    }

    // Extract value by following the path
    const value = extractValueByPath(ctx.rootValue, slot.path, sourceCodeInfo)

    if (value === undefined && slot.defaultNode) {
      // Need to evaluate default — push frame and evaluate
      const frame: BindingSlotFrame = {
        type: 'BindingSlot',
        contexts: contexts.map(c => ({ ...c })), // snapshot context stack
        record,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: slot.defaultNode, env, k: [frame, ...k] }
    }

    const resolvedValue = value ?? null

    // Check if this slot has a nested binding target
    if (slot.nestedTarget) {
      // Push a new context for the nested structure
      // The nested target is already stripped of its default (we used the resolved value)
      const nestedSlots = flattenBindingPatternWithoutDefault(slot.nestedTarget)
      validateBindingRootType(slot.nestedTarget, resolvedValue, slot.sourceCodeInfo)
      contexts.push({ slots: nestedSlots, index: 0, rootValue: resolvedValue })
      ctx.index++ // advance parent context past this slot
      continue
    }

    // Simple binding — store the value
    record[slot.name] = resolvedValue
    ctx.index++
  }

  // All contexts done — return the record
  return { type: 'Value', value: record, k }
}

/**
 * Flatten a binding pattern without using its top-level default.
 * Used when we've already resolved the default and need to process the nested structure.
 */
function flattenBindingPatternWithoutDefault(target: BindingTarget): BindingSlot[] {
  // The target may have form [type, [content, defaultNode], sourceCodeInfo]
  // We create a version without the default for flattening
  const targetWithoutDefault: BindingTarget = [
    target[0],
    [target[1][0], undefined] as [typeof target[1][0], undefined],
    target[2],
  ] as BindingTarget
  return flattenBindingPattern(targetWithoutDefault)
}

/**
 * Handle continuation after evaluating a binding slot's default value.
 */
function applyBindingSlot(frame: BindingSlotFrame, value: Any, k: ContinuationStack): Step {
  const { contexts, record, env, sourceCodeInfo } = frame
  const ctx = contexts[contexts.length - 1]!
  const slot = ctx.slots[ctx.index]!
  const resolvedValue = value ?? null

  // Check if this slot has a nested binding target
  if (slot.nestedTarget) {
    // Push a new context for the nested structure
    const nestedSlots = flattenBindingPatternWithoutDefault(slot.nestedTarget)
    validateBindingRootType(slot.nestedTarget, resolvedValue, slot.sourceCodeInfo)
    contexts.push({ slots: nestedSlots, index: 0, rootValue: resolvedValue })
    ctx.index++ // advance parent context past this slot
  } else {
    // Simple binding — store the value
    record[slot.name] = resolvedValue
    ctx.index++
  }

  // Continue with remaining slots
  return continueBindingSlots(contexts, record, env, sourceCodeInfo, k)
}

// ---------------------------------------------------------------------------
// Frame-based pattern matching
// ---------------------------------------------------------------------------

/**
 * Start pattern matching with slot-based processing.
 * Returns Step to continue matching, or moves to next case on failure.
 */
function startMatchSlots(
  pattern: BindingTarget,
  matchValue: Any,
  matchFrame: MatchFrame,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  // Check root type constraints first
  if (!checkObjectTypeConstraint(pattern, matchValue)) {
    return tryNextMatchCase(matchFrame, k)
  }
  if (!checkArrayLengthConstraint(pattern, matchValue)) {
    return tryNextMatchCase(matchFrame, k)
  }

  // Flatten pattern to slots
  const slots = flattenMatchPattern(pattern)
  if (slots.length === 0) {
    // Empty pattern (e.g., wildcard) - match succeeded with no bindings
    return matchSucceeded({}, matchFrame, k)
  }

  // Start processing slots
  const contexts: MatchSlotContext[] = [{ slots, index: 0, rootValue: matchValue }]
  const record: Record<string, Any> = {}
  return continueMatchSlots(contexts, record, matchFrame, env, sourceCodeInfo, k)
}

/**
 * Continue processing match slots.
 * Returns Step for next action (eval, success, or try next case).
 */
function continueMatchSlots(
  contexts: MatchSlotContext[],
  record: Record<string, Any>,
  matchFrame: MatchFrame,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  while (contexts.length > 0) {
    const ctx = contexts[contexts.length - 1]!

    if (ctx.index >= ctx.slots.length) {
      // All slots in this context done — pop and continue
      contexts.pop()
      continue
    }

    const slot = ctx.slots[ctx.index]!

    switch (slot.kind) {
      case 'wildcard':
        // Always matches, binds nothing
        ctx.index++
        continue

      case 'typeCheck': {
        // Check type at path
        if (!slot.requiredType || !checkTypeAtPath(ctx.rootValue, slot.path, slot.requiredType)) {
          return tryNextMatchCase(matchFrame, k)
        }
        ctx.index++
        continue
      }

      case 'literal': {
        // Need to evaluate literal node for comparison
        const frame: MatchSlotFrame = {
          type: 'MatchSlot',
          contexts: contexts.map(c => ({ ...c })),
          record: { ...record },
          matchFrame,
          phase: 'literal',
          currentSlot: slot,
          env,
          sourceCodeInfo,
        }
        return { type: 'Eval', node: slot.literalNode!, env, k: [frame, ...k] }
      }

      case 'rest': {
        // Collect rest values
        if (slot.restKeys !== undefined) {
          // Object rest
          record[slot.name!] = extractMatchObjectRest(ctx.rootValue, slot.path, slot.restKeys)
        } else if (slot.restIndex !== undefined) {
          // Array rest
          record[slot.name!] = extractMatchArrayRest(ctx.rootValue, slot.path, slot.restIndex)
        } else {
          // Simple rest (e.g., ...args at function level) - shouldn't occur in patterns
          const value = slot.path.length > 0
            ? extractMatchValueByPath(ctx.rootValue, slot.path) ?? null
            : ctx.rootValue
          record[slot.name!] = value
        }
        ctx.index++
        continue
      }

      case 'bind': {
        // Extract value by path
        const value = extractMatchValueByPath(ctx.rootValue, slot.path)

        if (value === undefined || value === null) {
          if (slot.defaultNode) {
            // Need to evaluate default
            const frame: MatchSlotFrame = {
              type: 'MatchSlot',
              contexts: contexts.map(c => ({ ...c })),
              record: { ...record },
              matchFrame,
              phase: 'default',
              currentSlot: slot,
              env,
              sourceCodeInfo,
            }
            return { type: 'Eval', node: slot.defaultNode, env, k: [frame, ...k] }
          }
          // No default, bind null
          record[slot.name!] = value ?? null
        } else {
          record[slot.name!] = value
        }
        ctx.index++
        continue
      }
    }
  }

  // All contexts done — match succeeded
  return matchSucceeded(record, matchFrame, k)
}

/**
 * Handle continuation after evaluating a match slot value.
 */
function applyMatchSlot(frame: MatchSlotFrame, value: Any, k: ContinuationStack): Step {
  const { contexts, record, matchFrame, phase, currentSlot, env, sourceCodeInfo } = frame
  const ctx = contexts[contexts.length - 1]!

  if (phase === 'literal') {
    // Compare evaluated literal with actual value
    const actualValue = extractMatchValueByPath(ctx.rootValue, currentSlot.path)
    if (!deepEqual(actualValue, value)) {
      // Literal doesn't match — try next case
      return tryNextMatchCase(matchFrame, k)
    }
    // Literal matched — continue with next slot
    ctx.index++
  } else {
    // Default value evaluated — bind it
    record[currentSlot.name!] = value ?? null
    ctx.index++
  }

  return continueMatchSlots(contexts, record, matchFrame, env, sourceCodeInfo, k)
}

/**
 * Pattern matching succeeded — proceed to guard or body.
 */
function matchSucceeded(
  bindings: Record<string, Any>,
  matchFrame: MatchFrame,
  k: ContinuationStack,
): Step {
  const { cases, index, env } = matchFrame
  const [, body, guard] = cases[index]!

  // Create environment with bindings
  const context: Context = {}
  for (const [name, val] of Object.entries(bindings)) {
    context[name] = { value: val }
  }

  if (guard) {
    // Need to evaluate guard with bindings in scope
    const guardEnv = env.create(context)
    const guardFrame: MatchFrame = { ...matchFrame, phase: 'guard', bindings }
    return { type: 'Eval', node: guard, env: guardEnv, k: [guardFrame, ...k] }
  }

  // No guard — evaluate body directly
  const bodyEnv = env.create(context)
  return { type: 'Eval', node: body, env: bodyEnv, k }
}

/**
 * Current pattern didn't match — try next case.
 */
function tryNextMatchCase(matchFrame: MatchFrame, k: ContinuationStack): Step {
  const nextFrame: MatchFrame = { ...matchFrame, index: matchFrame.index + 1 }
  return processMatchCase(nextFrame, k)
}

/**
 * Handles continuation after evaluating an effect reference expression.
 * Stores the evaluated ref, then either evaluates the next ref or starts the body.
 */
function applyEffectRef(frame: EffectRefFrame, value: Any, k: ContinuationStack): Step {
  const { handlerNodes, evaluatedHandlers, index, bodyNodes, bodyEnv, env, sourceCodeInfo } = frame

  // Store the evaluated effect reference
  const currentHandler = handlerNodes[index]!
  evaluatedHandlers.push({
    effectRef: value,
    handlerNode: currentHandler[1],
  })

  const nextIndex = index + 1

  // If more handlers to evaluate, continue with next effect expression
  if (nextIndex < handlerNodes.length) {
    const nextFrame: EffectRefFrame = {
      type: 'EffectRef',
      handlerNodes,
      evaluatedHandlers,
      index: nextIndex,
      bodyNodes,
      bodyEnv,
      env,
      sourceCodeInfo,
    }
    const nextEffectExpr = handlerNodes[nextIndex]![0]
    return { type: 'Eval', node: nextEffectExpr, env, k: [nextFrame, ...k] }
  }

  // All handlers evaluated — build TryWithFrame and evaluate body
  const withFrame: TryWithFrame = {
    type: 'TryWith',
    handlers: evaluatedHandlers,
    env,
    sourceCodeInfo,
  }
  const bodyK: ContinuationStack = [withFrame, ...k]

  if (bodyNodes.length === 0) {
    return { type: 'Value', value: null, k: bodyK }
  }
  if (bodyNodes.length === 1) {
    return { type: 'Eval', node: bodyNodes[0]!, env: bodyEnv, k: bodyK }
  }
  const sequenceFrame: SequenceFrame = {
    type: 'Sequence',
    nodes: bodyNodes,
    index: 1,
    env: bodyEnv,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: bodyNodes[0]!, env: bodyEnv, k: [sequenceFrame, ...bodyK] }
}

/**
 * Handler expression has been evaluated — dispatch the handler function.
 */
function applyHandlerInvoke(frame: HandlerInvokeFrame, value: Any, _k: ContinuationStack): Step | Promise<Step> {
  const fnLike = asFunctionLike(value, frame.sourceCodeInfo)
  return dispatchFunction(fnLike, [frame.arg], [], frame.handlerEnv, frame.sourceCodeInfo, frame.handlerK)
}

/**
 * Comp iteration — chain to the next function in the composition.
 * Result from previous function is wrapped in array and passed to next.
 */
function applyComp(frame: CompFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { fns, index, env, sourceCodeInfo } = frame
  // Wrap result in array for next function call
  const nextParams: Arr = [value]

  if (index < 0) {
    // All functions called, return final result
    return { type: 'Value', value: asAny(value, sourceCodeInfo), k }
  }

  // Call the next function in the chain
  const nextFrame: CompFrame = { type: 'Comp', fns, index: index - 1, env, sourceCodeInfo }
  return dispatchFunction(asFunctionLike(fns[index], sourceCodeInfo), nextParams, [], env, sourceCodeInfo, [nextFrame, ...k])
}

/**
 * Juxt iteration — collect result and call next function.
 */
function applyJuxt(frame: JuxtFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { fns, params, index, results, env, sourceCodeInfo } = frame
  // Add result to accumulated array
  const newResults = [...results, value]

  if (index >= fns.length) {
    // All functions called, return collected results
    return { type: 'Value', value: newResults, k }
  }

  // Call the next function
  const nextFrame: JuxtFrame = { type: 'Juxt', fns, params, index: index + 1, results: newResults, env, sourceCodeInfo }
  return dispatchFunction(asFunctionLike(fns[index], sourceCodeInfo), params, [], env, sourceCodeInfo, [nextFrame, ...k])
}

/**
 * EveryPred iteration — short-circuit on falsy, continue on truthy.
 */
function applyEveryPred(frame: EveryPredFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { checks, index, env, sourceCodeInfo } = frame

  // Short-circuit: if result is falsy, return false
  if (!value) {
    return { type: 'Value', value: false, k }
  }

  if (index >= checks.length) {
    // All checks passed, return true
    return { type: 'Value', value: true, k }
  }

  // Continue to next check
  const nextFrame: EveryPredFrame = { type: 'EveryPred', checks, index: index + 1, env, sourceCodeInfo }
  const check = checks[index]!
  return dispatchFunction(check.fn, [check.param], [], env, sourceCodeInfo, [nextFrame, ...k])
}

/**
 * SomePred iteration — short-circuit on truthy, continue on falsy.
 */
function applySomePred(frame: SomePredFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { checks, index, env, sourceCodeInfo } = frame

  // Short-circuit: if result is truthy, return true
  if (value) {
    return { type: 'Value', value: true, k }
  }

  if (index >= checks.length) {
    // All checks failed, return false
    return { type: 'Value', value: false, k }
  }

  // Continue to next check
  const nextFrame: SomePredFrame = { type: 'SomePred', checks, index: index + 1, env, sourceCodeInfo }
  const check = checks[index]!
  return dispatchFunction(check.fn, [check.param], [], env, sourceCodeInfo, [nextFrame, ...k])
}

function applyNanCheck(frame: NanCheckFrame, value: Any, k: ContinuationStack): Step {
  if (typeof value === 'number' && Number.isNaN(value)) {
    throw new DvalaError('Number is NaN', frame.sourceCodeInfo)
  }
  return { type: 'Value', value: annotate(value), k }
}

// ---------------------------------------------------------------------------
// Debug step handling
// ---------------------------------------------------------------------------

/**
 * Extract all visible bindings from a ContextStack as a flat record.
 * Iterates from outermost to innermost scope so that inner bindings
 * shadow outer ones, matching Dvala scoping semantics.
 */
export function extractBindings(env: ContextStack): Record<string, Any> {
  const result: Record<string, Any> = {}
  // Include host values (plain bindings passed at creation)
  const hostValues = env.getHostValues()
  if (hostValues) {
    for (const [name, value] of Object.entries(hostValues)) {
      result[name] = value as Any
    }
  }
  const contexts = env.getContextsRaw()
  // Outer scopes first, inner override
  for (let i = contexts.length - 1; i >= 0; i--) {
    for (const [name, entry] of Object.entries(contexts[i]!)) {
      result[name] = entry.value
    }
  }
  return result
}

/**
 * Apply a DebugStepFrame.
 *
 * Phase 'awaitValue': The compound expression just evaluated to `value`.
 *   Build step info and produce a PerformStep for `dvala.debug.step`.
 *   Push self (in 'awaitPerform' phase) onto k so that when the debug
 *   perform completes, the value flows through correctly.
 *
 * Phase 'awaitPerform': The debug perform completed (handler resumed or
 *   suspension was resumed). Pass the value through to the next frame.
 *   For normal stepping, the debugger resumes with the original value.
 *   For `rerunFrom`, the debugger resumes with an alternate value.
 */
function applyDebugStep(frame: DebugStepFrame, value: Any, k: ContinuationStack): Step {
  if (frame.phase === 'awaitValue') {
    // Build step info from source code info and evaluation result
    const stepInfo: Obj = {
      expression: frame.sourceCodeInfo?.code ?? '',
      value,
      location: frame.sourceCodeInfo
        ? { line: frame.sourceCodeInfo.position.line, column: frame.sourceCodeInfo.position.column }
        : { line: 0, column: 0 },
      env: extractBindings(frame.env),
    }

    // Push awaitPerform phase frame, then produce PerformStep
    const awaitFrame: DebugStepFrame = {
      type: 'DebugStep',
      phase: 'awaitPerform',
      sourceCodeInfo: frame.sourceCodeInfo,
      env: frame.env,
    }
    const debugEffect = getEffectRef('dvala.debug.step')
    return { type: 'Perform', effect: debugEffect, arg: stepInfo as Any, k: [awaitFrame, ...k] }
  }

  // phase === 'awaitPerform': pass through the value
  return { type: 'Value', value, k }
}

function applyAutoCheckpoint(frame: AutoCheckpointFrame, k: ContinuationStack): Step {
  // Checkpoint resolved — now dispatch the original effect with a marker frame
  // so dispatchPerform knows to skip auto-checkpoint for this re-dispatch.
  const markerFrame: AutoCheckpointFrame = {
    type: 'AutoCheckpoint',
    phase: 'awaitEffect',
    effect: frame.effect,
    arg: frame.arg,
    sourceCodeInfo: frame.sourceCodeInfo,
  }
  return { type: 'Perform', effect: frame.effect, arg: frame.arg, k: [markerFrame, ...k], sourceCodeInfo: frame.sourceCodeInfo }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Wrap a MaybePromise<Any> result into a Step or Promise<Step>.
 * If the result is a value, return a ValueStep immediately.
 * If it's a Promise, return a Promise<Step> that resolves to a ValueStep.
 * The trampoline loop handles the async case: runSyncTrampoline throws,
 * runAsyncTrampoline awaits.
 */
function wrapMaybePromiseAsStep(result: MaybePromise<Any>, k: ContinuationStack): Step | Promise<Step> {
  if (result instanceof Promise) {
    return result.then(
      value => ({ type: 'Value' as const, value, k }),
      error => ({
        type: 'Error' as const,
        error: error instanceof DvalaError ? error : new DvalaError(`${error}`, undefined),
        k,
      }),
    )
  }
  return { type: 'Value', value: result, k }
}

/** Lazy-load collection utilities to avoid circular imports. */
function getCollectionUtils(): { asColl: (v: Any, s?: SourceCodeInfo) => Any; isSeq: (v: Any) => boolean } {
  return {
    asColl: (v: Any, s?: SourceCodeInfo) => {
      if (typeof v === 'string' || Array.isArray(v) || isObj(v)) {
        return v
      }
      throw new DvalaError(`Expected collection, got ${valueToString(v)}`, s)
    },
    isSeq: (v: Any) => typeof v === 'string' || Array.isArray(v),
  }
}

// ---------------------------------------------------------------------------
// Trampoline loop — tick, runSyncTrampoline, runAsyncTrampoline
// ---------------------------------------------------------------------------

/**
 * Process one step of the trampoline. Returns the next step, or a
 * Promise<Step> when an async operation (e.g., native JS function) is
 * encountered.
 *
 * - `Value` with empty `k`: the program is done (terminal state).
 * - `Value` with non-empty `k`: pop the top frame and apply it.
 * - `Eval`: evaluate an AST node via `stepNode` (always synchronous).
 * - `Apply`: apply a frame to a value (may return Promise<Step>).
 * - `Perform`: effect dispatch — local (try/with) first, then host handlers.
 *
 * When `handlers` and `signal` are provided (from `run()`), host handlers are
 * available as a fallback for effects not matched by any local `try/with`.
 */
export function tick(step: Step, handlers?: Handlers, signal?: AbortSignal, snapshotState?: SnapshotState): Step | Promise<Step> {
  try {
    switch (step.type) {
      case 'Value': {
        if (step.k.length === 0) {
          return step // Terminal state — program is complete
        }
        const [frame, ...rest] = step.k
        return applyFrame(frame!, step.value, rest)
      }
      case 'Eval':
        return stepNode(step.node, step.env, step.k)
      case 'Apply':
        return applyFrame(step.frame, step.value, step.k)
      case 'Perform':
        return dispatchPerform(step.effect, step.arg, step.k, step.sourceCodeInfo, handlers, signal, snapshotState, step.skipCheckpointCapture)
      case 'Parallel':
        return executeParallelBranches(step.branches, step.env, step.k, handlers, signal)
      case 'Race':
        return executeRaceBranches(step.branches, step.env, step.k, handlers, signal)
      case 'ParallelResume':
        return handleParallelResume(step, handlers, signal)
      case 'Error': {
        const effectStep = tryDispatchDvalaError(step.error, step.k)
        if (effectStep) {
          return effectStep
        }

        throw step.error
      }
    }
  } catch (error) {
    // SuspensionSignal and HaltSignal must propagate out of tick to the effect trampoline loop
    // (runEffectLoop).
    if (isSuspensionSignal(error) || isHaltSignal(error)) {

      throw error
    }
    // Route DvalaError through the 'dvala.error' algebraic effect so that
    // do...with handlers can intercept runtime errors.
    if (error instanceof DvalaError) {
      // For Value steps, step.k[0] is the frame that was being applied when
      // the error was thrown (e.g. LetDestructFrame, etc.).
      // Strip it so that resumeK in tryDispatchDvalaError does not include
      // the failing frame — otherwise the handler's return value would flow
      // back through it, potentially re-triggering the same error in an
      // infinite loop.
      // For Eval/Apply steps, step.k already excludes the frame that caused
      // the error, so no stripping is needed.
      const kForDispatch = step.type === 'Value'
        ? step.k.slice(1)
        : step.k
      const effectStep = tryDispatchDvalaError(error, kForDispatch)
      if (effectStep) return effectStep
    }
    // No handler matched — re-throw the error as a JS exception.
    throw error
  }
}

/**
 * Run the trampoline synchronously to completion.
 * Throws if any step produces a Promise (i.e., an async operation was
 * encountered in a synchronous context).
 */
export function runSyncTrampoline(initial: Step, effectHandlers?: Handlers): Any {
  let step: Step | Promise<Step> = initial
  for (;;) {
    if (step instanceof Promise) {
      throw new DvalaError('Unexpected async operation in synchronous context.', undefined)
    }
    if (step.type === 'Value' && step.k.length === 0) {
      return step.value
    }
    step = tick(step, effectHandlers)
  }
}

/**
 * Run the trampoline asynchronously to completion.
 * Awaits any Promise<Step> that surfaces from async operations.
 */
export async function runAsyncTrampoline(initial: Step): Promise<Any> {
  let step: Step | Promise<Step> = initial
  for (;;) {
    if (step instanceof Promise) {
      step = await step
    }
    if (step.type === 'Value' && step.k.length === 0) {
      return step.value
    }
    step = tick(step)
  }
}

// ---------------------------------------------------------------------------
// Public entry points — evaluate an AST or a single node
// ---------------------------------------------------------------------------

/**
 * Build the initial Step for evaluating an AST (sequence of top-level nodes).
 */
function buildInitialStep(nodes: AstNode[], env: ContextStack): Step {
  if (nodes.length === 0) {
    return { type: 'Value', value: null, k: [] }
  }
  if (nodes.length === 1) {
    return { type: 'Eval', node: nodes[0]!, env, k: [] }
  }
  const sequenceFrame: SequenceFrame = {
    type: 'Sequence',
    nodes,
    index: 1,
    env,
  }
  return { type: 'Eval', node: nodes[0]!, env, k: [sequenceFrame] }
}

/**
 * Evaluate an AST using the trampoline.
 * Returns the final value synchronously, or a Promise if async operations
 * are involved (e.g., native JS functions returning Promises).
 */
export function evaluate(ast: Ast, contextStack: ContextStack): MaybePromise<Any> {
  const initial = buildInitialStep(ast.body, contextStack)
  // Try synchronous first; if a Promise surfaces, switch to async
  try {
    return runSyncTrampoline(initial)
  } catch (error) {
    if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
      // An async operation was encountered — re-run with the async trampoline.
      // We must rebuild the initial step since the sync attempt may have
      // partially mutated frames.
      const freshInitial = buildInitialStep(ast.body, contextStack)
      return runAsyncTrampoline(freshInitial)
    }
    throw error
  }
}

/**
 * Evaluate an AST using the async trampoline directly.
 * Use this when the caller knows that async operations may be involved
 * (e.g., from Dvala.async.run) to avoid the sync-first-then-retry pattern
 * which can cause side effects to be executed twice.
 */
export function evaluateAsync(ast: Ast, contextStack: ContextStack): Promise<Any> {
  const initial = buildInitialStep(ast.body, contextStack)
  return runAsyncTrampoline(initial)
}

/**
 * Evaluate a single AST node using the trampoline.
 * Used as the `evaluateNode` callback passed to `getUndefinedSymbols`
 * and other utilities.
 */
export function evaluateNode(node: AstNode, contextStack: ContextStack): MaybePromise<Any> {
  const initial: Step = { type: 'Eval', node, env: contextStack, k: [] }
  try {
    return runSyncTrampoline(initial)
  } catch (error) {
    if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
      const freshInitial: Step = { type: 'Eval', node, env: contextStack, k: [] }
      return runAsyncTrampoline(freshInitial)
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Effect trampoline — async loop with host handler support
// ---------------------------------------------------------------------------

/**
 * Evaluate an AST with full effect handler support.
 *
 * Uses the async trampoline loop, passing `handlers` and `signal` to `tick`
 * so that `dispatchPerform` can fall back to host handlers when no local
 * `try/with` matches.
 *
 * Always resolves — never rejects. All errors are captured in
 * `RunResult.error`. Suspension is signaled via `RunResult.suspended`.
 *
 * The `AbortController` is created internally per `run()` call. The signal
 * is passed to every host handler. Used for `race()` cancellation (Phase 6)
 * and host-side timeouts.
 */
export async function evaluateWithEffects(
  ast: Ast,
  contextStack: ContextStack,
  handlers?: Handlers,
  maxSnapshots?: number,
  deserializeOptions?: DeserializeOptions,
  autoCheckpoint?: boolean,
  terminalSnapshot?: boolean,
): Promise<RunResult> {
  const abortController = new AbortController()
  const signal = abortController.signal
  const initial = buildInitialStep(ast.body, contextStack)

  return runEffectLoop(initial, handlers, signal, undefined, maxSnapshots, deserializeOptions, autoCheckpoint, terminalSnapshot)
}

/**
 * Evaluate an AST synchronously with effect handler support.
 *
 * Uses the sync trampoline with `effectHandlers` threaded through `tick`.
 * Throws if an async operation is encountered (e.g., an async handler
 * is used). Handlers may call `resume(value)`, `fail(msg?)`, or `next()`.
 * Calling `suspend()` will throw a runtime error.
 */
export function evaluateWithSyncEffects(
  ast: Ast,
  contextStack: ContextStack,
  effectHandlers?: Handlers,
): Any {
  const initial = buildInitialStep(ast.body, contextStack)
  try {
    return runSyncTrampoline(initial, effectHandlers)
  } catch (error) {
    if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
      const freshInitial = buildInitialStep(ast.body, contextStack)
      return runSyncTrampoline(freshInitial, effectHandlers)
    }
    throw error
  }
}

/**
 * Resume a suspended continuation with a value.
 *
 * Re-enters the trampoline with `{ type: 'Value', value, k }` where `k` is
 * the deserialized continuation stack. Host handlers and signal are provided
 * fresh for this run.
 */
export async function resumeWithEffects(
  k: ContinuationStack,
  value: Any,
  handlers?: Handlers,
  initialSnapshotState?: { snapshots: Snapshot[]; nextSnapshotIndex: number; maxSnapshots?: number; autoCheckpoint?: boolean },
  deserializeOptions?: DeserializeOptions,
): Promise<RunResult> {
  const abortController = new AbortController()
  const signal = abortController.signal
  const initial: Step = { type: 'Value', value, k }

  return runEffectLoop(initial, handlers, signal, initialSnapshotState, initialSnapshotState?.maxSnapshots, deserializeOptions, initialSnapshotState?.autoCheckpoint)
}

/**
 * Re-trigger the effect from a suspended snapshot.
 *
 * Deserializes the continuation from `snapshot` and re-dispatches the
 * original effect (captured in `snapshot.effectName` / `snapshot.effectArg`)
 * to the registered host handlers. The handler then calls `resume(value)`,
 * `fail()`, or `suspend()` as normal.
 *
 * Throws if the snapshot has no captured effect (e.g. suspended from a
 * parallel/race branch rather than an effect handler).
 */
/**
 * Dispatch all parallel-suspended branches concurrently when retriggering.
 *
 * Called from `retriggerWithEffects` when the top of the continuation is a
 * `ParallelResumeFrame`. Instead of exposing branches one at a time, all
 * remaining suspended branches (plus the current one) are dispatched to
 * host handlers simultaneously — mirroring the original parallel execution.
 */
async function retriggerParallelGroup(
  frame: ParallelResumeFrame,
  outerK: ContinuationStack,
  currentEffectName: string,
  currentEffectArgs: Any,
  handlers: Handlers | undefined,
  signal: AbortSignal,
  snapshotState: SnapshotState,
  deserializeOptions: DeserializeOptions | undefined,
): Promise<RunResult> {
  const { branchCount, completedBranches, suspendedBranches } = frame

  // Determine index of the current branch (not in completed or remaining-suspended)
  const completedIndices = new Set(completedBranches.map(b => b.index))
  const suspendedIndices = new Set(suspendedBranches.map(b => b.index))
  let currentBranchIndex = -1
  for (let i = 0; i < branchCount; i++) {
    if (!completedIndices.has(i) && !suspendedIndices.has(i)) {
      currentBranchIndex = i
      break
    }
  }

  const parallelAbort = new AbortController()
  const effectSignal = combineSignals(signal, parallelAbort.signal)

  type BranchOutcome = { index: number; result: RunResult }

  // Dispatch the current branch with an empty inner continuation —
  // the resume value IS the branch's completed value.
  const currentMatchingHandlers = findMatchingHandlers(currentEffectName, handlers)
  const currentBranchPromise: Promise<BranchOutcome> = (async () => {
    let firstStep: Step
    try {
      firstStep = await Promise.resolve(
        dispatchHostHandler(currentEffectName, currentMatchingHandlers, currentEffectArgs as Arr, [], effectSignal, undefined, snapshotState),
      )
    } catch (error) {
      if (isSuspensionSignal(error)) {
        parallelAbort.abort()
        const continuation = serializeSuspensionBlob(error.k, error.snapshots, error.nextSnapshotIndex, error.meta)
        const snapshot = createSnapshot({
          continuation,
          timestamp: Date.now(),
          index: snapshotState.nextSnapshotIndex++,
          executionId: snapshotState.executionId,
          message: SUSPENDED_MESSAGE,
          meta: error.meta,
          effectName: error.effectName,
          effectArg: error.effectArg,
        })
        return { index: currentBranchIndex, result: { type: 'suspended', snapshot } }
      }
      if (isHaltSignal(error)) {
        parallelAbort.abort()
        return { index: currentBranchIndex, result: { type: 'halted', value: error.value } }
      }
      const err = error instanceof DvalaError ? error : new DvalaError(`${error}`, undefined)
      return { index: currentBranchIndex, result: { type: 'error', error: err } }
    }
    const result = await runEffectLoop(firstStep, handlers, effectSignal, snapshotState, undefined, deserializeOptions)
    if (result.type === 'suspended' || result.type === 'halted')
      parallelAbort.abort()
    return { index: currentBranchIndex, result }
  })()

  // Dispatch each remaining suspended branch concurrently via retriggerWithEffects
  const otherBranchPromises: Promise<BranchOutcome>[] = suspendedBranches.map(async branch => {
    const { effectName: branchEffectName, effectArg: branchEffectArg } = branch.snapshot
    if (!branchEffectName || branchEffectArg === undefined) {
      return { index: branch.index, result: { type: 'suspended' as const, snapshot: branch.snapshot } }
    }
    const deserialized = deserializeFromObject(branch.snapshot.continuation, deserializeOptions)
    const result = await retriggerWithEffects(
      deserialized.k,
      branchEffectName,
      branchEffectArg,
      handlers,
      { snapshots: deserialized.snapshots, nextSnapshotIndex: deserialized.nextSnapshotIndex },
      deserializeOptions,
      effectSignal,
    )
    if (result.type === 'suspended')
      parallelAbort.abort()
    return { index: branch.index, result }
  })

  const settled = await Promise.allSettled([currentBranchPromise, ...otherBranchPromises])

  const newCompleted = [...completedBranches]
  const newSuspended: { index: number; snapshot: Snapshot }[] = []
  const errors: DvalaError[] = []

  for (const s of settled) {
    if (s.status === 'rejected') {
      errors.push(new DvalaError(`${s.reason}`, undefined))
    } else {
      const { index, result } = s.value
      if (result.type === 'completed')
        newCompleted.push({ index, value: result.value })
      else if (result.type === 'suspended')
        newSuspended.push({ index, snapshot: result.snapshot })
      else if (result.type === 'halted')
        return result
      else
        errors.push(result.error)
    }
  }

  if (errors.length > 0)
    return { type: 'error', error: errors[0]! }

  if (newSuspended.length > 0) {
    // Build a new snapshot exposing the first remaining suspended branch
    const firstSuspended = newSuspended[0]!
    const newFrame: ParallelResumeFrame = {
      type: 'ParallelResume',
      branchCount,
      completedBranches: newCompleted,
      suspendedBranches: newSuspended.slice(1),
    }
    const resumeK: ContinuationStack = [newFrame, ...outerK]
    const continuation = serializeSuspensionBlob(resumeK, snapshotState.snapshots, snapshotState.nextSnapshotIndex, firstSuspended.snapshot.meta)
    const snapshot = createSnapshot({
      continuation,
      timestamp: Date.now(),
      index: snapshotState.nextSnapshotIndex++,
      executionId: snapshotState.executionId,
      message: SUSPENDED_MESSAGE,
      meta: firstSuspended.snapshot.meta,
      effectName: firstSuspended.snapshot.effectName,
      effectArg: firstSuspended.snapshot.effectArg,
    })
    return { type: 'suspended', snapshot }
  }

  // All branches complete — assemble result and continue with outer continuation
  const resultArray: Any[] = Array.from({ length: branchCount })
  for (const { index, value } of newCompleted) {
    resultArray[index] = value
  }

  return runEffectLoop(
    { type: 'Value', value: resultArray, k: outerK },
    handlers,
    signal,
    snapshotState,
    undefined,
    deserializeOptions,
  )
}

export async function retriggerWithEffects(
  k: ContinuationStack,
  effectName: string,
  effectArg: Any,
  handlers?: Handlers,
  initialSnapshotState?: { snapshots: Snapshot[]; nextSnapshotIndex: number; maxSnapshots?: number; autoCheckpoint?: boolean },
  deserializeOptions?: DeserializeOptions,
  outerSignal?: AbortSignal,
): Promise<RunResult> {
  const abortController = new AbortController()
  const signal = outerSignal
    ? combineSignals(outerSignal, abortController.signal)
    : abortController.signal

  const snapshotState: SnapshotState = {
    snapshots: initialSnapshotState?.snapshots ?? [],
    nextSnapshotIndex: initialSnapshotState?.nextSnapshotIndex ?? 0,
    executionId: generateUUID(),
    maxSnapshots: initialSnapshotState?.maxSnapshots,
    autoCheckpoint: initialSnapshotState?.autoCheckpoint,
  }

  // When the continuation starts with a ParallelResumeFrame, dispatch all
  // remaining suspended branches concurrently rather than one at a time.
  if (k.length > 0 && k[0]!.type === 'ParallelResume') {
    return retriggerParallelGroup(
      k[0],
      k.slice(1),
      effectName,
      effectArg,
      handlers,
      signal,
      snapshotState,
      deserializeOptions,
    )
  }

  const matchingHandlers = findMatchingHandlers(effectName, handlers)

  let firstStep: Step
  try {
    firstStep = await Promise.resolve(
      dispatchHostHandler(effectName, matchingHandlers, effectArg as Arr, k, signal, undefined, snapshotState),
    )
  } catch (error) {
    // Handler called suspend() — capture continuation and return suspended result
    if (isSuspensionSignal(error)) {
      const continuation = serializeSuspensionBlob(
        error.k,
        error.snapshots,
        error.nextSnapshotIndex,
        error.meta,
      )
      const snapshot = createSnapshot({
        continuation,
        timestamp: Date.now(),
        index: snapshotState.nextSnapshotIndex++,
        executionId: snapshotState.executionId,
        message: SUSPENDED_MESSAGE,
        meta: error.meta,
        effectName: error.effectName,
        effectArg: error.effectArg,
      })
      return { type: 'suspended', snapshot }
    }
    // Handler called halt() — return halted result
    if (isHaltSignal(error)) {
      return { type: 'halted', value: error.value }
    }
    if (error instanceof DvalaError)
      return { type: 'error', error }
    return { type: 'error', error: new DvalaError(`${error}`, undefined) }
  }

  return runEffectLoop(firstStep, handlers, signal, snapshotState, snapshotState.maxSnapshots, deserializeOptions, snapshotState.autoCheckpoint)
}

/**
 * Shared effect trampoline loop used by both `evaluateWithEffects` and
 * `resumeWithEffects`. Runs the trampoline to completion, suspension, or error.
 *
 * When `handlers` includes a `dvala.debug.step` handler, the loop enters
 * debug mode: before evaluating compound nodes (NormalExpression,
 * SpecialExpression) that have source code info, a `DebugStepFrame` is
 * pushed onto the continuation stack. This causes each compound expression
 * to fire a `perform(dvala.debug.step, stepInfo)` after evaluation,
 * enabling the time-travel debugger.
 */
async function runEffectLoop(
  initial: Step,
  handlers: Handlers | undefined,
  signal: AbortSignal,
  initialSnapshotState?: { snapshots: Snapshot[]; nextSnapshotIndex: number },
  maxSnapshots?: number,
  deserializeOptions?: DeserializeOptions,
  autoCheckpoint?: boolean,
  terminalSnapshot?: boolean,
): Promise<RunResult> {
  const debugMode = Array.isArray(handlers) && handlers.some(h => h.pattern === 'dvala.debug.step')
  const snapshotState: SnapshotState = {
    snapshots: initialSnapshotState ? initialSnapshotState.snapshots : [],
    nextSnapshotIndex: initialSnapshotState ? initialSnapshotState.nextSnapshotIndex : 0,
    executionId: generateUUID(),
    ...(maxSnapshots !== undefined ? { maxSnapshots } : {}),
    ...(autoCheckpoint ? { autoCheckpoint } : {}),
    ...(terminalSnapshot ? { terminalSnapshot } : {}),
  }

  let step: Step | Promise<Step> = initial

  // Helper to create a terminal snapshot for completed/error/halted states
  function createTerminalSnapshot(options?: { error?: DvalaError; result?: Any; halted?: boolean }): Snapshot | undefined {
    if (!snapshotState.autoCheckpoint && !snapshotState.terminalSnapshot) {
      return undefined
    }
    const continuation = serializeTerminalSnapshot(
      snapshotState.snapshots,
      snapshotState.nextSnapshotIndex,
    )
    const meta: Record<string, unknown> = {}
    if (options?.error) {
      meta.error = options.error.toJSON()
    }
    if (options?.halted) {
      meta.halted = true
    }
    if (options?.result !== undefined) {
      meta.result = options.result
    }
    const message = options?.error
      ? 'Run failed with error'
      : options?.halted
        ? 'Program halted'
        : 'Run completed successfully'
    return createSnapshot({
      continuation,
      timestamp: Date.now(),
      index: snapshotState.nextSnapshotIndex,
      executionId: snapshotState.executionId,
      message,
      terminal: true,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    })
  }

  for (;;) {
    try {
      for (;;) {
        if (step instanceof Promise) {
          step = await step
        }
        if (step.type === 'Value' && step.k.length === 0) {
          const snapshot = createTerminalSnapshot({ result: step.value })
          return snapshot
            ? { type: 'completed', value: step.value, snapshot }
            : { type: 'completed', value: step.value }
        }

        // Debug mode: inject DebugStepFrame for compound nodes with source info
        if (debugMode && step.type === 'Eval' && step.node[2]) {
          const nodeType = step.node[0]
          if (nodeType === NodeTypes.NormalExpression || nodeType === NodeTypes.SpecialExpression) {
            const debugFrame: DebugStepFrame = {
              type: 'DebugStep',
              phase: 'awaitValue',
              sourceCodeInfo: step.node[2],
              env: step.env,
            }
            step = { ...step, k: [debugFrame, ...step.k] }
          }
        }

        step = tick(step, handlers, signal, snapshotState)
      }
    } catch (error) {
      if (isResumeFromSignal(error)) {
        const { k: restoredK } = deserializeFromObject(error.continuation as Record<string, unknown>, deserializeOptions)
        // Discard all snapshots with index > trimToIndex
        const cutIdx = snapshotState.snapshots.findIndex(s => s.index > error.trimToIndex)
        if (cutIdx !== -1) {
          snapshotState.snapshots.splice(cutIdx)
        }
        // Re-enter the loop with the restored continuation — nextSnapshotIndex is NOT reset
        step = { type: 'Value', value: error.value, k: restoredK }
        continue
      }
      if (isSuspensionSignal(error)) {
        const continuation = serializeSuspensionBlob(
          error.k,
          error.snapshots,
          error.nextSnapshotIndex,
          error.meta,
        )
        const snapshot = createSnapshot({
          continuation,
          timestamp: Date.now(),
          index: snapshotState.nextSnapshotIndex++,
          executionId: snapshotState.executionId,
          message: SUSPENDED_MESSAGE,
          meta: error.meta,
          effectName: error.effectName,
          effectArg: error.effectArg,
        })
        return { type: 'suspended', snapshot }
      }
      if (isHaltSignal(error)) {
        const snapshot = createTerminalSnapshot({ result: error.value, halted: true })
        return snapshot
          ? { type: 'halted', value: error.value, snapshot }
          : { type: 'halted', value: error.value }
      }
      if (error instanceof DvalaError) {
        const snapshot = createTerminalSnapshot({ error })
        return snapshot
          ? { type: 'error', error, snapshot }
          : { type: 'error', error }
      }
      const snapshot = createTerminalSnapshot()
      const dvalaError = new DvalaError(`${error}`, undefined)
      return snapshot
        ? { type: 'error', error: dvalaError, snapshot }
        : { type: 'error', error: dvalaError }
    }
  }
}
