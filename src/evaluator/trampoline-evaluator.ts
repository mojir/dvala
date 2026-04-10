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
import { MAX_MACRO_EXPANSION_DEPTH, NodeTypes } from '../constants/constants'
import { ArithmeticError, AssertionError, DvalaError, MacroError, ReferenceError, RuntimeError, TypeError, UserError } from '../errors'
import { reconstructCallStack } from './callStack'
import { getUndefinedSymbols } from '../getUndefinedSymbols'
import type { Any, Arr, Obj } from '../interface'
import { parse, parseToAst } from '../parser'
import type {
  Ast,
  AstNode,
  BindingTarget,
  DvalaFunction,
  EffectRef,
  HandlerClause,
  HandlerFunction,
  MacroFunction,
  EvaluatedFunction,
  FunctionLike,
  ResumeFunction,
  NormalExpressionNode,
  NumberNode,
  PartialFunction,
  ReservedNode,
  SourceMap,
  SpecialExpressionNode,
  SpreadNode,
  StringNode,
  SymbolNode,
  TemplateStringNode,
  UserDefinedFunction,
} from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { reservedSymbolRecord } from '../tokenizer/reservedNames'
import type { SourceCodeInfo } from '../tokenizer/token'
import { tokenize } from '../tokenizer/tokenize'
import { asNonUndefined } from '../typeGuards'
import { isBuiltinSymbolNode, isNormalExpressionNodeWithName, isSpreadNode, isUserDefinedSymbolNode } from '../typeGuards/astNode'
import { asAny, asFunctionLike, assertEffect, assertSeq, isAny, isEffect, isObj } from '../typeGuards/dvala'
import { cons, isPersistentVector, listDrop, listFromArray, listSize, listTake, listPrependAll, listToArray, PersistentVector, PersistentMap } from '../utils/persistent'
import { isDvalaFunction, isHandlerFunction, isMacroFunction, isUserDefinedFunction } from '../typeGuards/dvalaFunction'
import { assertNumber, isNumber } from '../typeGuards/number'
import { assertString } from '../typeGuards/string'
import { deepEqual, toAny } from '../utils'
import { arityAcceptsMin, assertNumberOfParams, toFixedArity } from '../utils/arity'
import { valueToString } from '../utils/debug/debugTools'
import { fromJS, toJS } from '../utils/interop'
import type { MaybePromise } from '../utils/maybePromise'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import type { EffectContext, EffectHandler, Handlers, RunResult, Snapshot, SnapshotState } from './effectTypes'
import { HaltSignal, ResumeFromSignal, SUSPENDED_MESSAGE, SuspensionSignal, createSnapshot, qualifiedNameMatchesPattern, findMatchingHandlers, generateUUID, isHaltSignal, isResumeFromSignal, isSuspensionSignal } from './effectTypes'
import type { ContextStack } from './ContextStack'
import { getEffectRef } from './effectRef'
import type { DeserializeOptions } from './suspension'
import { deserializeFromObject, serializeSuspensionBlob, serializeTerminalSnapshot, serializeToObject } from './suspension'
import { getStandardEffectHandler } from './standardEffects'
import type {
  AlgebraicHandleFrame,
  AndFrame,
  ArrayBuildFrame,
  BindingSlotContext,
  BindingSlotFrame,
  CallFnFrame,
  ComplementFrame,
  CompFrame,
  ContinuationStack,
  EvalArgsFrame,
  EveryPredFrame,
  FnArgBindFrame,
  FnArgSlotCompleteFrame,
  FnBodyFrame,
  FnRestArgCompleteFrame,
  ForElementBindCompleteFrame,
  ForLetBindFrame,
  ForLoopFrame,
  Frame,
  HandlerClauseFrame,
  HandlerTransformFrame,
  ResumeCallFrame,
  WithHandlerSetupFrame,
  IfBranchFrame,
  FileResolveFrame,
  ImportMergeFrame,
  JuxtFrame,
  LetBindCompleteFrame,
  LetBindFrame,
  LoopBindCompleteFrame,
  LoopBindFrame,
  LoopIterateFrame,
  CodeTemplateBuildFrame,
  MacroEvalFrame,
  MatchFrame,
  MatchSlotContext,
  MatchSlotFrame,
  FiniteCheckFrame,
  ObjectBuildFrame,
  OrFrame,
  ParallelBranchBarrierFrame,
  ParallelBranchContext,
  ParallelResumeFrame,
  PerformArgsFrame,
  QqFrame,
  RecurFrame,
  RecurLoopRebindFrame,
  SequenceFrame,
  SomePredFrame,
  TemplateStringBuildFrame,
} from './frames'
import type { Context } from './interface'
import type { Step } from './step'

// Re-export for external use
export type { Step }

// ---------------------------------------------------------------------------
// Value-as-function helpers
// ---------------------------------------------------------------------------

function evaluateObjectAsFunction(fn: Obj, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.size !== 1)
    throw new TypeError('Object as function requires one string parameter.', sourceCodeInfo)
  const key = params.get(0)
  assertString(key, sourceCodeInfo)
  return toAny(fn.get(key))
}

function evaluateArrayAsFunction(fn: Arr, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.size !== 1)
    throw new TypeError('Array as function requires one non negative integer parameter.', sourceCodeInfo)
  const index = params.get(0)
  assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })
  return toAny(fn.get(index))
}

function evaluateStringAsFunction(fn: string, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  if (params.size !== 1)
    throw new TypeError('String as function requires one Obj parameter.', sourceCodeInfo)
  const param = toAny(params.get(0))
  if (isObj(param))
    return toAny((param).get(fn))
  if (isNumber(param, { integer: true }))
    return toAny(fn[param])
  throw new TypeError(
    `string as function expects Obj or integer parameter, got ${valueToString(param)}`,
    sourceCodeInfo,
  )
}

function evaluateNumberAsFunction(fn: number, params: Arr, sourceCodeInfo?: SourceCodeInfo): Any {
  assertNumber(fn, undefined, { integer: true })
  if (params.size !== 1)
    throw new TypeError('Number as function requires one Arr parameter.', sourceCodeInfo)
  const param = params.get(0)
  assertSeq(param, sourceCodeInfo)
  return toAny(typeof param === 'string' ? param[fn] : param.get(fn))
}

// ---------------------------------------------------------------------------
// Reserved symbol evaluation
// ---------------------------------------------------------------------------

function evaluateReservedSymbol(node: ReservedNode, env: ContextStack): Any {
  const reservedName = node[1]
  if (!['true', 'false', 'null'].includes(reservedName)) {
    throw new TypeError(`Reserved symbol ${reservedName} cannot be evaluated`, env.resolve(node[2]))
  }
  const value = reservedSymbolRecord[reservedName]
  return asNonUndefined(value, env.resolve(node[2]))
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
    case NodeTypes.Num:
      return { type: 'Value', value: (node as NumberNode)[1], k }
    case NodeTypes.Str:
      return { type: 'Value', value: (node as StringNode)[1], k }
    case NodeTypes.Builtin:
    case NodeTypes.Special:
    case NodeTypes.Sym:
      return { type: 'Value', value: env.evaluateSymbol(node as SymbolNode), k }
    case NodeTypes.Reserved:
      return { type: 'Value', value: evaluateReservedSymbol(node as ReservedNode, env), k }
    case NodeTypes.Call:
      return stepNormalExpression(node as NormalExpressionNode, env, k)
    case NodeTypes.MacroCall: {
      // #name expr — prefix macro call, restricted to macros only
      const [fnNode, argNodes] = node[1] as [AstNode, AstNode[]]
      const sourceCodeInfo = env.resolve(node[2])
      const callee = env.evaluateSymbol(fnNode as SymbolNode)
      if (!isMacroFunction(callee)) {
        throw new TypeError(`# prefix requires a macro, but '${fnNode[1] as string}' is not a macro`, sourceCodeInfo)
      }
      return callMacro(callee, argNodes, env, sourceCodeInfo, k)
    }
    case NodeTypes.If: {
      const [conditionNode, thenNode, elseNode] = node[1] as [AstNode, AstNode, AstNode?]
      const frame: IfBranchFrame = {
        type: 'IfBranch',
        thenNode,
        elseNode,
        env,
        sourceCodeInfo: env.resolve(node[2]),
      }
      return { type: 'Eval', node: conditionNode, env, k: cons(frame, k) }
    }
    case NodeTypes.Block: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
      const newContext: Context = {}
      const newEnv = env.create(newContext)
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
      return { type: 'Eval', node: nodes[0]!, env: newEnv, k: cons(frame, k) }
    }
    case NodeTypes.Effect:
      return { type: 'Value', value: getEffectRef(node[1] as string), k }
    case NodeTypes.Recur: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
      if (nodes.length === 0) {
        return handleRecur(PersistentVector.empty(), k, sourceCodeInfo)
      }
      const frame: RecurFrame = {
        type: 'Recur',
        nodes,
        index: 1,
        params: PersistentVector.empty(),
        env,
        sourceCodeInfo,
      }
      if (nodes.length === 1) {
        // Only one param — evaluate it, then recur
        const singleFrame: RecurFrame = { ...frame, index: 1 }
        return { type: 'Eval', node: nodes[0]!, env, k: cons(singleFrame, k) }
      }
      return { type: 'Eval', node: nodes[0]!, env, k: cons(frame, k) }
    }
    case NodeTypes.Array: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
      if (nodes.length === 0) {
        return { type: 'Value', value: PersistentVector.empty(), k }
      }
      const firstNode = nodes[0]!
      const isFirstSpread = isSpreadNode(firstNode)
      const frame: ArrayBuildFrame = {
        type: 'ArrayBuild',
        nodes,
        index: 0,
        result: PersistentVector.empty(),
        isSpread: isFirstSpread,
        env,
        sourceCodeInfo,
      }
      return {
        type: 'Eval',
        node: isFirstSpread ? firstNode[1] : firstNode,
        env,
        k: cons(frame, k),
      }
    }
    case NodeTypes.Parallel: {
      const branches = node[1] as AstNode[]
      return { type: 'Parallel', branches, env, k }
    }
    case NodeTypes.Race: {
      const branches = node[1] as AstNode[]
      return { type: 'Race', branches, env, k }
    }
    case NodeTypes.Perform: {
      const [effectExpr, payloadExpr] = node[1] as [AstNode, AstNode | undefined]
      const sourceCodeInfo = env.resolve(node[2])
      const allNodes = payloadExpr ? [effectExpr, payloadExpr] : [effectExpr]
      const frame: PerformArgsFrame = {
        type: 'PerformArgs',
        argNodes: allNodes,
        index: 1,
        params: PersistentVector.empty(),
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: allNodes[0]!, env, k: cons(frame, k) }
    }
    case NodeTypes.Let: {
      const [target, valueNode] = node[1] as [BindingTarget, AstNode]
      const sourceCodeInfo = env.resolve(node[2])
      const frame: LetBindFrame = {
        type: 'LetBind',
        target,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: valueNode, env, k: cons(frame, k) }
    }
    case NodeTypes.Function: {
      const fn = node[1] as [BindingTarget[], AstNode[], ...unknown[]]
      const evaluatedFunc = evaluateFunction(fn, env)
      const min = evaluatedFunc[0].filter(arg => arg[0] !== bindingTargetTypes.rest && arg[1][1] === undefined).length
      const max = evaluatedFunc[0].some(arg => arg[0] === bindingTargetTypes.rest) ? undefined : evaluatedFunc[0].length
      const arity = { min: min > 0 ? min : undefined, max }
      const dvalaFunction: DvalaFunction = {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo: env.resolve(node[2]),
        functionType: 'UserDefined',
        name: undefined,
        evaluatedfunction: evaluatedFunc,
        arity,
        docString: '',
      }
      return { type: 'Value', value: dvalaFunction, k }
    }
    case NodeTypes.Macro: {
      const fn = node[1] as [BindingTarget[], AstNode[], string | null]
      const qualifiedName = fn[2] ?? null
      const evaluatedFunc = evaluateFunction(fn, env)
      const min = evaluatedFunc[0].filter(arg => arg[0] !== bindingTargetTypes.rest && arg[1][1] === undefined).length
      const max = evaluatedFunc[0].some(arg => arg[0] === bindingTargetTypes.rest) ? undefined : evaluatedFunc[0].length
      const arity = { min: min > 0 ? min : undefined, max }
      const macroFunction: MacroFunction = {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo: env.resolve(node[2]),
        functionType: 'Macro',
        name: undefined,
        qualifiedName,
        evaluatedfunction: evaluatedFunc,
        arity,
        docString: '',
      }
      return { type: 'Value', value: macroFunction, k }
    }
    case NodeTypes.Handler: {
      // Create a first-class handler value from the handler...end expression.
      // Clauses and transform are stored as AST (evaluated lazily in clause scope).
      const [parsedClauses, transform, shallow] = node[1] as [
        { effectName: string; params: BindingTarget[]; body: AstNode[] }[],
        [BindingTarget, AstNode[]] | null,
        boolean,
      ]
      const clauses: HandlerClause[] = parsedClauses.map(c => ({
        effectName: c.effectName,
        params: c.params,
        body: c.body,
      }))
      const clauseMap = new Map<string, HandlerClause>()
      for (const clause of clauses) {
        clauseMap.set(clause.effectName, clause)
      }
      const handlerFunction: HandlerFunction = {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo: env.resolve(node[2]),
        functionType: 'Handler',
        clauses,
        clauseMap,
        transform,
        shallow: shallow ?? false,
        closureEnv: env,
        arity: { min: 1, max: 1 }, // h(-> body)
      }
      return { type: 'Value', value: handlerFunction, k }
    }
    case NodeTypes.WithHandler: {
      // `with h; body` — evaluate handler expression, then install and evaluate body.
      // NOT a desugaring to h(-> body) — no function boundary, preserves recur.
      const [handlerExpr, bodyExprs] = node[1] as [AstNode, AstNode[]]
      const sourceCodeInfo = env.resolve(node[2])
      const setupFrame: WithHandlerSetupFrame = {
        type: 'WithHandlerSetup',
        bodyExprs,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: handlerExpr, env, k: cons(setupFrame, k) }
    }
    case NodeTypes.Resume: {
      // resume(value), resume(), or bare resume reference.
      // Payload encoding: AstNode = call with arg, 'ref' = bare reference
      const payload = node[1] as AstNode | 'ref'
      const sourceCodeInfo = env.resolve(node[2])

      // Look up `resume` in current scope
      const resumeLookup = env.lookUpByName('resume')
      if (resumeLookup === null) {
        throw new RuntimeError('`resume` can only be used inside a handler clause', sourceCodeInfo)
      }
      const resumeFn = resumeLookup.value

      if (payload === 'ref') {
        // Bare resume — return the function value (first-class)
        return { type: 'Value', value: resumeFn, k }
      }

      // resume(value) or resume() — evaluate arg then call the resume function.
      const resumeCallFrame: ResumeCallFrame = {
        type: 'ResumeCall',
        resumeFn,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: payload, env, k: cons(resumeCallFrame, k) }
    }
    case NodeTypes.CodeTmpl: {
      const [bodyAst, spliceExprs] = node[1] as [AstNode[], AstNode[]]
      const sourceCodeInfo = env.resolve(node[2])
      // Build hygiene rename map for literal bindings
      const renameMap = buildRenameMap(bodyAst)
      // No splices — assemble immediately
      if (spliceExprs.length === 0) {
        const result = bodyAst.length === 1
          ? astToData(bodyAst[0]!, [], renameMap)
          : bodyAst.map(n => astToData(n, [], renameMap))
        return { type: 'Value', value: toAny(result), k }
      }
      // Evaluate first splice expression
      const frame: CodeTemplateBuildFrame = {
        type: 'CodeTemplateBuild',
        bodyAst,
        spliceExprs,
        index: 0,
        values: [],
        renameMap,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: spliceExprs[0]!, env, k: cons(frame, k) }
    }
    case NodeTypes.Object: {
      const entries = node[1] as (AstNode[] | AstNode)[]
      const sourceCodeInfo = env.resolve(node[2])
      if (entries.length === 0) {
        return { type: 'Value', value: PersistentMap.empty(), k }
      }
      const firstEntry = entries[0]!
      const isFirstSpread = isSpreadNode(firstEntry as AstNode)
      const frame: ObjectBuildFrame = {
        type: 'ObjectBuild',
        entries,
        index: 0,
        result: PersistentMap.empty(),
        currentKey: null,
        isSpread: isFirstSpread,
        env,
        sourceCodeInfo,
      }
      return {
        type: 'Eval',
        node: isFirstSpread ? (firstEntry as SpreadNode)[1] : (firstEntry as [AstNode, AstNode])[0],
        env,
        k: cons(frame, k),
      }
    }
    case NodeTypes.And: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
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
      return { type: 'Eval', node: nodes[0]!, env, k: cons(frame, k) }
    }
    case NodeTypes.Or: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
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
      return { type: 'Eval', node: nodes[0]!, env, k: cons(frame, k) }
    }
    case NodeTypes.Qq: {
      const nodes = node[1] as AstNode[]
      const sourceCodeInfo = env.resolve(node[2])
      if (nodes.length === 0) {
        return { type: 'Value', value: null, k }
      }
      const firstNode = nodes[0]!
      if (nodes.length === 1) {
        return { type: 'Eval', node: firstNode, env, k }
      }
      const frame: QqFrame = {
        type: 'Qq',
        nodes,
        index: 1,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: firstNode, env, k: cons(frame, k) }
    }
    case NodeTypes.Match: {
      const [matchValueNode, cases] = node[1] as [AstNode, MatchCase[]]
      const sourceCodeInfo = env.resolve(node[2])
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
      return { type: 'Eval', node: matchValueNode, env, k: cons(frame, k) }
    }
    case NodeTypes.Loop: {
      const [bindings, body] = node[1] as [[BindingTarget, AstNode][], AstNode]
      const sourceCodeInfo = env.resolve(node[2])
      // Parser requires at least one binding — zero bindings is parser-prevented
      /* v8 ignore start */
      if (bindings.length === 0) {
        // No bindings — just evaluate the body with an empty context
        const newContext: Context = {}
        const frame: LoopIterateFrame = {
          type: 'LoopIterate',
          bindings,
          bindingContext: newContext,
          body,
          env: env.create(newContext),
          sourceCodeInfo,
        }
        return { type: 'Eval', node: body, env: env.create(newContext), k: cons(frame, k) }
      }
      /* v8 ignore stop */
      // Start evaluating the first binding's value
      const frame: LoopBindFrame = {
        type: 'LoopBind',
        phase: 'value',
        bindings,
        index: 0,
        context: {},
        body,
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: bindings[0]![1], env, k: cons(frame, k) }
    }
    case NodeTypes.For: {
      const [loopBindings, body] = node[1] as [LoopBindingNode[], AstNode]
      const sourceCodeInfo = env.resolve(node[2])
      // Parser requires at least one loop binding — zero bindings is parser-prevented
      /* v8 ignore next 3 */
      if (loopBindings.length === 0) {
        return { type: 'Value', value: PersistentVector.empty(), k }
      }
      const context: Context = {}
      const newEnv = env.create(context)
      const frame: ForLoopFrame = {
        type: 'ForLoop',
        bindingNodes: loopBindings,
        body,
        result: PersistentVector.empty(),
        phase: 'evalCollection',
        bindingLevel: 0,
        levelStates: [],
        context,
        env: newEnv,
        sourceCodeInfo,
      }
      // Evaluate the first binding's collection expression
      const firstBinding = loopBindings[0]!
      const collectionNode = firstBinding[0][1] // [target, valueNode] → valueNode
      return { type: 'Eval', node: collectionNode, env: newEnv, k: cons(frame, k) }
    }
    case NodeTypes.Import: {
      const moduleName = node[1] as string
      const sourceCodeInfo = env.resolve(node[2])
      // Check for value modules first (file modules from bundles, or cached file imports)
      const valueModule = env.getValueModule(moduleName)
      if (valueModule.found) {
        return { type: 'Value', value: valueModule.value as Any, k }
      }
      // File import — resolve at runtime via fileResolver
      const isFileImport = moduleName.startsWith('./') || moduleName.startsWith('../') || moduleName.startsWith('/')
      if (isFileImport) {
        if (!env.fileResolver) {
          throw new TypeError(`File imports require a file resolver. Cannot import '${moduleName}'`, sourceCodeInfo)
        }
        if (env.isResolvingFile(moduleName)) {
          throw new TypeError(`Circular import detected: '${moduleName}'`, sourceCodeInfo)
        }
        env.markFileResolving(moduleName)
        const source = env.fileResolver(moduleName, env.currentFileDir)
        // Resolve the absolute file path for source map tracking.
        // Note: this inline normalization assumes forward-slash paths (Unix/macOS).
        // The `path` module is intentionally not imported here for browser compatibility.
        const rawPath = moduleName.startsWith('/')
          ? moduleName
          : `${env.currentFileDir}/${moduleName}`
        // Normalize: resolve . and .. segments, collapse multiple slashes
        const parts = rawPath.split('/')
        const resolved: string[] = []
        for (const part of parts) {
          if (part === '' || part === '.') continue
          if (part === '..' && resolved.length > 0 && resolved[resolved.length - 1] !== '..') resolved.pop()
          else resolved.push(part)
        }
        const resolvedPath = (rawPath.startsWith('/') ? '/' : '') + resolved.join('/')
        const resolvedPathWithExt = resolvedPath.endsWith('.dvala') ? resolvedPath : `${resolvedPath}.dvala`
        // Use the shared allocateNodeId and debug flag from the context stack so that
        // runtime imports get unique nodeIds and source map entries for coverage tracking.
        const tokenStream = tokenize(source, env.debug, env.debug ? resolvedPathWithExt : undefined)
        const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
        const ast = env.allocateNodeId ? parseToAst(minified, env.allocateNodeId) : { body: parse(minified), sourceMap: undefined }
        // Merge the imported file's source map into the accumulated one
        if (ast.sourceMap && env.sourceMap) {
          const sourceOffset = env.sourceMap.sources.length
          env.sourceMap.sources.push(...ast.sourceMap.sources)
          for (const [nodeId, pos] of ast.sourceMap.positions) {
            env.sourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
          }
        }
        const fileNodes = ast.body
        // Create a new env with the imported file's directory as context
        const fileEnv = env.create({})
        // Compute the imported file's directory for nested imports
        const importedFileDir = moduleName.substring(0, moduleName.lastIndexOf('/')) || '.'
        const previousFileDir = env.currentFileDir
        // Set currentFileDir so nested imports resolve relative to the imported file
        fileEnv.currentFileDir = importedFileDir.startsWith('/')
          ? importedFileDir
          : `${env.currentFileDir}/${importedFileDir}`.replace(/\/\.\//g, '/').replace(/\/+/g, '/')
        // After evaluation, cache the result, restore dir, and unmark
        const resolveFrame: FileResolveFrame = { type: 'FileResolve', moduleName, previousFileDir, env }
        if (fileNodes.length === 1) {
          return { type: 'Eval', node: fileNodes[0]!, env: fileEnv, k: cons(resolveFrame, k) }
        }
        const sequenceFrame: SequenceFrame = { type: 'Sequence', nodes: fileNodes, index: 1, env: fileEnv }
        return { type: 'Eval', node: fileNodes[0]!, env: fileEnv, k: cons(sequenceFrame, cons(resolveFrame, k)) }
      }
      // Fall back to builtin modules
      const dvalaModule = env.getModule(moduleName)
      if (!dvalaModule) {
        throw new TypeError(`Unknown module: '${moduleName}'`, sourceCodeInfo)
      }
      let result: Obj = PersistentMap.empty()
      for (const [functionName, expression] of Object.entries(dvalaModule.functions)) {
        result = result.assoc(functionName, {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'Module',
          moduleName,
          functionName,
          arity: expression.arity,
        })
      }
      // Module source evaluation — initCoreDvalaSources pre-evaluates core module sources at startup
      // and modules with .source are resolved before reaching this trampoline path
      /* v8 ignore start */
      if (dvalaModule.source) {
        // Cache parsed nodes on the module to avoid re-parsing (which would allocate new node IDs)
        if (!dvalaModule._cachedNodes) {
          dvalaModule._cachedNodes = parse(minifyTokenStream(tokenize(dvalaModule.source, false, undefined), { removeWhiteSpace: true }))
        }
        const nodes = dvalaModule._cachedNodes
        const sourceEnv = env.create({})
        const mergeFrame: ImportMergeFrame = { type: 'ImportMerge', tsFunctions: result, moduleName, module: dvalaModule, env, sourceCodeInfo }
        if (nodes.length === 1) {
          return { type: 'Eval', node: nodes[0]!, env: sourceEnv, k: cons(mergeFrame, k) }
        }
        const sequenceFrame: SequenceFrame = { type: 'Sequence', nodes, index: 1, env: sourceEnv }
        return { type: 'Eval', node: nodes[0]!, env: sourceEnv, k: cons(sequenceFrame, cons(mergeFrame, k)) }
      }
      /* v8 ignore stop */
      env.registerValueModule(moduleName, result)
      return { type: 'Value', value: result, k }
    }
    case NodeTypes.SpecialExpression:
      return stepSpecialExpression(node as SpecialExpressionNode, env, k)
    case NodeTypes.TmplStr:
      return stepTemplateString(node as TemplateStringNode, env, k)
    // Effect nodes (from @name syntax) handled above with NodeTypes.Effect
    /* v8 ignore next 2 */
    default:
      throw new TypeError(`${node[0]}-node cannot be evaluated`, env.resolve(node[2]))
  }
}

// ---------------------------------------------------------------------------
// stepTemplateString — evaluate interpolated segments and concatenate
// ---------------------------------------------------------------------------

function stepTemplateString(node: TemplateStringNode, env: ContextStack, k: ContinuationStack): Step {
  const segments = node[1]
  const sourceCodeInfo = env.resolve(node[2])

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

  return { type: 'Eval', node: segments[0]!, env, k: cons(frame, k) }
}

// ---------------------------------------------------------------------------
// stepNormalExpression — start evaluating a function call's arguments
// ---------------------------------------------------------------------------

/**
 * Normal expressions: evaluate arguments left-to-right, then dispatch.
 * Push EvalArgsFrame + FiniteCheckFrame, then start evaluating the first arg.
 */
function stepNormalExpression(node: NormalExpressionNode, env: ContextStack, k: ContinuationStack): Step | Promise<Step> {
  const argNodes = node[1][1]
  const sourceCodeInfo = env.resolve(node[2])

  // --- Macro check ---
  // For named calls, resolve the callee first. If it's a macro, pass args as AST.
  // Check both user-defined and builtin symbols — builtins can be shadowed by macros.
  if (isNormalExpressionNodeWithName(node)) {
    const nameSymbol = node[1][0]
    if (isUserDefinedSymbolNode(nameSymbol) || isBuiltinSymbolNode(nameSymbol)) {
      const callee = env.evaluateSymbol(nameSymbol)
      if (isMacroFunction(callee)) {
        // Macro call: pass argument AST nodes directly (don't evaluate them)
        return callMacro(callee, argNodes, env, sourceCodeInfo, k)
      }
    }
  }

  // Finite-number guard wraps the final result
  const nanFrame: FiniteCheckFrame = { type: 'FiniteCheck', sourceCodeInfo }

  // Argument evaluator frame
  const evalArgsFrame: EvalArgsFrame = {
    type: 'EvalArgs',
    node,
    index: 0,
    params: PersistentVector.empty(),
    placeholders: [],
    env,
    sourceCodeInfo,
  }

  // Find the first real argument to evaluate (skip leading placeholders)
  let startIndex = 0
  while (startIndex < argNodes.length) {
    const arg = argNodes[startIndex]!
    if (arg[0] === NodeTypes.Reserved && arg[1] === '_') {
      evalArgsFrame.placeholders.push(evalArgsFrame.params.size)
      startIndex++
    } else {
      break
    }
  }
  evalArgsFrame.index = startIndex

  if (startIndex >= argNodes.length) {
    // No real args to evaluate — dispatch immediately
    return dispatchCall(evalArgsFrame, cons(nanFrame, k))
  }

  // Start evaluating the first real argument
  const firstArg = argNodes[startIndex]!
  const newK: ContinuationStack = cons(evalArgsFrame, cons(nanFrame, k))
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
/* v8 ignore next 4 */
function stepSpecialExpression(node: SpecialExpressionNode, env: ContextStack, _k: ContinuationStack): Step | Promise<Step> {
  const sourceCodeInfo = env.resolve(node[2])
  throw new RuntimeError(`Unknown special expression type: ${node[1][0]}`, sourceCodeInfo)
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
    if (isBuiltinSymbolNode(nameSymbol)) {
      const builtinName = nameSymbol[1]
      const normalExpression = builtin.normalExpressions[builtinName]!
      if (env.pure && normalExpression.pure === false) {
        throw new RuntimeError(`Cannot call impure function '${normalExpression.name}' in pure mode`, sourceCodeInfo)
      }
      // macroexpand(macroFn, ...args) — call macro body directly, return expanded AST as data
      if (builtinName === 'macroexpand') {
        const macroFn = params.get(0)
        if (!isMacroFunction(macroFn)) {
          throw new TypeError('macroexpand: first argument must be a macro', sourceCodeInfo)
        }
        const macroArgs = PersistentVector.from([...params].slice(1))
        // Call the macro's body as a regular function — no MacroEvalFrame, so the
        // expanded AST is returned as a value instead of being evaluated.
        return setupUserDefinedCall(
          macroFn as unknown as UserDefinedFunction,
          macroArgs,
          env,
          sourceCodeInfo,
          k,
        )
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
    throw new ReferenceError(nameSymbol[1], sourceCodeInfo)
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
    return { type: 'Eval', node: fnNode, env, k: cons(callFrame, k) }
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
  if (isPersistentVector(fn)) {
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
  throw new RuntimeError('Unexpected function type', sourceCodeInfo)
}

/**
 * Dispatch a DvalaFunction. User-defined functions are set up with frames;
 * some compound function types still use the recursive executor for iteration.
 */
function dispatchDvalaFunction(fn: DvalaFunction, params: Arr, env: ContextStack, sourceCodeInfo: SourceCodeInfo | undefined, k: ContinuationStack): Step | Promise<Step> {
  switch (fn.functionType) {
    case 'UserDefined':
    case 'Macro': {
      return setupUserDefinedCall(fn as UserDefinedFunction, params, env, sourceCodeInfo, k)
    }
    // Simple compound types: no recursion needed
    case 'Constantly': {
      // (constantly value) returns value regardless of params
      return { type: 'Value', value: fn.value, k }
    }
    case 'QualifiedMatcher': {
      // Generalized matcher — works on any entity with a qualified name (effects, named macros)
      assertNumberOfParams({ min: 1, max: 1 }, params.size, fn.sourceCodeInfo ?? sourceCodeInfo)
      const entity = params.get(0)
      // Extract qualified name from the entity
      let qName: string | null = null
      if (isEffect(entity)) {
        qName = entity.name
      } else if (isMacroFunction(entity)) {
        qName = entity.qualifiedName
      }
      if (qName === null) {
        return { type: 'Value', value: false, k }
      }
      if (fn.matchType === 'string') {
        return { type: 'Value', value: qualifiedNameMatchesPattern(qName, fn.pattern), k }
      }
      const regexp = new RegExp(fn.pattern, fn.flags)
      return { type: 'Value', value: regexp.test(qName), k }
    }
    case 'Handler': {
      // h(-> body) — install algebraic handler around the thunk body.
      // The single argument must be a function (thunk) — we call it with no args.
      assertNumberOfParams({ min: 1, max: 1 }, params.size, fn.sourceCodeInfo ?? sourceCodeInfo)
      const thunk = params.get(0)!
      const thunkFn = asFunctionLike(thunk, sourceCodeInfo)

      // Push AlgebraicHandleFrame, then evaluate the thunk body
      const handleFrame: AlgebraicHandleFrame = {
        type: 'AlgebraicHandle',
        handler: fn,
        env: fn.closureEnv as ContextStack,
        sourceCodeInfo,
      }
      // Call the thunk with no arguments, with the handler frame on the stack
      return dispatchFunction(thunkFn, PersistentVector.empty(), [], env, sourceCodeInfo, cons(handleFrame, k))
    }
    case 'Resume': {
      // resume(value) — reinstall the handler and continue execution from the perform site.
      // Multi-shot: resume may be called any number of times. Each call re-uses the
      // same immutable performK snapshot (a PersistentList) — no copying needed.
      const resumeValue = (params.size > 0 ? params.get(0)! : null) as Any
      const performK = fn.performK as ContinuationStack
      const handler = fn.handler

      // Strip the old AlgebraicHandleFrame from performK (it's always the last frame).
      const innerFrames = listTake(performK, listSize(performK) - 1)

      // Multi-shot: freshen envs so each resume fork gets independent _contexts[0].
      const freshInnerFrames = freshenContinuationEnvs(innerFrames)

      if (handler.shallow) {
        // Shallow handler: do NOT reinstall the handler around the continuation.
        // The continuation runs bare — subsequent effects propagate to outer handlers.
        // This enables state threading: @set installs run(newVal) around resume(null),
        // and since we don't reinstall the old handler, run(newVal) catches @get.
        const shallowK: ContinuationStack = listPrependAll(listToArray(freshInnerFrames), k)
        return { type: 'Value', value: resumeValue, k: shallowK }
      }

      // Deep reinstallation: create a new AlgebraicHandleFrame and prepend it.
      // The handler wraps the continuation so subsequent effects are caught by this handler.
      const newHandleFrame: AlgebraicHandleFrame = {
        type: 'AlgebraicHandle',
        handler,
        env: fn.handlerEnv as ContextStack,
        sourceCodeInfo: handler.sourceCodeInfo,
      }
      const reinstalledK: ContinuationStack = listPrependAll(listToArray(freshInnerFrames), cons(newHandleFrame, k))

      return { type: 'Value', value: resumeValue, k: reinstalledK }
    }
    // Param-transforming compound types: transform and re-dispatch
    case 'Partial': {
      const actualParamsArr = [...fn.params]
      if (params.size !== fn.placeholders.length) {
        throw new TypeError(`(partial) expects ${fn.placeholders.length} arguments, got ${params.size}.`, sourceCodeInfo)
      }
      const paramsCopy = [...params]
      for (const placeholderIndex of fn.placeholders) {
        actualParamsArr.splice(placeholderIndex, 0, paramsCopy.shift())
      }
      return dispatchFunction(fn.function, PersistentVector.from(actualParamsArr as Any[]), [], env, sourceCodeInfo, k)
    }
    case 'Fnull': {
      const fnulledParamsArr = Array.from(params).map((param, index) => (param === null ? toAny(fn.params.get(index)) : param)) as Any[]
      return dispatchFunction(fn.function, PersistentVector.from(fnulledParamsArr), [], env, sourceCodeInfo, k)
    }
    // Complement: call wrapped function, then negate result
    case 'Complement': {
      const frame: ComplementFrame = { type: 'Complement', sourceCodeInfo }
      return dispatchFunction(fn.function, params, [], env, sourceCodeInfo, cons(frame, k))
    }
    // Comp: chain function calls right-to-left
    case 'Comp': {
      const fns = fn.params
      if (fns.size === 0) {
        if (params.size !== 1)
          throw new TypeError(`(comp) expects one argument, got ${valueToString(params.size)}.`, sourceCodeInfo)
        return { type: 'Value', value: asAny(params.get(0), sourceCodeInfo), k }
      }
      // Start with the last function
      const startIndex = fns.size - 1
      const frame: CompFrame = { type: 'Comp', fns, index: startIndex - 1, env, sourceCodeInfo }
      return dispatchFunction(asFunctionLike(fns.get(startIndex), sourceCodeInfo), params, [], env, sourceCodeInfo, cons(frame, k))
    }
    // Juxt: call each function with same params, collect results
    case 'Juxt': {
      const fns = fn.params
      if (fns.size === 0) {
        return { type: 'Value', value: PersistentVector.empty(), k }
      }
      const frame: JuxtFrame = { type: 'Juxt', fns, params, index: 1, results: PersistentVector.empty(), env, sourceCodeInfo }
      return dispatchFunction(asFunctionLike(fns.get(0), sourceCodeInfo), params, [], env, sourceCodeInfo, cons(frame, k))
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
      return dispatchFunction(firstCheck.fn, PersistentVector.from([firstCheck.param]), [], env, sourceCodeInfo, cons(frame, k))
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
      return dispatchFunction(firstCheck.fn, PersistentVector.from([firstCheck.param]), [], env, sourceCodeInfo, cons(frame, k))
    }
    case 'SpecialBuiltin': {
      const specialExpression = asNonUndefined(builtin.specialExpressions[fn.specialBuiltinSymbolType], sourceCodeInfo)
      if (specialExpression.evaluateAsNormalExpression) {
        const result = specialExpression.evaluateAsNormalExpression(params, sourceCodeInfo, env)
        return wrapMaybePromiseAsStep(result, k)
      }
      throw new TypeError(`Special builtin function ${fn.specialBuiltinSymbolType} is not supported as normal expression.`, sourceCodeInfo)
    }
    case 'Module': {
      const dvalaModule = env.getModule(fn.moduleName)
      if (!dvalaModule) {
        throw new TypeError(`Module '${fn.moduleName}' not found.`, sourceCodeInfo)
      }
      const expression = dvalaModule.functions[fn.functionName]
      if (!expression) {
        throw new TypeError(`Function '${fn.functionName}' not found in module '${fn.moduleName}'.`, sourceCodeInfo)
      }
      if (env.pure && expression.pure === false) {
        throw new RuntimeError(`Cannot call impure function '${fn.functionName}' in pure mode`, sourceCodeInfo)
      }
      assertNumberOfParams(expression.arity, params.size, sourceCodeInfo)
      if (expression.dvalaImpl) {
        return setupUserDefinedCall(expression.dvalaImpl, params, env, sourceCodeInfo, k)
      }
      const result = expression.evaluate(params, sourceCodeInfo, env)
      // Convert plain JS arrays returned by module functions to PersistentVector
      // so they are valid Dvala sequence values.
      return wrapMaybePromiseAsStep(Array.isArray(result) ? fromJS(result) : result, k)
    }
    case 'Builtin': {
      const normalExpression = builtin.normalExpressions[fn.normalBuiltinSymbolType]!
      if (env.pure && normalExpression.pure === false) {
        throw new RuntimeError(`Cannot call impure function '${normalExpression.name}' in pure mode`, sourceCodeInfo)
      }
      if (normalExpression.dvalaImpl) {
        return setupUserDefinedCall(normalExpression.dvalaImpl, params, env, sourceCodeInfo, k)
      }
      const result = normalExpression.evaluate(params, sourceCodeInfo, env)
      // Convert plain JS arrays returned by builtin functions to PersistentVector
      return wrapMaybePromiseAsStep(Array.isArray(result) ? fromJS(result) : result, k)
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
  if (!arityAcceptsMin(fn.arity, params.size)) {
    throw new TypeError(`Expected ${fn.arity} arguments, got ${params.size}.`, sourceCodeInfo)
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
  if (argIndex < params.size && argIndex < nbrOfNonRestArgs) {
    const param = toAny(params.get(argIndex))
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
    return startBindingSlots(argTarget, param, bindingEnv, sourceCodeInfo, cons(completeFrame, k))
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
  const rest: Arr = PersistentVector.from(Array.from(params).slice(nbrOfNonRestArgs).map(toAny))
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
    return startBindingSlots(restArgument, rest, bindingEnv, sourceCodeInfo, cons(completeFrame, k))
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

  return { type: 'Eval', node: bodyNodes[0]!, env: bodyEnv, k: cons(fnBodyFrame, k) }
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
    case 'AlgebraicHandle':
      // Body completed normally (Path 1) — apply transform clause
      return applyAlgebraicHandleNormalCompletion(frame, value, k)
    case 'HandlerTransform':
      // Transform body completed — return transformed value
      return { type: 'Value', value, k }
    case 'HandlerClause':
      // Clause body completed without calling resume — this is an abort.
      // The clause's return value becomes the entire handle block's result,
      // bypassing the AlgebraicHandleFrame's transform.
      return applyHandlerClauseAbort(frame, value, k)
    case 'ResumeCall':
      // Arg evaluated — dispatch the resume function with [argValue]
      return dispatchFunction(
        asFunctionLike(frame.resumeFn, frame.sourceCodeInfo),
        PersistentVector.from([value]),
        [],
        frame.env,
        frame.sourceCodeInfo,
        k,
      )
    case 'WithHandlerSetup':
      // Handler expression evaluated — install handler and evaluate body.
      // Same logic as applyHandleSetup but uses AlgebraicHandleFrame.
      return applyWithHandlerSetup(frame, value, k)
    case 'ParallelResume':
      return applyParallelResume(frame, value, k)
    case 'ParallelBranchBarrier':
      // Branch completed — return BranchComplete step to exit the branch trampoline.
      // Do NOT flow into outerK; the parallel collector handles result aggregation.
      return { type: 'BranchComplete', value, branchCtx: frame.branchCtx }
    case 'ReRunParallel':
      // TODO Phase 3: implement ReRunParallelFrame handler
      throw new RuntimeError('ReRunParallelFrame handler not yet implemented', undefined)
    case 'ResumeParallel':
      // TODO Phase 3: implement ResumeParallelFrame handler
      throw new RuntimeError('ResumeParallelFrame handler not yet implemented', undefined)
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
    case 'FiniteCheck':
      return applyFiniteCheck(frame, value, k)
    case 'ImportMerge': {
      const dvalaFunctions = isObj(value) ? value : PersistentMap.empty()
      // Set dvalaImpl on module expressions for functions overridden by .dvala source
      for (const [name, fn] of dvalaFunctions) {
        const expression = frame.module.functions[name]
        if (expression && isUserDefinedFunction(fn)) {
          expression.dvalaImpl = fn
        }
      }
      // Merge: .dvala functions that DON'T have a matching TS expression override entirely
      // (they are module-only .dvala functions). Functions WITH a TS expression keep
      // the Module function value (arity checking preserved) and dispatch via dvalaImpl.
      let dvalaOnlyFunctions: Obj = PersistentMap.empty()
      for (const [name, fn] of dvalaFunctions) {
        if (!frame.module.functions[name]) {
          dvalaOnlyFunctions = dvalaOnlyFunctions.assoc(name, fn)
        }
      }
      // Merge tsFunctions with dvalaOnlyFunctions: start with tsFunctions, assoc each dvala-only entry
      let merged: Obj = frame.tsFunctions
      for (const [name, fn] of dvalaOnlyFunctions) {
        merged = merged.assoc(name, fn)
      }
      frame.env.registerValueModule(frame.moduleName, merged)
      return { type: 'Value', value: merged, k }
    }
    case 'FileResolve': {
      // File evaluation complete — cache the result, restore dir, and unmark
      frame.env.unmarkFileResolving(frame.moduleName)
      frame.env.registerValueModule(frame.moduleName, value)
      frame.env.currentFileDir = frame.previousFileDir
      return { type: 'Value', value, k }
    }
    case 'CodeTemplateBuild':
      return applyCodeTemplateBuild(frame, value, k)
    case 'MacroEval':
      return applyMacroEval(frame, value, k)
    /* v8 ignore next 2 */
    default: {
      const _exhaustive: never = frame
      throw new RuntimeError(`Unhandled frame type: ${(_exhaustive as Frame).type}`, undefined)
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
  return { type: 'Eval', node: nodes[index]!, env, k: cons(newFrame, k) }
}

function applyIfBranch(frame: IfBranchFrame, value: Any, k: ContinuationStack): Step {
  const { thenNode, elseNode, env } = frame
  if (value) {
    return { type: 'Eval', node: thenNode, env, k }
  }
  if (elseNode) {
    return { type: 'Eval', node: elseNode, env, k }
  }
  return { type: 'Value', value: null, k }
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
  return { type: 'Eval', node: nodes[index]!, env, k: cons(newFrame, k) }
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
  return { type: 'Eval', node: nodes[index]!, env, k: cons(newFrame, k) }
}

function applyQq(frame: QqFrame, value: Any, k: ContinuationStack): Step {
  // If value is non-null, we found our result
  if (value !== null) {
    return { type: 'Value', value, k }
  }
  // Value is null — advance to next operand
  const { nodes, index, env } = frame
  if (index >= nodes.length) {
    return { type: 'Value', value: null, k }
  }
  if (index === nodes.length - 1) {
    return { type: 'Eval', node: nodes[index]!, env, k }
  }
  const newFrame: QqFrame = { ...frame, index: index + 1 }
  return { type: 'Eval', node: nodes[index]!, env, k: cons(newFrame, k) }
}

function applyTemplateStringBuild(frame: TemplateStringBuildFrame, value: Any, k: ContinuationStack): Step {
  const { segments, env } = frame
  const result = frame.result + String(value)

  const nextIndex = frame.index + 1
  if (nextIndex >= segments.length) {
    return { type: 'Value', value: result, k }
  }

  const newFrame: TemplateStringBuildFrame = { ...frame, index: nextIndex, result }
  return { type: 'Eval', node: segments[nextIndex]!, env, k: cons(newFrame, k) }
}

function applyArrayBuild(frame: ArrayBuildFrame, value: Any, k: ContinuationStack): Step {
  const { nodes, env, sourceCodeInfo } = frame

  // Process the completed value into a new immutable result
  let newResult: Arr
  if (frame.isSpread) {
    if (!isPersistentVector(value) && !Array.isArray(value)) {
      throw new TypeError('Spread value is not an array', sourceCodeInfo)
    }
    // Append all items from the spread value (PV or plain array) into the result PV
    let r = frame.result
    for (const item of value as Iterable<Any>) r = r.append(item)
    newResult = r
  } else {
    newResult = frame.result.append(value)
  }

  // Advance to next element
  const nextIndex = frame.index + 1
  if (nextIndex >= nodes.length) {
    return { type: 'Value', value: newResult, k }
  }

  const nextNode = nodes[nextIndex]!
  const isNextSpread = isSpreadNode(nextNode)
  const newFrame: ArrayBuildFrame = { ...frame, index: nextIndex, result: newResult, isSpread: isNextSpread }
  return {
    type: 'Eval',
    node: isNextSpread ? nextNode[1] : nextNode,
    env,
    k: cons(newFrame, k),
  }
}

function applyObjectBuild(frame: ObjectBuildFrame, value: Any, k: ContinuationStack): Step {
  const { entries, env, sourceCodeInfo } = frame

  if (frame.isSpread) {
    // Spread value should be an object (PersistentMap)
    if (!isObj(value)) {
      throw new TypeError('Spread value is not an object', sourceCodeInfo)
    }
    // Merge spread object into result by assoc-ing each entry
    let newResult = frame.result
    for (const [k2, v] of value) newResult = newResult.assoc(k2, v as Any)
    // Advance to next entry
    const nextIndex = frame.index + 1
    if (nextIndex >= entries.length) {
      return { type: 'Value', value: newResult, k }
    }
    const nextEntry = entries[nextIndex]!
    const isNextSpread = isSpreadNode(nextEntry as AstNode)
    const newFrame: ObjectBuildFrame = { ...frame, index: nextIndex, result: newResult, currentKey: null, isSpread: isNextSpread }
    return {
      type: 'Eval',
      node: isNextSpread ? (nextEntry as SpreadNode)[1] : (nextEntry as [AstNode, AstNode])[0],
      env,
      k: cons(newFrame, k),
    }
  }

  if (frame.currentKey === null) {
    // We just evaluated a key expression — now evaluate the value
    assertString(value, sourceCodeInfo)
    const pair = entries[frame.index] as [AstNode, AstNode]
    const valueNode = pair[1]
    const newFrame: ObjectBuildFrame = { ...frame, currentKey: value }
    return { type: 'Eval', node: valueNode, env, k: cons(newFrame, k) }
  } else {
    // We just evaluated a value expression — assoc the key-value pair into result
    const newResult = frame.result.assoc(frame.currentKey, value)
    // Advance to next entry
    const nextIndex = frame.index + 1
    if (nextIndex >= entries.length) {
      return { type: 'Value', value: newResult, k }
    }
    const nextEntry = entries[nextIndex]!
    const isNextSpread = isSpreadNode(nextEntry as AstNode)
    const newFrame: ObjectBuildFrame = { ...frame, index: nextIndex, result: newResult, currentKey: null, isSpread: isNextSpread }
    return {
      type: 'Eval',
      node: isNextSpread ? (nextEntry as SpreadNode)[1] : (nextEntry as [AstNode, AstNode])[0],
      env,
      k: cons(newFrame, k),
    }
  }
}

function applyLetBind(frame: LetBindFrame, value: Any, k: ContinuationStack): Step {
  const { target, env, sourceCodeInfo } = frame

  // Name inference: when binding a simple symbol to an unnamed function,
  // stamp the binding name onto the function (like JS's `let foo = () => {}` → foo.name === "foo")
  if (target[0] === 'symbol' && (isUserDefinedFunction(value) || isMacroFunction(value)) && value.name === undefined) {
    value.name = target[1][0][1]
  }

  // Push completion frame to receive the binding record
  const completeFrame: LetBindCompleteFrame = {
    type: 'LetBindComplete',
    originalValue: value,
    env,
    sourceCodeInfo,
  }

  // Start processing binding slots with linearized approach
  return startBindingSlots(target, value, env, sourceCodeInfo, cons(completeFrame, k))
}

function applyLetBindComplete(frame: LetBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { originalValue, env, sourceCodeInfo } = frame

  // Add the binding record to the environment
  env.addValues(record as unknown as Record<string, Any>, sourceCodeInfo)

  // Return the original RHS value (which is what `let x = expr` evaluates to)
  return { type: 'Value', value: originalValue, k }
}

function applyLoopBind(frame: LoopBindFrame, value: Any, k: ContinuationStack): Step {
  const { bindings, index, context, body, env, sourceCodeInfo } = frame

  // Value for the current binding has been evaluated
  const [target] = bindings[index]!

  // Push completion frame to receive the binding record
  const completeFrame: LoopBindCompleteFrame = {
    type: 'LoopBindComplete',
    bindings,
    index,
    context,
    body,
    env,
    sourceCodeInfo,
  }

  // Start processing binding slots with linearized approach
  return startBindingSlots(target, value, env.create(context), sourceCodeInfo, cons(completeFrame, k))
}

function applyLoopBindComplete(frame: LoopBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { bindings, index, context, body, env, sourceCodeInfo } = frame

  // Add the binding record to the loop context
  Object.entries(record as unknown as Record<string, Any>).forEach(([name, val]) => {
    context[name] = { value: val }
  })

  // Move to next binding
  const nextIndex = index + 1
  if (nextIndex >= bindings.length) {
    // All bindings done — set up the loop iteration
    const loopEnv = env.create(context)
    const iterateFrame: LoopIterateFrame = {
      type: 'LoopIterate',
      bindings,
      bindingContext: context,
      body,
      env: loopEnv,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: body, env: loopEnv, k: cons(iterateFrame, k) }
  }

  // Evaluate next binding's value expression (in context with previous bindings)
  const newFrame: LoopBindFrame = {
    type: 'LoopBind',
    phase: 'value',
    bindings,
    index: nextIndex,
    context,
    body,
    env,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: bindings[nextIndex]![1], env: env.create(context), k: cons(newFrame, k) }
}

function applyLoopIterate(_frame: LoopIterateFrame, value: Any, k: ContinuationStack): Step {
  // Body has been evaluated successfully — return the value
  // (recur is handled by the RecurFrame, which will pop back to this frame)
  return { type: 'Value', value, k }
}

function applyForLoop(frame: ForLoopFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { bindingNodes, result, env, sourceCodeInfo } = frame
  const { asColl } = getCollectionUtils()

  switch (frame.phase) {
    case 'evalCollection': {
      // A collection expression has been evaluated
      const coll = asColl(value, sourceCodeInfo)
      // Build a PersistentVector to iterate: PV stays as-is, plain arrays are
      // wrapped in PV, strings become a PV of characters, and PersistentMap
      // becomes a PV of [key, val] PV pairs.
      let seq: Arr
      if (isPersistentVector(coll)) {
        seq = coll
      } else if (Array.isArray(coll)) {
        seq = PersistentVector.from(coll as Any[])
      } else if (typeof coll === 'string') {
        seq = PersistentVector.from([...coll] as Any[])
      } else {
        // Each [key, value] entry must itself be a PersistentVector so that
        // destructuring patterns like `for let [k, v] of obj` work correctly.
        const pairs: Any[] = []
        for (const [key, v] of coll as Obj) pairs.push(PersistentVector.from([key, v] as Any[]))
        seq = PersistentVector.from(pairs)
      }

      if (seq.size === 0) {
        // Empty collection — abort this level
        return handleForAbort(frame, k)
      }

      // Store collection for this level
      const levelStates = [...frame.levelStates]
      levelStates[frame.bindingLevel] = { collection: seq, index: 0 }

      // Process the first element's binding
      const binding = bindingNodes[frame.bindingLevel]!
      const targetNode = binding[0][0]
      const element = seq.get(0)

      const elValue = asAny(element, sourceCodeInfo)

      // Push completion frame and use frame-based binding
      const completeFrame: ForElementBindCompleteFrame = {
        type: 'ForElementBindComplete',
        forFrame: { ...frame, levelStates },
        levelStates,
        env,
        sourceCodeInfo,
      }
      return startBindingSlots(targetNode, elValue, env, sourceCodeInfo, cons(completeFrame, k))
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
        return { type: 'Eval', node: whileNode, env, k: cons(newFrame, k) }
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
      // Body has been evaluated — append immutably and update frame
      const newResult = result.append(value)
      return advanceForElement({ ...frame, result: newResult }, k)
    }

  }
}

/** Handle for-loop abort: no more elements at the outermost level. */
function handleForAbort(frame: ForLoopFrame, k: ContinuationStack): Step {
  return { type: 'Value', value: frame.result, k }
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

  if (nextElementIndex >= currentState.collection.size) {
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
  const targetNode = binding[0][0]
  const element = currentState.collection.get(nextElementIndex)
  const elValue = asAny(element, sourceCodeInfo)

  const completeFrame: ForElementBindCompleteFrame = {
    type: 'ForElementBindComplete',
    forFrame: { ...frame, levelStates, bindingLevel: currentLevel },
    levelStates,
    env,
    sourceCodeInfo,
  }
  return startBindingSlots(targetNode, elValue, env, sourceCodeInfo, cons(completeFrame, k))
}

/** Handle completion of for-loop element binding. */
function applyForElementBindComplete(frame: ForElementBindCompleteFrame, record: Any, k: ContinuationStack): Step {
  const { forFrame, levelStates, env, sourceCodeInfo } = frame

  // Add the binding record to the context
  Object.entries(record as unknown as Record<string, Any>).forEach(([name, val]) => {
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
  letBindings: [BindingTarget, AstNode][],
  letIndex: number,
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  const letBinding = letBindings[letIndex]!
  const bindingValue = letBinding[1]

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
  return { type: 'Eval', node: bindingValue, env, k: cons(letBindFrame, k) }
}

/** Handle continuation after evaluating a for-loop let-binding value or destructuring. */
function applyForLetBind(frame: ForLetBindFrame, value: Any, k: ContinuationStack): Step {
  const { phase, forFrame, levelStates, letBindings, letIndex, env, sourceCodeInfo } = frame

  if (phase === 'evalValue') {
    // Value evaluated — now destructure
    const letBinding = letBindings[letIndex]!
    const target = letBinding[0]

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
    return startBindingSlots(target, value, env, sourceCodeInfo, cons(destructureFrame, k))
  }

  // phase === 'destructure' — binding record received
  Object.entries(value as unknown as Record<string, Any>).forEach(([name, val]) => {
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
    return { type: 'Eval', node: whenNode, env, k: cons(newFrame, k) }
  }

  if (whileNode) {
    const newFrame: ForLoopFrame = { ...frame, levelStates, phase: 'evalWhile' }
    return { type: 'Eval', node: whileNode, env, k: cons(newFrame, k) }
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
    const collectionNode = binding[0][1]
    const newFrame: ForLoopFrame = {
      ...frame,
      phase: 'evalCollection',
      bindingLevel: nextLevel,
    }
    return { type: 'Eval', node: collectionNode, env, k: cons(newFrame, k) }
  }

  // All levels bound — evaluate the body
  const newFrame: ForLoopFrame = { ...frame, phase: 'evalBody' }
  // Use env.create(frame.context) to ensure post-deserialization correctness:
  // after serialize/deserialize, frame.context and the context inside frame.env
  // may be separate objects, so mutations to frame.context won't be visible
  // through frame.env. Pushing frame.context on top guarantees current values.
  const bodyEnv = env.create(frame.context)
  return { type: 'Eval', node: body, env: bodyEnv, k: cons(newFrame, k) }
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
 * 1. Local `AlgebraicHandleFrame` handlers (innermost first)
 * 2. Host handlers registered for `'dvala.error'`
 */
/**
 * Scan the continuation stack for the nearest MacroEvalFrame and return its
 * sourceCodeInfo (the macro call site). Returns undefined if no macro frame
 * is found. Used to give errors from macro-expanded code a meaningful location.
 */
function findMacroCallSiteInfo(k: ContinuationStack): SourceCodeInfo | undefined {
  let _node = k
  while (_node !== null) {
    const frame = _node.head
    _node = _node.tail
    if (frame.type === 'MacroEval')
      return frame.sourceCodeInfo
  }
  return undefined
}

/**
 * If the continuation stack contains a MacroEvalFrame, patch the error with
 * the macro call site location. Errors from macro-expanded code should always
 * point to the call site (e.g. `assert(1 > 5)`) rather than internal helper
 * functions, since the call site is what the user wrote and can fix.
 */
function patchErrorWithMacroCallSite(error: DvalaError, k: ContinuationStack): DvalaError {
  const callSite = findMacroCallSiteInfo(k)
  if (!callSite)
    return error
  // Create a new error with the macro call site as location
  if (error instanceof UserError)
    return new UserError(error.userMessage, callSite)
  if (error instanceof AssertionError)
    return new AssertionError(error.shortMessage, callSite)
  if (error instanceof ReferenceError)
    return new ReferenceError(error.symbol, callSite)
  return new DvalaError(error.shortMessage, callSite)
}

// ---------------------------------------------------------------------------
// Error origin tracking — invisible to Dvala code, used by the runtime
// ---------------------------------------------------------------------------

/** Metadata about the original error, attached to @dvala.error payloads via a Symbol property. */
interface ErrorOrigin {
  sourceCodeInfo: SourceCodeInfo | undefined
}

/** Symbol key for error origin metadata on @dvala.error payloads. Invisible to Dvala code. */
const ERROR_ORIGIN = Symbol('dvala.error.origin')

/** Attach error origin metadata to a payload object. */
function stampErrorOrigin(payload: Obj, origin: ErrorOrigin): Obj {
  ;(payload as unknown as Record<symbol, unknown>)[ERROR_ORIGIN] = origin
  return payload
}

/** Read error origin metadata from a payload, if present. */
function getErrorOrigin(payload: Obj): ErrorOrigin | undefined {
  return (payload as unknown as Record<symbol, unknown>)[ERROR_ORIGIN] as ErrorOrigin | undefined
}

/** Build the structured @dvala.error payload from a DvalaError instance. */
function buildErrorPayload(error: DvalaError): Obj {
  let payload: Obj = PersistentMap.empty<unknown>()
    .assoc('type', error.errorType)
    .assoc('message', error.shortMessage)
  // Add type-specific data following the convention
  if (error instanceof ReferenceError) {
    payload = payload.assoc('data', PersistentMap.fromRecord({ symbol: error.symbol }))
  }
  // Stamp origin metadata (sourceCodeInfo) for internal tracking — preserved across re-throws
  stampErrorOrigin(payload, { sourceCodeInfo: error.sourceCodeInfo })
  return payload
}

/**
 * Validate and normalize a manual perform(@dvala.error, payload).
 * Returns the normalized payload or throws TypeError if invalid.
 */
function validateErrorPayload(arg: Any, sourceCodeInfo: SourceCodeInfo | undefined): Obj {
  if (!isObj(arg)) {
    throw new TypeError('@dvala.error requires an error object', sourceCodeInfo)
  }
  const obj = arg
  if (!obj.has('message')) {
    throw new TypeError('@dvala.error requires a message field', sourceCodeInfo)
  }
  // Coerce type and message to strings, default type to "UserError"
  const rawType = obj.get('type')
  const rawMessage = obj.get('message')
  const normalized: Obj = obj
    .assoc('type', rawType !== null && rawType !== undefined ? String(rawType) : 'UserError')
    .assoc('message', String(rawMessage))
  // "First writer wins": if the payload already carries an error origin (re-throw),
  // preserve it. Otherwise stamp a fresh origin from the perform call site.
  const existingOrigin = getErrorOrigin(obj)
  if (existingOrigin) {
    stampErrorOrigin(normalized, existingOrigin)
  } else {
    stampErrorOrigin(normalized, { sourceCodeInfo })
  }
  return normalized
}

function tryDispatchDvalaError(
  error: DvalaError,
  k: ContinuationStack,
): Step | null {
  const effect = getEffectRef('dvala.error')
  const arg: Any = buildErrorPayload(error)

  // Convert runtime error to a perform(@dvala.error, { type, message }) if there's a
  // handler that can catch it. Otherwise return null (caller re-throws).
  //
  // Walk k looking for AlgebraicHandle frames with @dvala.error clauses.
  // Stop at ParallelBranchBarrier — same effect boundary as dispatchPerform.
  let _node = k
  while (_node !== null) {
    const frame = _node.head
    if (frame.type === 'ParallelBranchBarrier') break
    _node = _node.tail
    if (frame.type === 'AlgebraicHandle') {
      if (frame.handler.clauseMap.has('dvala.error')) {
        return { type: 'Perform', effect, arg, k, sourceCodeInfo: error.sourceCodeInfo }
      }
      // No @dvala.error clause — continue searching
    }
  }
  return null // No handler found
}

function applyRecur(frame: RecurFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { nodes, index, env } = frame
  const newParams = frame.params.append(value)

  if (index >= nodes.length) {
    // All recur params collected — handle recur via continuation stack
    return handleRecur(newParams, k, frame.sourceCodeInfo)
  }

  // Evaluate next param
  const newFrame: RecurFrame = { ...frame, index: index + 1, params: newParams }
  return { type: 'Eval', node: nodes[index]!, env, k: cons(newFrame, k) }
}

/**
 * Handle recur by searching the continuation stack for the nearest
 * LoopIterateFrame or FnBodyFrame, rebinding parameters, and restarting.
 * Uses frame-based slot binding for proper suspension support.
 */
function handleRecur(params: Arr, k: ContinuationStack, sourceCodeInfo: SourceCodeInfo | undefined): Step {
  let _node = k
  while (_node !== null) {
    const frame = _node.head
    const remainingK = _node.tail
    _node = remainingK

    if (frame.type === 'LoopIterate') {
      // Found loop frame — start rebinding using slots
      const { bindings, bindingContext, body, env } = frame

      if (params.size !== bindings.length) {
        throw new TypeError(
          `recur expected ${bindings.length} parameters, got ${params.size}`,
          sourceCodeInfo,
        )
      }

      // Start the frame-based rebinding process
      return startRecurLoopRebind(bindings, 0, params, bindingContext, body, env, remainingK, sourceCodeInfo)
    }

    if (frame.type === 'FnBody') {
      // Found function body frame — restart with new params
      const { fn, outerEnv } = frame
      return setupUserDefinedCall(fn, params, outerEnv, frame.sourceCodeInfo, remainingK)
    }
  }

  throw new RuntimeError('recur called outside of loop or function body', sourceCodeInfo)
}

/**
 * Start rebinding loop variables during recur using slot-based binding.
 */
function startRecurLoopRebind(
  bindings: [BindingTarget, AstNode][],
  bindingIndex: number,
  params: Arr,
  bindingContext: Context,
  body: AstNode,
  env: ContextStack,
  remainingK: ContinuationStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
): Step {
  if (bindingIndex >= bindings.length) {
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
      bindings,
      bindingContext,
      body,
      env,
      sourceCodeInfo,
    }
    return { type: 'Eval', node: body, env, k: cons(newIterateFrame, remainingK) }
  }

  // Bind current node using slots
  const [target] = bindings[bindingIndex]!
  const param = toAny(params.get(bindingIndex))

  const rebindFrame: RecurLoopRebindFrame = {
    type: 'RecurLoopRebind',
    bindings,
    bindingIndex,
    params,
    bindingContext,
    body,
    env,
    remainingK,
    sourceCodeInfo,
  }

  return startBindingSlots(target, param, env, sourceCodeInfo, cons(rebindFrame, remainingK))
}

/**
 * Handle completion of one loop binding during recur rebinding.
 */
function applyRecurLoopRebind(frame: RecurLoopRebindFrame, value: Any, _k: ContinuationStack): Step {
  const { bindings, bindingIndex, params, bindingContext, body, env, remainingK, sourceCodeInfo } = frame

  // value is the binding record from startBindingSlots
  const record = value as unknown as Record<string, Any>
  Object.entries(record).forEach(([name, val]) => {
    bindingContext[name] = { value: val }
  })

  // Continue with next binding
  return startRecurLoopRebind(bindings, bindingIndex + 1, params, bindingContext, body, env, remainingK, sourceCodeInfo)
}

/**
 * WithHandlerSetup: the handler expression has been evaluated.
 * Push an AlgebraicHandleFrame and evaluate the body as a sequence.
 * No function boundary — preserves `recur` behavior.
 */
function applyWithHandlerSetup(frame: WithHandlerSetupFrame, value: Any, k: ContinuationStack): Step {
  if (!isHandlerFunction(value)) {
    throw new RuntimeError('`with` expects a handler value (created by handler...end)', frame.sourceCodeInfo)
  }

  const handleFrame: AlgebraicHandleFrame = {
    type: 'AlgebraicHandle',
    handler: value,
    env: value.closureEnv as ContextStack,
    sourceCodeInfo: frame.sourceCodeInfo,
  }

  const { bodyExprs, env } = frame
  if (bodyExprs.length === 0) {
    return { type: 'Value', value: null, k: cons(handleFrame, k) }
  }
  if (bodyExprs.length === 1) {
    return { type: 'Eval', node: bodyExprs[0]!, env, k: cons(handleFrame, k) }
  }
  const sequenceFrame: SequenceFrame = {
    type: 'Sequence',
    nodes: bodyExprs,
    index: 1,
    env,
    sourceCodeInfo: frame.sourceCodeInfo,
  }
  return { type: 'Eval', node: bodyExprs[0]!, env, k: cons(sequenceFrame, cons(handleFrame, k)) }
}

// ---------------------------------------------------------------------------
// Algebraic handler system (new)
// ---------------------------------------------------------------------------

/**
 * Body completed normally (Path 1) — apply transform clause.
 * If no transform, pass through (identity). Transform does NOT apply to abort values.
 */
function applyAlgebraicHandleNormalCompletion(frame: AlgebraicHandleFrame, value: Any, k: ContinuationStack): Step {
  const { handler } = frame
  return applyHandlerTransform(handler, value, frame.env, frame.sourceCodeInfo, k)
}

/**
 * Apply a handler's transform clause to a value. Used for both:
 * - Normal body completion (Path 1)
 * - Inside resume return (reinstalled handler's normal completion)
 *
 * If no transform clause, returns the value unchanged (identity).
 */
function applyHandlerTransform(handler: HandlerFunction, value: Any, _env: ContextStack, sourceCodeInfo: SourceCodeInfo | undefined, k: ContinuationStack): Step {
  if (!handler.transform) {
    // No transform — identity
    return { type: 'Value', value, k }
  }

  const [paramTarget, bodyExprs] = handler.transform
  const closureEnv = handler.closureEnv as ContextStack

  // Bind the transform parameter to the value
  const transformFrame: HandlerTransformFrame = {
    type: 'HandlerTransform',
    handler,
    env: closureEnv,
    sourceCodeInfo,
  }

  // Bind param and evaluate transform body
  return startTransformClause(paramTarget, bodyExprs, value, closureEnv, sourceCodeInfo, cons(transformFrame, k))
}

/**
 * Start evaluating a transform clause body with the param bound.
 */
function startTransformClause(
  paramTarget: BindingTarget,
  bodyExprs: AstNode[],
  value: Any,
  closureEnv: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  // Create a new scope with the transform parameter bound.
  // For the common case (simple symbol: `x -> expr`), bind directly.
  const context: Context = {}
  if (paramTarget[0] === bindingTargetTypes.symbol) {
    const symNode = paramTarget[1][0]
    context[symNode[1]] = { value }
  } else {
    // Complex destructuring — bind all names to the value for now.
    // Full destructuring support can be added via binding slots later.
    const names = getAllBindingTargetNames(paramTarget)
    for (const name of Object.keys(names)) {
      context[name] = { value }
    }
  }

  const bodyEnv = closureEnv.create(context)

  if (bodyExprs.length === 1) {
    return { type: 'Eval', node: bodyExprs[0]!, env: bodyEnv, k }
  }
  const seqFrame: SequenceFrame = {
    type: 'Sequence',
    nodes: bodyExprs,
    index: 1,
    env: bodyEnv,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: bodyExprs[0]!, env: bodyEnv, k: cons(seqFrame, k) }
}

/**
 * Handler clause completed without calling resume — abort.
 * The clause's return value becomes the handle block's result,
 * bypassing the AlgebraicHandleFrame (and its transform).
 *
 * We need to pop the continuation up past the AlgebraicHandleFrame.
 */
function applyHandlerClauseAbort(frame: HandlerClauseFrame, value: Any, k: ContinuationStack): Step {
  void frame // frame fields unused at this point — clause is complete
  // Clause body completed. Whether or not resume was called, the clause's return
  // value propagates past the enclosing AlgebraicHandleFrame (bypassing its transform).
  let _node = k
  while (_node !== null) {
    if (_node.head.type === 'AlgebraicHandle') {
      return { type: 'Value', value, k: _node.tail }
    }
    _node = _node.tail
  }
  return { type: 'Value', value, k }
}

/**
 * Create a new continuation where each frame's env has an independent copy
 * of its innermost context (_contexts[0]). Used for multi-shot: prevents
 * mutations from one resume affecting subsequent resumes.
 *
 * addValues() only mutates _contexts[0], so copying just that context is
 * sufficient to ensure each resume path is independent. Deduplicates env
 * references so frames sharing the same env get the same fresh copy.
 */
function freshenContinuationEnvs(k: ContinuationStack): ContinuationStack {
  const envMap = new Map<ContextStack, ContextStack>()
  const frames = listToArray(k)
  const freshFrames = frames.map((frame): Frame => {
    if (!('env' in frame)) return frame
    const env = (frame as { env: ContextStack }).env
    if (!envMap.has(env)) {
      envMap.set(env, env.withCopiedTopContext())
    }
    // objectLiteralTypeAssertions: 'never' forbids `{ ... } as Frame`.
    // Cast through unknown to satisfy the lint rule.
    const freshFrameUnknown: unknown = { ...frame, env: envMap.get(env) }
    return freshFrameUnknown as Frame
  })
  return listFromArray(freshFrames)
}

/**
 * Dispatch a perform against an AlgebraicHandleFrame.
 *
 * Looks up the effect name in the handler's clauseMap.
 * If found: runs clause body with params bound + `resume` in scope.
 * If not found: propagates past this handler (returns null to indicate no match).
 */
function dispatchAlgebraicHandler(
  frame: AlgebraicHandleFrame,
  effect: EffectRef,
  arg: Any,
  k: ContinuationStack,
  frameIndex: number,
  sourceCodeInfo?: SourceCodeInfo,
): Step | null {
  const { handler } = frame
  const clause = handler.clauseMap.get(effect.name)

  if (!clause) {
    // No matching clause — propagate to outer handler
    return null
  }

  // Found a matching clause. Set up the clause execution:
  // 1. Capture the continuation from perform site to AlgebraicHandleFrame (performK)
  // 2. Create a resume function that reinstalls the handler (deep semantics)
  // 3. Run clause body with params bound + resume in scope

  // performK = continuation from perform call site up to and including the AlgebraicHandleFrame
  const performK = listTake(k, frameIndex + 1)

  // outerK = continuation past the AlgebraicHandleFrame (clause runs outside handler scope)
  const outerK = listDrop(k, frameIndex + 1)

  // Create the HandlerClauseFrame — bridges clause result back
  const clauseFrame: HandlerClauseFrame = {
    type: 'HandlerClause',
    performK,
    handler,
    env: handler.closureEnv as ContextStack,
    sourceCodeInfo,
  }

  // Build resume function — a UserDefined function that captures the continuation
  const resumeFn = buildResumeFunction(clauseFrame, handler, performK, frame.env, sourceCodeInfo)

  // Create clause scope with params bound + resume
  const closureEnv = handler.closureEnv as ContextStack
  const clauseContext: Context = {
    resume: { value: resumeFn },
  }

  // Bind effect arguments to clause params
  // The arg is the single payload from perform(@eff, arg).
  // Clause params receive it positionally.
  const clauseParams = clause.params
  if (clauseParams.length === 0) {
    // No params — nothing to bind
  } else if (clauseParams.length === 1) {
    // Single param — bind the arg directly
    const target = clauseParams[0]!
    if (target[0] === bindingTargetTypes.symbol) {
      const symNode = target[1][0]
      clauseContext[symNode[1]] = { value: arg }
    }
  } else {
    // Multiple params — arg should be an array (or we bind first param to arg, rest to null)
    if (Array.isArray(arg)) {
      for (let i = 0; i < clauseParams.length; i++) {
        const target = clauseParams[i]!
        if (target[0] === bindingTargetTypes.symbol) {
          const symNode = target[1][0]
          clauseContext[symNode[1]] = { value: (arg[i] ?? null) as Any }
        }
      }
    } else if (isPersistentVector(arg)) {
      // HAMT: arrays are PersistentVectors — use .get(i) to access elements positionally
      for (let i = 0; i < clauseParams.length; i++) {
        const target = clauseParams[i]!
        if (target[0] === bindingTargetTypes.symbol) {
          const symNode = target[1][0]
          clauseContext[symNode[1]] = { value: (arg.get(i) ?? null) as Any }
        }
      }
    } else {
      // Single arg with multiple params — bind first to arg, rest to null
      for (let i = 0; i < clauseParams.length; i++) {
        const target = clauseParams[i]!
        if (target[0] === bindingTargetTypes.symbol) {
          const symNode = target[1][0]
          clauseContext[symNode[1]] = { value: i === 0 ? arg : null }
        }
      }
    }
  }

  const clauseEnv = closureEnv.create(clauseContext)

  // Evaluate clause body — runs outside the handler scope (outerK, not k)
  const clauseBodyExprs = clause.body
  if (clauseBodyExprs.length === 1) {
    return { type: 'Eval', node: clauseBodyExprs[0]!, env: clauseEnv, k: cons(clauseFrame, outerK) }
  }
  const seqFrame: SequenceFrame = {
    type: 'Sequence',
    nodes: clauseBodyExprs,
    index: 1,
    env: clauseEnv,
    sourceCodeInfo,
  }
  return { type: 'Eval', node: clauseBodyExprs[0]!, env: clauseEnv, k: cons<Frame>(seqFrame, cons<Frame>(clauseFrame, outerK)) }
}

/**
 * Build a `resume` function for a handler clause.
 *
 * When called with `resume(value)`:
 * 1. One-shot guard: error if called twice
 * 2. Reinstall the handler (deep semantics) around the continuation
 * 3. Evaluate the continuation with the given value at the perform site
 * 4. Apply the handler's transform clause on normal completion
 * 5. Return the result to the clause body (resume returns the continuation's result)
 */
function buildResumeFunction(
  clauseFrame: HandlerClauseFrame,
  handler: HandlerFunction,
  performK: ContinuationStack,
  handlerEnv: ContextStack,
  sourceCodeInfo?: SourceCodeInfo,
): ResumeFunction {
  return {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Resume',
    clauseFrame,
    handler,
    performK,
    handlerEnv,
    arity: { min: 0, max: 1 },
    sourceCodeInfo,
  }
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
  const { argNodes, index, env } = frame
  const newParams = frame.params.append(value)

  if (index >= argNodes.length) {
    // All values collected — first is the effect ref, second (optional) is the payload
    const effectRef = newParams.get(0)!
    assertEffect(effectRef, frame.sourceCodeInfo)
    // Pure mode check — effects are not allowed in pure mode
    if (env.pure) {
      throw new RuntimeError(`Cannot perform effect '${effectRef.name}' in pure mode`, frame.sourceCodeInfo)
    }
    const arg = (newParams.size > 1 ? newParams.get(1)! : null) as Any
    // Produce a PerformStep — let the trampoline dispatch it
    return { type: 'Perform', effect: effectRef, arg, k, sourceCodeInfo: frame.sourceCodeInfo }
  }

  // Evaluate next arg
  const newFrame: PerformArgsFrame = { ...frame, index: index + 1, params: newParams }
  return { type: 'Eval', node: argNodes[index]!, env, k: cons<Frame>(newFrame, k) }
}

function dispatchPerform(effect: EffectRef, arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo, handlers?: Handlers, signal?: AbortSignal, snapshotState?: SnapshotState): Step | Promise<Step> {
  // dvala.checkpoint — unconditional snapshot capture before normal dispatch.
  // The snapshot is always captured regardless of whether any handler intercepts.
  // Skipped when re-dispatching from an algebraic handler fallthrough (already captured upstream).
  if (effect.name === 'dvala.checkpoint' && snapshotState) {
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

  // Walk the continuation stack looking for AlgebraicHandleFrame handlers.
  // Stop at ParallelBranchBarrier — it acts as an effect boundary, preserving
  // effect isolation between branches and the outer scope (same as reaching k: null).
  let searchNode = k
  let frameIndex = 0
  while (searchNode !== null) {
    const frame = searchNode.head
    if (frame.type === 'ParallelBranchBarrier') break
    if (frame.type === 'AlgebraicHandle') {
      // New handler system — try named clause dispatch
      const result = dispatchAlgebraicHandler(frame, effect, arg, k, frameIndex, sourceCodeInfo)
      if (result !== null) {
        return result
      }
      // No matching clause — propagate past this handler (continue loop)
    }
    searchNode = searchNode.tail
    frameIndex++
  }

  // No matching local handler found — dispatch to host handler if available.
  const matchingHostHandlers = findMatchingHandlers(effect.name, handlers)
  if (matchingHostHandlers.length > 0) {
    return dispatchHostHandler(effect.name, matchingHostHandlers, arg, k, signal, sourceCodeInfo, snapshotState)
  }

  // No host handler — check standard effects (dvala.io.print, dvala.time.now, etc.).
  const standardHandler = getStandardEffectHandler(effect.name)
  if (standardHandler) {
    return standardHandler(arg, k, sourceCodeInfo)
  }

  // dvala.macro.expand — default handler calls the macro function directly.
  // The MacroEvalFrame on k?.head provides the calling scope for evaluating the result.
  if (effect.name === 'dvala.macro.expand') {
    // payload is a PM: { fn: MacroFunction, args: PV<PV<AstNode>> }
    // (fromJS was applied at callMacro: fn passes through, args are PV-converted)
    const payloadPM = arg as unknown as PersistentMap<Any>
    const macroEvalFrame = k!.head as MacroEvalFrame
    const macroFn_ = payloadPM.get('fn') as unknown as UserDefinedFunction
    // args is a PV of PV-converted AST nodes — each element is already a PV
    const argsAsPV = payloadPM.get('args') as unknown as Arr
    return setupUserDefinedCall(
      macroFn_,
      argsAsPV,
      macroEvalFrame.env,
      sourceCodeInfo,
      k,
    )
  }

  // dvala.checkpoint resolves to null when completely unhandled.
  if (effect.name === 'dvala.checkpoint') {
    return { type: 'Value', value: null, k }
  }

  // dvala.error is special — validate payload and throw UserError when unhandled.
  if (effect.name === 'dvala.error') {
    // Validate and normalize the payload (throws TypeError if invalid)
    const payload = validateErrorPayload(arg, sourceCodeInfo)
    // Use the original error origin if available (preserved across re-throws)
    const origin = getErrorOrigin(payload)
    throw new UserError(payload.get('message') as string, origin?.sourceCodeInfo ?? sourceCodeInfo)
  }

  // dvala.host is special — validate argument type and provide a descriptive error when no handler is installed.
  if (effect.name === 'dvala.host') {
    if (typeof arg !== 'string') {
      throw new TypeError(`@dvala.host requires a string argument, got ${typeof arg}`, sourceCodeInfo)
    }
    throw new RuntimeError(`Host binding "${arg}" not provided. Install a @dvala.host effect handler.`, sourceCodeInfo)
  }

  // No handler at all — unhandled effect.
  throw new RuntimeError(`Unhandled effect: '${effect.name}'`, sourceCodeInfo)
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
        // Validate and normalize the payload (throws TypeError if invalid)
        const payload = validateErrorPayload(arg, sourceCodeInfo)
        const origin = getErrorOrigin(payload)
        throw new UserError(payload.get('message') as string, origin?.sourceCodeInfo ?? sourceCodeInfo)
      }
      // dvala.checkpoint resolves to null when all handlers call next().
      if (effectName === 'dvala.checkpoint') {
        return { type: 'Value', value: null, k }
      }
      throw new RuntimeError(`Unhandled effect: '${effectName}'`, sourceCodeInfo)
    }

    const [_pattern, handler] = matchingHandlers[index]!

    let outcome: HandlerOutcome | undefined
    let settled = false

    function assertNotSettled(operation: string): void {
      if (settled) {
        throw new RuntimeError(`Effect handler called ${operation}() after already calling another operation`, sourceCodeInfo)
      }
      settled = true
    }

    const ctx: EffectContext = {
      effectName,
      // Convert Dvala value to plain JS so the host handler sees a familiar value
      arg: toJS(arg),
      signal: effectSignal,
      resume: (value: unknown) => {
        assertNotSettled('resume')
        // Capture a post-effect snapshot so time travel can rewind to right after this effect.
        // Snapshot after (not before) so the effect result is baked in — re-execution from here
        // is pure and needs no effect-result replay.
        if (snapshotState?.autoCheckpoint && effectName !== 'dvala.checkpoint' && effectName !== 'dvala.macro.expand') {
          const continuation = serializeToObject(k)
          const snapshot = createSnapshot({
            continuation,
            timestamp: Date.now(),
            index: snapshotState.nextSnapshotIndex++,
            executionId: snapshotState.executionId,
            message: `After ${effectName}`,
          })
          snapshotState.snapshots.push(snapshot)
          if (snapshotState.maxSnapshots !== undefined && snapshotState.snapshots.length > snapshotState.maxSnapshots) {
            snapshotState.snapshots.shift()
          }
        }
        if (value instanceof Promise) {
          // Convert the resolved plain-JS value back to a Dvala value before feeding to continuation
          outcome = { kind: 'asyncResume', promise: value.then(v => fromJS(v)) }
        } else {
          outcome = { kind: 'step', step: { type: 'Value', value: fromJS(value), k } }
        }
      },
      fail: (msg?: string) => {
        assertNotSettled('fail')
        const errorMsg = msg ?? `Effect handler failed for '${effectName}'`
        outcome = { kind: 'step', step: { type: 'Error', error: new RuntimeError(errorMsg, sourceCodeInfo), k } }
      },
      suspend: (meta?: unknown) => {
        assertNotSettled('suspend')
        outcome = {
          kind: 'throw',
          error: new SuspensionSignal(
            k,
            snapshotState ? snapshotState.snapshots : [],
            snapshotState ? snapshotState.nextSnapshotIndex : 0,
            meta,
            effectName,
            // Store the original Dvala arg value (not toJS-converted) for internal use
            arg,
          ),
        }
      },
      next: () => {
        assertNotSettled('next')
        outcome = { kind: 'next' }
      },
      get snapshots(): Snapshot[] { return snapshotState ? [...snapshotState.snapshots] : [] },
      checkpoint: (message: string, meta?: unknown): Snapshot => {
        if (!snapshotState) {
          throw new RuntimeError('checkpoint is not available outside effect-enabled execution', sourceCodeInfo)
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
      resumeFrom: (snapshot: Snapshot, value: unknown) => {
        if (settled) {
          throw new RuntimeError('Effect handler called resumeFrom() after already calling another operation', sourceCodeInfo)
        }
        if (!snapshotState) {
          throw new RuntimeError('resumeFrom is not available outside effect-enabled execution', sourceCodeInfo)
        }
        const found = snapshotState.snapshots.find(s => s.index === snapshot.index && s.executionId === snapshot.executionId)
        if (!found) {
          throw new RuntimeError(`Invalid snapshot: no snapshot with index ${snapshot.index} found in current run`, sourceCodeInfo)
        }
        settled = true
        outcome = { kind: 'throw', error: new ResumeFromSignal(found.continuation, fromJS(value), found.index) }
      },
      halt: (value: unknown = null) => {
        assertNotSettled('halt')
        // halt() returns a value to the host — keep as plain JS, don't convert to PV/PM
        outcome = {
          kind: 'throw',
          error: new HaltSignal(
            value as Any,
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
        throw new RuntimeError(`Effect handler for '${effectName}' did not call resume(), fail(), suspend(), halt(), or next()`, sourceCodeInfo)
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
          throw new RuntimeError(`Effect handler for '${effectName}' did not call resume(), fail(), suspend(), halt(), or next()`, sourceCodeInfo)
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

function throwSuspension(k: ContinuationStack, meta?: unknown, effectName?: string, effectArg?: unknown): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- SuspensionSignal is a signaling mechanism, not an error
  throw new SuspensionSignal(k, [], 0, meta, effectName, effectArg as Any)
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
  outerK: ContinuationStack,
  branchCtx: ParallelBranchContext,
  outerSnapshotState?: SnapshotState,
): Promise<RunResult> {
  // The barrier frame sits between the branch and the outer continuation.
  // When the branch completes and its value reaches this frame, it returns
  // a BranchComplete step instead of continuing into outerK.
  const barrierFrame: ParallelBranchBarrierFrame = { type: 'ParallelBranchBarrier', branchCtx }
  const barrierK: ContinuationStack = cons<Frame>(barrierFrame, outerK)
  const initial: Step = { type: 'Eval', node, env, k: barrierK }

  // Thread outer snapshot state into the branch so pre-parallel checkpoints
  // are visible in the branch's timeline. Each branch gets a copy (not reference)
  // to avoid concurrent mutation. The executionId is inherited so resumeFrom()
  // can find pre-parallel snapshots.
  const initialSnapshotState = outerSnapshotState
    ? { snapshots: [...outerSnapshotState.snapshots], nextSnapshotIndex: outerSnapshotState.nextSnapshotIndex }
    : undefined
  return runEffectLoop(
    initial,
    handlers,
    signal,
    initialSnapshotState,
    outerSnapshotState?.maxSnapshots,
    undefined, // deserializeOptions
    outerSnapshotState?.autoCheckpoint,
    undefined, // terminalSnapshot
    undefined, // onNodeEval
    outerSnapshotState?.executionId,
  )
}

/**
 * Legacy branch runner for race (no outerK threading, no barrier frame).
 * Will be removed in Phase 5 when race is unified with parallel.
 */
async function runBranchLegacy(
  node: AstNode,
  env: ContextStack,
  handlers: Handlers | undefined,
  signal: AbortSignal,
): Promise<RunResult> {
  const initial: Step = { type: 'Eval', node, env, k: null }
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
  snapshotState?: SnapshotState,
): Promise<Step> {
  // AbortController for this parallel group — aborted when any branch suspends,
  // which signals remaining effect handlers to auto-suspend via ctx.signal.
  const parallelAbort = new AbortController()
  const effectSignal = signal
    ? combineSignals(signal, parallelAbort.signal)
    : parallelAbort.signal

  // Run all branches concurrently; abort the group when a branch suspends.
  // Each branch gets outerK (the continuation after the parallel) threaded
  // through a BarrierFrame, so checkpoints inside branches capture the full
  // program continuation.
  const branchPromises = branches.map(async (branch, i): Promise<{ index: number; result: RunResult }> => {
    const branchCtx: ParallelBranchContext = {
      branchIndex: i,
      branchCount: branches.length,
      branches,
      env,
      mode: 'parallel',
    }
    const result = await runBranch(branch, env, handlers, effectSignal, k, branchCtx, snapshotState)
    if (result.type === 'suspended') {
      parallelAbort.abort()
    }
    return { index: i, result }
  })
  const results = await Promise.allSettled(branchPromises)

  // Collect outcomes
  const completedBranches: { index: number; value: unknown }[] = []
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
    const resumeK: ContinuationStack = cons<Frame>(parallelResumeFrame, k)

    // Throw SuspensionSignal with the first suspended branch's meta and effect info
    const firstSuspended = suspendedBranches[0]!
    return throwSuspension(resumeK, firstSuspended.snapshot.meta, firstSuspended.snapshot.effectName, firstSuspended.snapshot.effectArg)
  }

  // All branches completed — build the result array in original order
  const resultMutable: unknown[] = Array.from({ length: branches.length })
  for (const { index, value } of completedBranches) {
    resultMutable[index] = value
  }
  return { type: 'Value', value: PersistentVector.from(resultMutable as Any[]), k }
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
    let winnerValue: unknown = null

    // Run all branches concurrently, tracking completion order
    const branchPromises = branches.map(async (branch, i) => {
      const branchSignal = branchControllers[i]!.signal
      const result = await runBranchLegacy(branch, env, handlers, branchSignal)

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
      return { type: 'Value', value: winnerValue as Any, k }
    }

    // No completed branch — collect suspended and errored
    const suspendedMetas: unknown[] = []
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
      const raceMeta: Any = toAny({ type: 'race', branches: suspendedMetas })
      throwSuspension(k, raceMeta)
    }

    // All branches errored — throw aggregate error
    const messages = errors.map(e => e.message).join('; ')
    throw new RuntimeError(`race: all branches failed: ${messages}`, undefined)
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
    const resumeK: ContinuationStack = cons<Frame>(parallelResumeFrame, k)
    return throwSuspension(resumeK, nextSuspended.snapshot.meta, nextSuspended.snapshot.effectName, nextSuspended.snapshot.effectArg)
  }

  // All branches now completed — build the result array in original order
  const resultMutable: unknown[] = Array.from({ length: branchCount })
  for (const { index, value: v } of updatedCompleted) {
    resultMutable[index] = v
  }
  return { type: 'Value', value: PersistentVector.from(resultMutable as Any[]), k }
}

function applyEvalArgs(frame: EvalArgsFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { node, env } = frame
  const argNodes = node[1][1]
  const currentArgNode = argNodes[frame.index]!

  // Process the completed value — build new immutable params
  let newParams: Arr
  if (isSpreadNode(currentArgNode)) {
    if (!isPersistentVector(value) && !Array.isArray(value)) {
      throw new TypeError(`Spread operator requires an array, got ${valueToString(value)}`, env.resolve(currentArgNode[2]))
    }
    let acc = frame.params
    for (const item of value as Iterable<Any>) acc = acc.append(item)
    newParams = acc
  } else {
    newParams = frame.params.append(value)
  }

  // Find the next real argument (skip placeholders).
  // Copy placeholders array before appending — required for multi-shot safety since
  // frame.placeholders must remain unchanged if this frame is in a captured continuation.
  const placeholders = [...frame.placeholders]
  let nextIndex = frame.index + 1
  while (nextIndex < argNodes.length) {
    const nextArg = argNodes[nextIndex]!
    if (nextArg[0] === NodeTypes.Reserved && nextArg[1] === '_') {
      placeholders.push(newParams.size)
      nextIndex++
    } else {
      break
    }
  }

  if (nextIndex >= argNodes.length) {
    // All args evaluated — dispatch the call
    return dispatchCall({ ...frame, params: newParams, placeholders, index: nextIndex }, k)
  }

  // Evaluate next argument
  const newFrame: EvalArgsFrame = { ...frame, params: newParams, placeholders, index: nextIndex }
  const nextArg = argNodes[nextIndex]!
  if (isSpreadNode(nextArg)) {
    return { type: 'Eval', node: nextArg[1], env, k: cons<Frame>(newFrame, k) }
  }
  return { type: 'Eval', node: nextArg, env, k: cons<Frame>(newFrame, k) }
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
  return { type: 'Eval', node: bodyNodes[bodyIndex]!, env, k: cons<Frame>(newFrame, k) }
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

  return startBindingSlots(arg, value, bindingEnv, sourceCodeInfo, cons<Frame>(completeFrame, k))
}

/**
 * Handle completion of slot-based binding for a function argument.
 * Merges the binding record into context and continues with next arg.
 */
function applyFnArgSlotComplete(frame: FnArgSlotCompleteFrame, value: Any, k: ContinuationStack): Step {
  const { fn, params, argIndex, nbrOfNonRestArgs, context, outerEnv, sourceCodeInfo } = frame

  // value is the binding record from startBindingSlots
  const record = value as unknown as Record<string, Any>
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
  const record = value as unknown as Record<string, Any>
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
      throw new TypeError(`Missing required argument ${i}`, sourceCodeInfo)
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
    return { type: 'Eval', node: defaultNode, env: bindingEnv, k: cons<Frame>(frame, k) }
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
        record[slot.name] = extractObjectRest(parentValue, slot.restKeys, sourceCodeInfo) as unknown as Any
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
      // Need to evaluate default — push frame and evaluate.
      // Both contexts and record are copied so each resumption starts from the
      // same snapshot (required for multi-shot continuation safety).
      const frame: BindingSlotFrame = {
        type: 'BindingSlot',
        contexts: contexts.map(c => ({ ...c })), // snapshot context stack
        record: { ...record }, // copy accumulated bindings so far
        env,
        sourceCodeInfo,
      }
      return { type: 'Eval', node: slot.defaultNode, env, k: cons<Frame>(frame, k) }
    }

    const resolvedValue = value ?? null

    // Check if this slot has a nested binding target
    if (slot.nestedTarget) {
      // Push a new context for the nested structure
      // The nested target is already stripped of its default (we used the resolved value)
      const nestedSlots = flattenBindingPatternWithoutDefault(slot.nestedTarget)
      validateBindingRootType(slot.nestedTarget, resolvedValue, sourceCodeInfo)
      contexts.push({ slots: nestedSlots, index: 0, rootValue: resolvedValue })
      ctx.index++ // advance parent context past this slot
      continue
    }

    // Simple binding — store the value
    record[slot.name] = resolvedValue
    ctx.index++
  }

  // All contexts done — return the record (cast through unknown since callers re-cast to Record<string, Any>)
  return { type: 'Value', value: record as unknown as Any, k }
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
    validateBindingRootType(slot.nestedTarget, resolvedValue, sourceCodeInfo)
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
        return { type: 'Eval', node: slot.literalNode!, env, k: cons<Frame>(frame, k) }
      }

      case 'rest': {
        // Collect rest values
        if (slot.restKeys !== undefined) {
          // Object rest
          record[slot.name!] = extractMatchObjectRest(ctx.rootValue, slot.path, slot.restKeys) as unknown as Any
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
            return { type: 'Eval', node: slot.defaultNode, env, k: cons<Frame>(frame, k) }
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
    return { type: 'Eval', node: guard, env: guardEnv, k: cons<Frame>(guardFrame, k) }
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
/**
 * Comp iteration — chain to the next function in the composition.
 * Result from previous function is wrapped in array and passed to next.
 */
function applyComp(frame: CompFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { fns, index, env, sourceCodeInfo } = frame
  // Wrap result in array for next function call
  const nextParams: Arr = PersistentVector.from([value])

  if (index < 0) {
    // All functions called, return final result
    return { type: 'Value', value: asAny(value, sourceCodeInfo), k }
  }

  // Call the next function in the chain
  const nextFrame: CompFrame = { type: 'Comp', fns, index: index - 1, env, sourceCodeInfo }
  return dispatchFunction(asFunctionLike(fns.get(index), sourceCodeInfo), nextParams, [], env, sourceCodeInfo, cons<Frame>(nextFrame, k))
}

/**
 * Juxt iteration — collect result and call next function.
 */
function applyJuxt(frame: JuxtFrame, value: Any, k: ContinuationStack): Step | Promise<Step> {
  const { fns, params, index, results, env, sourceCodeInfo } = frame
  // Add result to accumulated array immutably
  const newResults: Arr = results.append(value)

  if (index >= fns.size) {
    // All functions called, return collected results
    return { type: 'Value', value: newResults, k }
  }

  // Call the next function
  const nextFrame: JuxtFrame = { type: 'Juxt', fns, params, index: index + 1, results: newResults, env, sourceCodeInfo }
  return dispatchFunction(asFunctionLike(fns.get(index), sourceCodeInfo), params, [], env, sourceCodeInfo, cons<Frame>(nextFrame, k))
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
  return dispatchFunction(check.fn, PersistentVector.from([check.param]), [], env, sourceCodeInfo, cons<Frame>(nextFrame, k))
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
  return dispatchFunction(check.fn, PersistentVector.from([check.param]), [], env, sourceCodeInfo, cons<Frame>(nextFrame, k))
}

function applyFiniteCheck(frame: FiniteCheckFrame, value: Any, k: ContinuationStack): Step {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ArithmeticError('Number is not finite', frame.sourceCodeInfo)
  }
  // Skip annotate() — PersistentVector is now the native array type (HAMT Phase 1).
  // annotate() would convert PVs to plain arrays, breaking assertSeq/assertColl.
  return { type: 'Value', value, k }
}

// ---------------------------------------------------------------------------
// Macro expansion
// ---------------------------------------------------------------------------

/**
 * Call a macro. Named macros (with a qualifiedName) emit @dvala.macro.expand
 * so the host can intercept expansion. Anonymous macros are called directly
 * with no effect overhead.
 */
function callMacro(
  macroFn: MacroFunction,
  argNodes: AstNode[],
  env: ContextStack,
  sourceCodeInfo: SourceCodeInfo | undefined,
  k: ContinuationStack,
): Step {
  // Guard against infinite macro expansion by counting MacroEvalFrame instances on the stack
  let depth = 0
  let macroCheckNode = k
  while (macroCheckNode !== null) {
    const frame = macroCheckNode.head
    macroCheckNode = macroCheckNode.tail
    if (frame.type === 'MacroEval') {
      depth += 1
      if (depth >= MAX_MACRO_EXPANSION_DEPTH) {
        throw new MacroError(
          `Maximum macro expansion depth (${MAX_MACRO_EXPANSION_DEPTH}) exceeded. Possible infinite macro expansion.`,
          sourceCodeInfo,
        )
      }
    }
  }

  // MacroEvalFrame evaluates the expanded AST in the calling scope
  const macroEvalFrame: MacroEvalFrame = {
    type: 'MacroEval',
    env,
    sourceCodeInfo,
  }

  // Anonymous macros — call directly, no effect, no host visibility
  if (!macroFn.qualifiedName) {
    // Convert each AST node (plain array) to PV so macro bodies can use Dvala builtins
    // like first(), get(), etc. on the received arguments.
    return setupUserDefinedCall(
      macroFn as unknown as UserDefinedFunction,
      PersistentVector.from(argNodes.map(arg => fromJS(arg as unknown as Any))) as unknown as Arr,
      env,
      sourceCodeInfo,
      cons<Frame>(macroEvalFrame, k),
    )
  }

  // Named macros — emit @dvala.macro.expand so the host can intercept.
  // The effect arg is a Dvala PM with fn (the macro) and args (PV of PV-converted AST nodes).
  // We use fromJS so that Dvala handlers can use get(arg, "fn"), get(arg, "args") etc.
  const payload = fromJS({ fn: macroFn, args: argNodes })

  return {
    type: 'Perform',
    effect: getEffectRef('dvala.macro.expand'),
    arg: payload,
    k: cons<Frame>(macroEvalFrame, k),
    sourceCodeInfo,
  }
}

/**
 * After a macro function returns a value (the new AST), evaluate it
 * in the original calling scope.
 */
function applyMacroEval(frame: MacroEvalFrame, value: Any, k: ContinuationStack): Step {
  // After expansion: the frame is a pass-through marker — just return the value.
  if (frame.expanded) {
    return { type: 'Value', value, k }
  }
  // If the value is not a valid AST node (not an array), it came from an error handler
  // recovery path — pass it through as the result instead of trying to evaluate it as AST.
  // This fixes macro error propagation: when an error during macro expansion is caught
  // by a handler, the handler's return value flows back through this frame. Without this
  // check, the frame would try to evaluate a non-AST value (e.g. a string or error object),
  // producing a secondary "M-node cannot be evaluated" error that masks the original.
  if (!Array.isArray(value) && !isPersistentVector(value)) {
    return { type: 'Value', value, k }
  }
  // The macro returned a value — it should be AST data (an array).
  // Evaluate it as an AST node in the calling scope.
  // Keep the MacroEvalFrame on the stack (marked as expanded) so that errors
  // from the expanded code can find the macro call site for better error locations.
  const marker: MacroEvalFrame = { type: 'MacroEval', env: frame.env, sourceCodeInfo: frame.sourceCodeInfo, expanded: true }
  // Dispatch auto-converts plain arrays to PV; convert back to plain array for stepNode.
  const astNode = (isPersistentVector(value) ? toJS(value as Any) : value) as AstNode
  return { type: 'Eval', node: astNode, env: frame.env, k: cons<Frame>(marker, k) }
}

// ---------------------------------------------------------------------------
// Code template evaluation
// ---------------------------------------------------------------------------

/**
 * Handle a completed splice expression evaluation in a code template.
 * Collect the value, evaluate the next splice, or assemble the final AST data.
 */
function applyCodeTemplateBuild(frame: CodeTemplateBuildFrame, value: Any, k: ContinuationStack): Step {
  // Build new frame instead of mutating — required for multi-shot continuation safety.
  const nextValues = [...frame.values, value]
  const nextIndex = frame.index + 1

  // More splices to evaluate
  if (nextIndex < frame.spliceExprs.length) {
    const newFrame: CodeTemplateBuildFrame = { ...frame, values: nextValues, index: nextIndex }
    return { type: 'Eval', node: frame.spliceExprs[nextIndex]!, env: frame.env, k: cons<Frame>(newFrame, k) }
  }

  // All splices evaluated — assemble the AST data with hygiene renames
  const result = frame.bodyAst.length === 1
    ? astToData(frame.bodyAst[0]!, nextValues, frame.renameMap)
    : frame.bodyAst.map(n => astToData(n, nextValues, frame.renameMap))
  return { type: 'Value', value: toAny(result), k }
}

// ---------------------------------------------------------------------------
// Hygiene — automatic gensym for literal bindings in code templates
// ---------------------------------------------------------------------------

let gensymCounter = 0

/** Generate a unique symbol name that won't collide with user code. */
function gensym(name: string): string {
  return `__gensym_${name}_${gensymCounter++}__`
}

/**
 * Build a rename map for literal binding names in template AST.
 * Walks the AST collecting symbol names from binding positions
 * (Let targets, Function params), skipping Splice nodes.
 */
function buildRenameMap(nodes: AstNode[]): Map<string, string> {
  const names = new Set<string>()
  for (const node of nodes) {
    collectBindingNames(node, names)
  }
  const renameMap = new Map<string, string>()
  for (const name of names) {
    renameMap.set(name, gensym(name))
  }
  return renameMap
}

/** Recursively collect symbol names from binding positions in an AST node. */
function collectBindingNames(node: AstNode, names: Set<string>): void {
  const [type, payload] = node

  // Skip splice nodes — their content comes from the caller
  if (type === NodeTypes.Splice) return

  switch (type) {
    case NodeTypes.Let: {
      // ["Let", [bindingTarget, valueNode], id]
      const [target, value] = payload as [unknown[], AstNode]
      collectBindingTargetNames(target, names)
      collectBindingNames(value, names)
      break
    }
    case NodeTypes.Function:
    case NodeTypes.Macro: {
      // ["Function", [params[], bodyExprs[]], id]
      const [params, bodyExprs] = payload as [unknown[][], AstNode[]]
      for (const param of params) {
        collectBindingTargetNames(param, names)
      }
      for (const expr of bodyExprs) {
        collectBindingNames(expr, names)
      }
      break
    }
    default: {
      // Recurse into array payloads to find nested Let/Function nodes
      if (Array.isArray(payload)) {
        for (const item of payload) {
          if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'string') {
            collectBindingNames(item as AstNode, names)
          } else if (Array.isArray(item)) {
            // Plain array — recurse into elements looking for AST nodes
            for (const inner of item) {
              if (Array.isArray(inner) && inner.length >= 2 && typeof inner[0] === 'string') {
                collectBindingNames(inner as AstNode, names)
              }
            }
          }
        }
      }
    }
  }
}

/** Extract symbol names from a binding target structure. */
function collectBindingTargetNames(target: unknown[], names: Set<string>): void {
  const targetType = target[0] as string
  const targetPayload = target[1] as unknown[]

  switch (targetType) {
    case 'symbol': {
      // ["symbol", [["Sym", name, id], default], id]
      const symNode = targetPayload[0] as unknown[]
      if (Array.isArray(symNode) && symNode[0] === NodeTypes.Sym) {
        names.add(symNode[1] as string)
      }
      break
    }
    case 'rest': {
      // ["rest", [name, default], id]
      names.add(targetPayload[0] as string)
      break
    }
    case 'array': {
      // ["array", [targets[], default], id]
      const targets = targetPayload[0] as unknown[][]
      for (const t of targets) {
        if (t) collectBindingTargetNames(t, names)
      }
      break
    }
    case 'object': {
      // ["object", [record, default], id]
      const record = targetPayload[0] as Record<string, unknown[]>
      for (const t of Object.values(record)) {
        collectBindingTargetNames(t, names)
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// AST to data conversion (with hygiene)
// ---------------------------------------------------------------------------

/**
 * Convert a pre-parsed AST node into Dvala data (arrays and primitives).
 * Splice nodes are replaced with the corresponding evaluated value.
 * Literal Sym nodes matching the rename map are gensymed for hygiene.
 *
 * The result mirrors the AST node format: [type, payload, nodeId].
 * This is what macros receive and construct — plain Dvala data.
 */
function astToData(node: AstNode, spliceValues: Any[], renameMap?: Map<string, string>): Any {
  const [type, payload] = node

  // Splice node — insert the evaluated value directly (no renaming).
  // If the splice value is a PV (user Dvala array used as AST data), convert to plain array
  // so nested structures remain plain-array AST nodes instead of PV.
  if (type === NodeTypes.Splice) {
    const sv = spliceValues[payload as number]!
    return isPersistentVector(sv) ? toAny(toJS(sv as Any)) : sv
  }

  // InlinedData — already-resolved data from an outer template splice. Pass through as-is,
  // but convert PV to plain array so the result is valid AST data.
  if (type === NodeTypes.InlinedData) {
    const inlined = payload as Any
    return isPersistentVector(inlined) ? toAny(toJS(inlined)) : inlined
  }

  // Rename literal Sym nodes for hygiene
  if (type === NodeTypes.Sym && renameMap && typeof payload === 'string') {
    const renamed = renameMap.get(payload)
    if (renamed) {
      return toAny([type, renamed, -1])
    }
  }

  // Use nodeId -1 for all generated nodes — code template AST is synthetic data.
  // Must not collide with real source map nodeIds (which start at 0).
  // Leaf nodes with primitive payloads — return as data tuple
  if (!Array.isArray(payload)) {
    return toAny([type, payload, -1])
  }

  // CodeTmpl nodes contain both inner splices (indices 0..N-1, for the inner template)
  // and outer splices (indices N+, for the outer template, offset by replacePlaceholders).
  // Resolve outer splices, preserve inner splices as-is.
  if (type === NodeTypes.CodeTmpl) {
    const [bodyAst, innerSpliceExprs] = payload as [AstNode[], AstNode[]]
    const innerCount = (innerSpliceExprs as unknown[]).length
    // Convert body AST, resolving outer splices (index >= innerCount) but preserving inner ones
    const convertedBody = bodyAst.map(n => astToDataWithCodeTmplAwareness(n, spliceValues, renameMap, innerCount))
    // Convert inner splice expressions WITH the rename map (hygiene applies to inner
    // scope names like macro parameters) but WITHOUT outer splice values (inner splice
    // expressions don't contain outer splice placeholders).
    const convertedSpliceExprs = innerSpliceExprs.map(e => astToData(e, [], renameMap))
    return toAny([type, [convertedBody, convertedSpliceExprs], -1])
  }

  // Let nodes need special handling: the binding target may contain splices that
  // resolve to Array/Object AST data, which must be converted to binding target format.
  if (type === NodeTypes.Let) {
    const [target, valueNode] = payload as [AstNode, AstNode]
    const convertedValue = astToData(valueNode, spliceValues, renameMap)
    const convertedTarget = convertBindingTarget(target as unknown[], spliceValues, renameMap)
    return toAny([type, [convertedTarget, convertedValue], -1])
  }

  // Recursive: convert array payloads, with implicit spread for splices
  const convertedPayload = convertArrayPayload(payload, spliceValues, renameMap)
  return toAny([type, convertedPayload, -1])
}

/**
 * Like astToData, but aware of inner CodeTmpl splice boundaries.
 * Splice nodes with index < innerCount are inner splices — preserved as data tuples.
 * Splice nodes with index >= innerCount are outer splices — resolved using spliceValues[index - innerCount].
 */
function astToDataWithCodeTmplAwareness(
  node: AstNode, spliceValues: Any[], renameMap: Map<string, string> | undefined, innerCount: number,
): Any {
  const [type, payload] = node

  if (type === NodeTypes.Splice) {
    const index = payload as number
    if (index < innerCount) {
      // Inner splice — preserve as data tuple for the inner template to resolve
      return toAny([type, index, -1])
    }
    // Outer splice — resolve with adjusted index, wrapped in InlinedData to prevent double conversion
    return toAny([NodeTypes.InlinedData, spliceValues[index - innerCount]!, -1])
  }

  // For everything else, delegate to standard astToData but with inner-awareness for nested arrays
  if (type === NodeTypes.Sym && renameMap && typeof payload === 'string') {
    const renamed = renameMap.get(payload)
    if (renamed) {
      return toAny([type, renamed, -1])
    }
  }

  if (!Array.isArray(payload)) {
    return toAny([type, payload, -1])
  }

  // Recurse into array payloads, maintaining inner-awareness for Splice nodes
  const result: Any[] = []
  for (const item of payload) {
    if (!Array.isArray(item)) {
      if (typeof item === 'string' && renameMap) {
        const renamed = renameMap.get(item)
        result.push((renamed ?? item) as Any)
      } else {
        result.push(item as Any)
      }
      continue
    }
    if (item.length >= 2 && item[0] === NodeTypes.Splice) {
      const spliceIndex = item[1] as number
      if (spliceIndex < innerCount) {
        result.push(toAny([NodeTypes.Splice, spliceIndex, -1]))
      } else {
        const spliceValue = spliceValues[spliceIndex - innerCount]!
        // Wrap in InlinedData to prevent double conversion
        result.push(toAny([NodeTypes.InlinedData, spliceValue, -1]))
      }
    } else if (item.length >= 2 && typeof item[0] === 'string') {
      result.push(astToDataWithCodeTmplAwareness(item as AstNode, spliceValues, renameMap, innerCount))
    } else {
      result.push(toAny(item.map((sub: unknown) =>
        Array.isArray(sub) ? astToDataWithCodeTmplAwareness(sub as AstNode, spliceValues, renameMap, innerCount) : sub,
      )))
    }
  }
  return toAny([type, result, -1])
}

/**
 * Convert a binding target from template AST, handling splices that resolve to
 * Array/Object AST data by converting them to proper binding target format.
 *
 * When a splice inside a symbol binding target resolves to an Array or Object AST node,
 * the target is restructured into the corresponding array/object binding target.
 */
function convertBindingTarget(target: unknown[], spliceValues: Any[], renameMap?: Map<string, string>): Any {
  const [targetType, targetPayload] = target as [string, unknown]

  // Symbol binding target: ["symbol", [nameNode, default], id]
  // This is where splices land — check if the name resolved to a non-Sym AST
  if (targetType === 'symbol' && Array.isArray(targetPayload)) {
    const [nameNode, defaultNode] = targetPayload as [AstNode, AstNode | null | undefined]

    // Resolve splice in name position
    let resolvedName: Any
    if (Array.isArray(nameNode) && nameNode[0] === NodeTypes.Splice) {
      resolvedName = spliceValues[nameNode[1] as number]!
    } else {
      resolvedName = astToData(nameNode, spliceValues, renameMap)
    }

    // Splice values may be PV (macro args are now PV-converted AST nodes); convert to plain array
    if (isPersistentVector(resolvedName))
      resolvedName = toJS(resolvedName as Any) as Any

    const convertedDefault = defaultNode ? astToData(defaultNode, spliceValues, renameMap) : null

    // If the splice resolved to a Sym node, keep as symbol binding target
    if (Array.isArray(resolvedName) && resolvedName[0] === NodeTypes.Sym) {
      return toAny(['symbol', [resolvedName, convertedDefault], -1])
    }

    // If it resolved to an Array AST → convert to array binding target
    if (Array.isArray(resolvedName) && resolvedName[0] === NodeTypes.Array) {
      const elements = resolvedName[1] as Any[]
      const targets = elements.map((elem: Any) => expressionAstToBindingTarget(elem))
      return toAny(['array', [targets, convertedDefault], -1])
    }

    // If it resolved to an Object AST → convert to object binding target
    if (Array.isArray(resolvedName) && resolvedName[0] === NodeTypes.Object) {
      const entries = resolvedName[1] as unknown as Any[][]
      const record: Record<string, Any> = {}
      for (const entry of entries) {
        // Object entries are [keyNode, valueNode] pairs
        const keyNode = entry[0] as unknown as Any[]
        const valNode = entry[1] as Any
        // Key is typically a Str or Sym node — extract the name
        const key = keyNode[1] as string
        record[key] = expressionAstToBindingTarget(valNode)
      }
      return toAny(['object', [record, convertedDefault], -1])
    }

    // Fallback: return as-is (will error at evaluation time if invalid)
    return toAny(['symbol', [resolvedName, convertedDefault], -1])
  }

  // Array binding target: ["array", [targets[], default], id] — recurse into nested targets
  if (targetType === 'array' && Array.isArray(targetPayload)) {
    const [targets, defaultNode] = targetPayload as [unknown[], AstNode | null | undefined]
    const convertedTargets = targets.map(t =>
      t === null ? null : convertBindingTarget(t as AstNode, spliceValues, renameMap),
    )
    const convertedDefault = defaultNode ? astToData(defaultNode, spliceValues, renameMap) : null
    return toAny(['array', [convertedTargets, convertedDefault], -1])
  }

  // Object binding target: ["object", [record, default], id] — recurse into nested targets
  if (targetType === 'object' && Array.isArray(targetPayload)) {
    const [record, defaultNode] = targetPayload as [Record<string, unknown>, AstNode | null | undefined]
    const convertedRecord: Record<string, Any> = {}
    for (const [key, value] of Object.entries(record)) {
      convertedRecord[key] = convertBindingTarget(value as AstNode, spliceValues, renameMap)
    }
    const convertedDefault = defaultNode ? astToData(defaultNode, spliceValues, renameMap) : null
    return toAny(['object', [convertedRecord, convertedDefault], -1])
  }

  // Rest, literal, wildcard, or other — convert generically
  if (Array.isArray(targetPayload)) {
    return toAny([targetType, convertArrayPayload(targetPayload, spliceValues, renameMap), -1])
  }
  return toAny([targetType, targetPayload, -1])
}

/**
 * Convert an expression AST node (Dvala data) to a binding target (Dvala data).
 * Used when a splice in binding position resolves to a complex expression.
 */
function expressionAstToBindingTarget(astData: Any): Any {
  if (!Array.isArray(astData)) return astData

  const node = astData as Any[]
  const nodeType = node[0]

  // Sym → symbol binding target
  if (nodeType === NodeTypes.Sym) {
    return toAny(['symbol', [astData, null], -1])
  }

  // Array → array binding target (recurse into elements)
  if (nodeType === NodeTypes.Array) {
    const elements = node[1] as unknown as Any[]
    const targets = elements.map((elem: Any) => expressionAstToBindingTarget(elem))
    return toAny(['array', [targets, null], -1])
  }

  // Object → object binding target (recurse into entries)
  if (nodeType === NodeTypes.Object) {
    const entries = node[1] as unknown as Any[][]
    const record: Record<string, Any> = {}
    for (const entry of entries) {
      const keyNode = entry[0] as unknown as Any[]
      const valNode = entry[1] as Any
      const key = keyNode[1] as string
      record[key] = expressionAstToBindingTarget(valNode)
    }
    return toAny(['object', [record, null], -1])
  }

  // Spread → rest binding target
  if (nodeType === NodeTypes.Spread) {
    const inner = node[1] as unknown as Any[]
    const name = inner[1] as string
    return toAny(['rest', [name, null], 0])
  }

  // Anything else (number, string literal) → literal binding target
  return toAny(['literal', [astData], 0])
}

/**
 * Convert an array payload, handling implicit spread for Splice nodes.
 *
 * When a Splice node's value is an array of AST nodes (first element is an array),
 * the nodes are spread into the parent array. When it's a single AST node
 * (first element is a string), it's inserted as-is.
 */
function convertArrayPayload(items: unknown[], spliceValues: Any[], renameMap?: Map<string, string>): Any[] {
  const result: Any[] = []
  for (const item of items) {
    if (!Array.isArray(item)) {
      // Rename plain string values in binding targets (e.g. rest param names)
      if (typeof item === 'string' && renameMap) {
        const renamed = renameMap.get(item)
        result.push((renamed ?? item) as Any)
      } else {
        result.push(item as Any)
      }
      continue
    }
    // Check if this is a Splice node
    if (item.length >= 2 && item[0] === NodeTypes.Splice) {
      const spliceValue = spliceValues[item[1] as number]!
      // Implicit spread: if value is an array/PV of AST nodes, spread them in
      if (isSpliceSpread(spliceValue)) {
        for (const spreadItem of spliceValue as unknown as Iterable<Any>) {
          // Convert PV AST nodes to plain arrays
          result.push(isPersistentVector(spreadItem) ? toAny(toJS(spreadItem as Any)) : spreadItem)
        }
      } else {
        // Convert PV AST node to plain array
        result.push(isPersistentVector(spliceValue) ? toAny(toJS(spliceValue as Any)) : spliceValue)
      }
    } else if (item.length >= 2 && typeof item[0] === 'string') {
      // Regular AST node — recurse
      result.push(astToData(item as AstNode, spliceValues, renameMap))
    } else {
      // Plain array — recurse into elements
      result.push(toAny(convertArrayPayload(item as unknown[], spliceValues, renameMap)))
    }
  }
  return result
}

/**
 * Detect whether a splice value should be spread (array of AST nodes)
 * or inserted as-is (single AST node or non-AST value).
 *
 * An array/PV of AST nodes starts with an array/PV: [[type, payload, id], ...]
 * A single AST node starts with a string: [type, payload, id]
 */
function isSpliceSpread(value: Any): boolean {
  // PV (HAMT Phase 1 user array) — spread if first element is also array/PV (list of AST nodes)
  if (isPersistentVector(value)) {
    if (value.size === 0) return false
    const first = value.get(0)
    return isPersistentVector(first) || Array.isArray(first)
  }
  if (!Array.isArray(value) || value.length === 0) return false
  return Array.isArray(value[0]) || isPersistentVector(value[0])
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
      // Accept both PersistentVector (new) and plain JS arrays (legacy module returns)
      if (typeof v === 'string' || isPersistentVector(v) || Array.isArray(v) || isObj(v)) {
        return v
      }
      throw new TypeError(`Expected collection, got ${valueToString(v)}`, s)
    },
    isSeq: (v: Any) => typeof v === 'string' || isPersistentVector(v) || Array.isArray(v),
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
        if (step.k === null) {
          return step // Terminal state — program is complete
        }
        return applyFrame(step.k.head, step.value, step.k.tail)
      }
      case 'Eval': {
        const { node, env, k } = step
        if (snapshotState?.onNodeEval) {
          // Skip structural leaf nodes — symbol/builtin/special/reserved lookups and effect refs
          // are always covered whenever their parent expression is covered, so they add no useful
          // information for coverage or debugging.
          const t = node[0]
          const isStructuralLeaf = t === NodeTypes.Sym || t === NodeTypes.Builtin || t === NodeTypes.Special || t === NodeTypes.Reserved || t === NodeTypes.Effect
          // Lazy — only allocate the Continuation object if the hook actually calls getContinuation().
          if (!isStructuralLeaf) {
            const result = snapshotState.onNodeEval(node, () => ({
              env,
              k,
              resume: () => {},
              getSnapshots: () => [...snapshotState.snapshots],
            }))
            if (result instanceof Promise) {
              return result.then(() => stepNode(node, env, k))
            }
          }
        }
        return stepNode(node, env, k)
      }
      case 'Apply':
        return applyFrame(step.frame, step.value, step.k)
      case 'Perform':
        return dispatchPerform(step.effect, step.arg, step.k, step.sourceCodeInfo, handlers, signal, snapshotState)
      case 'Parallel':
        return executeParallelBranches(step.branches, step.env, step.k, handlers, signal, snapshotState)
      case 'Race':
        return executeRaceBranches(step.branches, step.env, step.k, handlers, signal)
      case 'ParallelResume':
        return handleParallelResume(step, handlers, signal)
      case 'BranchComplete':
        // This step should be caught by runEffectLoop, not processed by tick.
        // If we reach here, something is wrong — the branch trampoline didn't
        // intercept the BranchComplete step.
        return step
      case 'Error': {
        const patchedError = patchErrorWithMacroCallSite(step.error, step.k)
        const effectStep = tryDispatchDvalaError(patchedError, step.k)
        if (effectStep) {
          return effectStep
        }

        patchedError.attachCallStack(reconstructCallStack(step.k))
        throw patchedError
      }
    }
  } catch (error) {
    // SuspensionSignal and HaltSignal must propagate out of tick to the effect trampoline loop
    // (runEffectLoop).
    if (isSuspensionSignal(error) || isHaltSignal(error)) {

      throw error
    }
    // Route DvalaError through the 'dvala.error' algebraic effect so that
    // algebraic handlers can intercept runtime errors.
    if (error instanceof DvalaError) {
      // For Value steps, step.k[0] is the frame that was being applied when
      // the error was thrown (e.g. LetDestructFrame, etc.).
      // Strip it so that resumeK in tryDispatchDvalaError does not include
      // the failing frame — otherwise the handler's return value would flow
      // back through it, potentially re-triggering the same error in an
      // infinite loop.
      // For Eval/Apply steps, step.k already excludes the frame that caused
      // the error, so no stripping is needed.
      // BranchComplete steps have no continuation (the branch is done).
      // Errors during BranchComplete should not reach here, but handle
      // gracefully by using null (no handler search possible).
      const kForDispatch = step.type === 'BranchComplete'
        ? null
        : step.type === 'Value'
          ? step.k?.tail ?? null
          : step.k

      // If the error has no source location and we're inside a macro expansion,
      // patch it with the macro call site so error messages are meaningful.
      const patchedError = patchErrorWithMacroCallSite(error, kForDispatch)

      const effectStep = tryDispatchDvalaError(patchedError, kForDispatch)
      if (effectStep) return effectStep

      // No local handler matched — check if host handlers can intercept dvala.error.
      // Convert the runtime error to perform(@dvala.error, msg) so dispatchPerform
      // can route it to host handlers.
      // Skip when the error is already a UserError (from unhandled @dvala.error)
      // to prevent infinite re-dispatch: host handler calls next() → unhandled →
      // UserError → re-dispatch to same host handler → loop.
      if (!(patchedError instanceof UserError) && handlers && findMatchingHandlers('dvala.error', handlers).length > 0) {
        const effect = getEffectRef('dvala.error')
        const arg: Any = buildErrorPayload(patchedError)
        return { type: 'Perform', effect, arg, k: kForDispatch, sourceCodeInfo: patchedError.sourceCodeInfo }
      }
      // No handler matched — attach call stack and re-throw.
      patchedError.attachCallStack(reconstructCallStack(kForDispatch))
      throw patchedError
    }
    // Non-DvalaError — re-throw as-is.
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
      throw new RuntimeError('Unexpected async operation in synchronous context.', undefined)
    }
    if (step.type === 'Value' && step.k === null) {
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
    if (step.type === 'Value' && step.k === null) {
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
    return { type: 'Value', value: null, k: null }
  }
  if (nodes.length === 1) {
    return { type: 'Eval', node: nodes[0]!, env, k: null }
  }
  const sequenceFrame: SequenceFrame = {
    type: 'Sequence',
    nodes,
    index: 1,
    env,
  }
  return { type: 'Eval', node: nodes[0]!, env, k: cons<Frame>(sequenceFrame, null) }
}

/**
 * Merge an AST's source map into the context stack's accumulated source map.
 * With global node IDs, each AST's positions are at non-overlapping indices,
 * so we just copy positions and add new source entries.
 */
function mergeSourceMap(contextStack: ContextStack, sourceMap: SourceMap | undefined): void {
  if (!sourceMap) return
  // Skip if already the same object (e.g. when createDvala shares the accumulated
  // sourceMap with both the AST and the context stack)
  if (sourceMap === contextStack.sourceMap) return
  if (!contextStack.sourceMap) {
    contextStack.sourceMap = { sources: [...sourceMap.sources], positions: new Map(sourceMap.positions) }
    return
  }
  // Merge sources: offset source indices in new positions
  const sourceOffset = contextStack.sourceMap.sources.length
  contextStack.sourceMap.sources.push(...sourceMap.sources)
  // Copy positions with adjusted source index
  for (const [nodeId, pos] of sourceMap.positions) {
    contextStack.sourceMap.positions.set(nodeId, {
      ...pos,
      source: pos.source + sourceOffset,
    })
  }
}

/**
 * Evaluate an AST using the trampoline.
 * Returns the final value synchronously, or a Promise if async operations
 * are involved (e.g., native JS functions returning Promises).
 */
export function evaluate(ast: Ast, contextStack: ContextStack): MaybePromise<Any> {
  mergeSourceMap(contextStack, ast.sourceMap)
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
  mergeSourceMap(contextStack, ast.sourceMap)
  const initial = buildInitialStep(ast.body, contextStack)
  return runAsyncTrampoline(initial)
}

/**
 * Evaluate a single AST node using the trampoline.
 * Used as the `evaluateNode` callback passed to `getUndefinedSymbols`
 * and other utilities.
 */
export function evaluateNode(node: AstNode, contextStack: ContextStack): MaybePromise<Any> {
  const initial: Step = { type: 'Eval', node, env: contextStack, k: null }
  try {
    return runSyncTrampoline(initial)
  } catch (error) {
    if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
      const freshInitial: Step = { type: 'Eval', node, env: contextStack, k: null }
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
  onNodeEval?: SnapshotState['onNodeEval'],
): Promise<RunResult> {
  mergeSourceMap(contextStack, ast.sourceMap)
  const abortController = new AbortController()
  const signal = abortController.signal
  const initial = buildInitialStep(ast.body, contextStack)

  return runEffectLoop(initial, handlers, signal, undefined, maxSnapshots, deserializeOptions, autoCheckpoint, terminalSnapshot, onNodeEval)
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
  mergeSourceMap(contextStack, ast.sourceMap)
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
  const initial: Step = { type: 'Value', value, k }

  return continueWithEffects(initial, handlers, initialSnapshotState, deserializeOptions)
}

export async function continueWithEffects(
  initial: Step,
  handlers?: Handlers,
  initialSnapshotState?: { snapshots: Snapshot[]; nextSnapshotIndex: number; maxSnapshots?: number; autoCheckpoint?: boolean },
  deserializeOptions?: DeserializeOptions,
  terminalSnapshot?: boolean,
): Promise<RunResult> {
  const abortController = new AbortController()
  const signal = abortController.signal

  return runEffectLoop(initial, handlers, signal, initialSnapshotState, initialSnapshotState?.maxSnapshots, deserializeOptions, initialSnapshotState?.autoCheckpoint, terminalSnapshot)
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
  currentEffectArgs: unknown,
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
        dispatchHostHandler(currentEffectName, currentMatchingHandlers, currentEffectArgs as Arr, null, effectSignal, undefined, snapshotState),
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
    const resumeK: ContinuationStack = cons<Frame>(newFrame, outerK)
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
  const resultMutable: unknown[] = Array.from({ length: branchCount })
  for (const { index, value } of newCompleted) {
    resultMutable[index] = value
  }

  return runEffectLoop(
    { type: 'Value', value: PersistentVector.from(resultMutable), k: outerK },
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
  effectArg: unknown,
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
  if (k !== null && k.head.type === 'ParallelResume') {
    return retriggerParallelGroup(
      k.head,
      k.tail,
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
  onNodeEval?: SnapshotState['onNodeEval'],
  inheritedExecutionId?: string,
): Promise<RunResult> {
  const snapshotState: SnapshotState = {
    snapshots: initialSnapshotState ? initialSnapshotState.snapshots : [],
    nextSnapshotIndex: initialSnapshotState ? initialSnapshotState.nextSnapshotIndex : 0,
    // Branches inherit the outer executionId so resumeFrom() can find
    // pre-parallel snapshots. Fresh UUID for top-level runs.
    executionId: inheritedExecutionId ?? generateUUID(),
    ...(maxSnapshots !== undefined ? { maxSnapshots } : {}),
    ...(autoCheckpoint ? { autoCheckpoint } : {}),
    ...(terminalSnapshot ? { terminalSnapshot } : {}),
    ...(onNodeEval ? { onNodeEval } : {}),
  }

  // Capture a snapshot at program start so time travel can rewind to the very beginning.
  if (snapshotState.autoCheckpoint) {
    const continuation = serializeToObject(
      initial.type === 'Eval' ? initial.k : null,
      undefined,
      initial.type === 'Eval' ? initial : undefined,
    )
    snapshotState.snapshots.push(createSnapshot({
      continuation,
      timestamp: Date.now(),
      index: snapshotState.nextSnapshotIndex++,
      executionId: snapshotState.executionId,
      message: 'Program start',
    }))
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
    let meta: Obj = PersistentMap.empty()
    if (options?.error) {
      meta = meta.assoc('error', toAny(options.error.toJSON()))
    }
    if (options?.halted) {
      meta = meta.assoc('halted', true)
    }
    if (options?.result !== undefined) {
      meta = meta.assoc('result', options.result)
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
      // Convert meta PM to plain JS so it's directly accessible as a record
      ...(meta.size > 0 ? { meta: toJS(meta as Any) } : {}),
    })
  }

  // Periodically yield to the event loop so that timeouts, UI updates, and
  // other macrotasks can run even during long pure-computation loops.
  const YIELD_INTERVAL = 10_000
  let tickCount = 0

  for (;;) {
    try {
      for (;;) {
        if (step instanceof Promise) {
          step = await step
          tickCount = 0
        }
        if (step.type === 'Value' && step.k === null) {
          const snapshot = createTerminalSnapshot({ result: step.value })
          return snapshot
            ? { type: 'completed', value: step.value, snapshot }
            : { type: 'completed', value: step.value }
        }

        // BranchComplete — a parallel branch finished and hit its BarrierFrame.
        // Return as a completed result without flowing into outerK.
        if (step.type === 'BranchComplete') {
          return { type: 'completed', value: step.value }
        }

        step = tick(step, handlers, signal, snapshotState)

        // Yield every YIELD_INTERVAL ticks to keep the event loop responsive
        if (++tickCount >= YIELD_INTERVAL) {
          tickCount = 0
          await new Promise<void>(resolve => setTimeout(resolve, 0))
        }
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
