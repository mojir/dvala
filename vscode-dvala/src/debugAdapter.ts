/**
 * Dvala Debug Adapter — translates between DAP and the core Debugger controller.
 *
 * Runs as a standalone Node.js process communicating with VS Code over stdio.
 * Uses `@vscode/debugadapter` as the protocol layer and the Dvala `Debugger`
 * class (from src/debugger/Debugger.ts) as the runtime backend.
 */

import { appendFileSync } from 'node:fs'
import * as path from 'node:path'
import { DebugSession, InitializedEvent, OutputEvent, StoppedEvent, TerminatedEvent } from '@vscode/debugadapter'
import type { DebugProtocol } from '@vscode/debugprotocol'
import { stringifyValue } from '../../common/utils'
import { allBuiltinModules } from '../../src/allModules'
import { bundle } from '../../src/bundler'
import { createDvala } from '../../src/createDvala'
import { Debugger } from '../../src/debugger/Debugger'
import type { DebugStoppedEvent } from '../../src/debugger/Debugger'
import { findNodeIdForLine, getNodeEndLine, getNodeFile, getNodeLine } from '../../src/debugger/SourceMapUtils'
import type { ContinuationStack } from '../../src/evaluator/frames'
import type { Continuation, Handlers } from '../../src/evaluator/effectTypes'
import type {
  AstNode,
  BindingTarget,
  DvalaFunction,
  EffectRef,
  HandlerFunction,
  RegularExpression,
  SourceMap,
} from '../../src/parser/types'
import { isEffect, isRegularExpression } from '../../src/typeGuards/dvala'
import { isDvalaFunction } from '../../src/typeGuards/dvalaFunction'
import { toJS } from '../../src/utils/interop'
import { isPersistentMap, isPersistentVector } from '../../src/utils/persistent'

const LOG_FILE = '/tmp/dvala-dap.log'
function log(msg: string): void {
  appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`)
}

// DAP uses a single thread for Dvala (no concurrency)
const THREAD_ID = 1

// Variable reference IDs: 1 = locals scope, 2 = effect handlers scope, 3+ = nested objects/arrays
const LOCALS_REF = 1
const HANDLERS_REF = 2

interface LaunchArgs extends DebugProtocol.LaunchRequestArguments {
  program: string
  stopOnEntry?: boolean
}

class DvalaDebugSession extends DebugSession {
  private dbg: Debugger | null = null
  private currentContinuation: Continuation | null = null
  private currentNode: AstNode | null = null
  private sourceMap: SourceMap | null = null
  private programPath: string = ''
  // Shared Dvala instance for expression evaluation (conditional breakpoints, debug console, hover)
  private evalDvala = createDvala({ modules: allBuiltinModules })
  // For expandable variables: maps variablesReference IDs to JS values or rich Dvala types
  private variableRefs = new Map<number, Record<string, unknown> | unknown[]>()
  private functionRefs = new Map<number, DvalaFunction>()
  private effectRefs = new Map<number, EffectRef>()
  private regexpRefs = new Map<number, RegularExpression>()
  // Location references for "Go to Value Definition" — maps locationRef → {file, line, column}
  private locationRefs = new Map<number, { file: string; line: number; column: number }>()
  private nextLocationRef = 1
  // Variable name → declaration source location (built from AST bindings at launch)
  private bindingLocations = new Map<string, { file: string; line: number; column: number }>()
  private nextVarRef = 3 // 1 = LOCALS_REF, 2 = HANDLERS_REF
  // Cached handler variables built in scopesRequest, consumed in variablesRequest
  private cachedHandlerVars: DebugProtocol.Variable[] = []
  // Track breakpoint nodeIds per file so we only clear the right ones
  private breakpointsByFile = new Map<string, Set<number>>()
  // Buffer breakpoint requests that arrive before launch (DAP sends them early)
  private pendingBreakpoints = new Map<string, { line: number; condition?: string }[]>()
  // For step-over: the file, line, and call depth we started from.
  // Used to skip same-line sub-expressions and bundler-inlined module code.
  private stepOverFile: string | null = null
  private stepOverStartLine: number | null = null
  private stepOverEndLine: number | null = null
  private stepOverDepth: number | null = null
  // For stopOnEntry: skip until we reach a node in the entry file
  private waitingForEntryFile = false
  // The last step command issued, so we can re-issue it when skipping nodes
  private lastStepCommand: 'stepInto' | 'stepOver' | 'stepOut' | null = null
  // Deferred start: launchRequest prepares everything, configurationDone starts execution
  private pendingStart: (() => void) | null = null

  constructor() {
    super()
    // Dvala uses 1-based lines and columns
    this.setDebuggerLinesStartAt1(true)
    this.setDebuggerColumnsStartAt1(true)
  }

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    response.body = response.body || {}
    response.body.supportsConfigurationDoneRequest = true
    response.body.supportsSingleThreadExecutionRequests = true
    // Capabilities we support
    response.body.supportsStepBack = false // deferred until snapshot timing is fixed
    response.body.supportsEvaluateForHovers = true
    response.body.supportsConditionalBreakpoints = true
    this.sendResponse(response)
    this.sendEvent(new InitializedEvent())
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    this.sendResponse(response)
    // All breakpoints are now set — start execution
    if (this.pendingStart) {
      this.pendingStart()
      this.pendingStart = null
    }
  }

  // ---------------------------------------------------------------------------
  // Launch
  // ---------------------------------------------------------------------------

  protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): void {
    const launchArgs = args as LaunchArgs
    const programPath = launchArgs.program
    if (!programPath) {
      this.sendErrorResponse(response, 1, 'Missing "program" in launch configuration')
      return
    }

    this.programPath = programPath

    // Bundle the entry file and all its imports into a single AST with a merged
    // source map. This gives us nodeIds that span all files, so breakpoints in
    // imported files resolve correctly.
    let dvalaBundle
    try {
      dvalaBundle = bundle(programPath, { sourceMap: true })
    } catch (e) {
      this.sendErrorResponse(response, 2, `Failed to bundle: ${e}`)
      return
    }

    if (dvalaBundle.ast.sourceMap) {
      this.sourceMap = dvalaBundle.ast.sourceMap
      // Build variable name → declaration location map from AST binding nodes
      this.buildBindingLocations(dvalaBundle.ast.body, dvalaBundle.ast.sourceMap)
    }

    // Condition evaluator for conditional breakpoints: evaluates a Dvala
    // expression using the current scope's bindings, returns the result value
    const conditionEvaluator = async (expression: string, continuation: Continuation) => {
      const scopeVars = Debugger.extractBindings(continuation)
      const result = await this.evalDvala.runAsync(expression, { scope: scopeVars, pure: true })
      if (result.type === 'completed') return result.value
      return undefined
    }

    // Create debugger controller
    this.dbg = new Debugger((event: DebugStoppedEvent) => {
      const nodeFile = this.nodeFile(event.node)
      const nodeLine = this.nodeLine(event.node)
      const shortFile = nodeFile?.split('/').slice(-2).join('/') ?? '<none>'

      // For stopOnEntry: skip until we reach the entry file
      if (event.reason === 'step' && this.waitingForEntryFile) {
        if (nodeFile !== this.programPath) {
          log(`SKIP waitEntry: ${shortFile}:${nodeLine}`)
          this.dbg?.stepInto()
          return
        }
        this.waitingForEntryFile = false
      }

      // For step events: skip nodes with no source position (synthetic bundler
      // nodes, macro-expanded template nodes) — VS Code can't highlight them.
      // Re-issue the same step command so we don't break depth tracking.
      if (event.reason === 'step' && nodeFile === null) {
        log(`SKIP noSource: nodeId=${event.node[2]} type=${event.node[0]}`)
        this.reissueLastStep()
        return
      }

      // For step-over: skip same-line sub-expressions and bundler-inlined module code.
      // Only apply the file filter at the same call depth — if we returned from a
      // function (shallower depth), we should stop even if we're in a different file.
      if (event.reason === 'step' && this.stepOverFile) {
        const currentDepth = Debugger.countCallDepth(event.continuation)

        const sameDepth = currentDepth === this.stepOverDepth
        const differentFile = nodeFile !== null && nodeFile !== this.stepOverFile
        const withinExpression =
          nodeLine !== null &&
          this.stepOverStartLine !== null &&
          this.stepOverEndLine !== null &&
          nodeLine >= this.stepOverStartLine &&
          nodeLine <= this.stepOverEndLine

        log(
          `FILTER: ${shortFile}:${nodeLine} depth=${currentDepth} stepDepth=${this.stepOverDepth} withinExpr=${withinExpression} diffFile=${differentFile} sameDepth=${sameDepth}`,
        )

        if (withinExpression || (sameDepth && differentFile)) {
          log(`  -> SKIP`)
          this.dbg?.stepOver()
          return
        }
      }
      log(`STOP: ${event.reason} ${shortFile}:${nodeLine} nodeId=${event.node[2]} type=${event.node[0]}`)
      this.stepOverFile = null
      this.stepOverStartLine = null
      this.stepOverEndLine = null
      this.stepOverDepth = null
      this.currentNode = event.node
      this.currentContinuation = event.continuation
      // Reset variable refs on each stop — they're only valid while paused
      this.resetVariableRefs()
      this.sendEvent(new StoppedEvent(event.reason, THREAD_ID))
    }, conditionEvaluator)

    // Replay breakpoints that arrived before launch (during DAP configuration phase)
    log(`pendingBreakpoints: ${this.pendingBreakpoints.size} files`)
    for (const [sourcePath, lines] of this.pendingBreakpoints) {
      log(`replay: ${sourcePath} lines=${JSON.stringify(lines)}`)
      this.applyBreakpoints(sourcePath, lines)
    }
    this.pendingBreakpoints.clear()
    log(`active breakpoints after replay: ${JSON.stringify([...this.dbg.getBreakpoints()])}`)

    // If stopOnEntry, issue a stepInto and skip until we reach the entry file
    if (launchArgs.stopOnEntry) {
      this.waitingForEntryFile = true
      this.lastStepCommand = 'stepInto'
      this.dbg.stepInto()
    }

    this.sendResponse(response)

    // Defer execution until configurationDone — breakpoints are set between
    // launch and configurationDone, so we must wait to ensure they're active.
    this.pendingStart = () => this.startExecution(dvalaBundle)
  }

  private startExecution(dvalaBundle: ReturnType<typeof bundle>): void {
    const dvala = createDvala({ modules: allBuiltinModules, debug: true })

    const handlers: Handlers = [
      {
        pattern: 'dvala.io.print',
        handler: async ctx => {
          const str = stringifyValue(ctx.arg, false)
          this.sendEvent(new OutputEvent(str, 'stdout'))
          ctx.resume(ctx.arg)
        },
      },
      {
        pattern: 'dvala.io.error',
        handler: async ctx => {
          const str = stringifyValue(ctx.arg, false)
          this.sendEvent(new OutputEvent(str + '\n', 'stderr'))
          ctx.resume(ctx.arg)
        },
      },
      {
        pattern: '*',
        handler: async ctx => {
          ctx.next()
        },
      },
    ]

    dvala
      .runAsync(dvalaBundle, {
        effectHandlers: handlers,
        onNodeEval: this.dbg!.onNodeEval,
        filePath: this.programPath,
      })
      .then(result => {
        if (result.type === 'completed') {
          const value = stringifyValue(result.value, false)
          this.sendEvent(new OutputEvent(`=> ${value}\n`, 'console'))
        } else if (result.type === 'error') {
          this.sendEvent(new OutputEvent(`Error: ${result.error.message}\n`, 'stderr'))
        }
        this.sendEvent(new TerminatedEvent())
      })
      .catch(err => {
        this.sendEvent(new OutputEvent(`Fatal: ${err}\n`, 'stderr'))
        this.sendEvent(new TerminatedEvent())
      })
  }

  // ---------------------------------------------------------------------------
  // Breakpoints
  // ---------------------------------------------------------------------------

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    const sourcePath = args.source.path ?? ''
    const requestedBps = (args.breakpoints || []).map(bp => ({
      line: bp.line,
      condition: bp.condition,
    }))

    // Before launch: buffer the requests — we don't have the debugger or source map yet.
    // They'll be replayed in launchRequest after bundling.
    if (!this.dbg || !this.sourceMap) {
      log(`setBreakpoints BUFFERED: ${sourcePath} lines=${JSON.stringify(requestedBps.map(b => b.line))}`)
      this.pendingBreakpoints.set(sourcePath, requestedBps)
      // Report all as verified (optimistic — will be resolved at launch)
      response.body = {
        breakpoints: requestedBps.map(bp => ({ verified: true, line: bp.line })),
      }
      this.sendResponse(response)
      return
    }

    log(`setBreakpoints LIVE: ${sourcePath} lines=${JSON.stringify(requestedBps.map(b => b.line))}`)
    this.applyBreakpoints(sourcePath, requestedBps)

    response.body = {
      breakpoints: requestedBps.map(bp => {
        const nodeId = this.nodeIdForLine(bp.line, sourcePath)
        return { verified: nodeId !== null, line: bp.line }
      }),
    }
    this.sendResponse(response)
  }

  /**
   * Resolve line breakpoints to nodeIds and register them on the debugger.
   * Clears any previous breakpoints for the same file first.
   */
  private applyBreakpoints(sourcePath: string, bps: { line: number; condition?: string }[]): void {
    if (!this.dbg) return

    // Clear previous breakpoints for this file
    const oldNodeIds = this.breakpointsByFile.get(sourcePath)
    if (oldNodeIds) {
      for (const nodeId of oldNodeIds) {
        this.dbg.removeBreakpoint(nodeId)
      }
    }

    const newNodeIds = new Set<number>()
    for (const bp of bps) {
      const nodeId = this.nodeIdForLine(bp.line, sourcePath)
      log(`  resolve: line ${bp.line} -> nodeId ${nodeId} condition=${bp.condition ?? 'none'}`)
      if (nodeId !== null) {
        this.dbg.setBreakpoint(nodeId, bp.condition)
        newNodeIds.add(nodeId)
      }
    }
    this.breakpointsByFile.set(sourcePath, newNodeIds)
  }

  /**
   * Find the first evaluatable node ID on a given line in a given file.
   * Skips structuralLeaf nodes (Sym, Builtin, etc.) since the evaluator's
   * onNodeEval hook never visits them — setting a breakpoint on one would
   * never fire.
   * DAP lines are 1-based, source map positions are 0-based.
   * Returns null if no node found on that line.
   */
  // Source map helpers — delegate to shared SourceMapUtils
  private nodeFile(node: AstNode): string | null {
    return this.sourceMap ? getNodeFile(node, this.sourceMap) : null
  }
  private nodeLine(node: AstNode): number | null {
    return this.sourceMap ? getNodeLine(node, this.sourceMap) : null
  }
  private nodeEndLine(node: AstNode): number | null {
    return this.sourceMap ? getNodeEndLine(node, this.sourceMap) : null
  }
  private nodeIdForLine(line: number, filePath: string): number | null {
    return this.sourceMap ? findNodeIdForLine(line, filePath, this.sourceMap) : null
  }

  /** Return a short display name for a source path, relative to the program's directory. */
  private shortSourceName(filePath: string): string {
    const dir = path.dirname(this.programPath)
    return path.relative(dir, filePath) || path.basename(filePath)
  }

  /** Reset all variable/location ref maps. Called on each StoppedEvent. */
  private resetVariableRefs(): void {
    this.variableRefs.clear()
    this.functionRefs.clear()
    this.effectRefs.clear()
    this.regexpRefs.clear()
    this.locationRefs.clear()
    this.nextLocationRef = 1
    this.nextVarRef = 3
  }

  /** Re-issue the last step command to skip past a node without breaking depth tracking. */
  private reissueLastStep(): void {
    switch (this.lastStepCommand) {
      case 'stepOver':
        this.dbg?.stepOver()
        break
      case 'stepOut':
        this.dbg?.stepOut()
        break
      case 'stepInto':
      default:
        this.dbg?.stepInto()
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Execution control
  // ---------------------------------------------------------------------------

  protected continueRequest(response: DebugProtocol.ContinueResponse, _args: DebugProtocol.ContinueArguments): void {
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.continue()
    this.sendResponse(response)
  }

  protected nextRequest(response: DebugProtocol.NextResponse, _args: DebugProtocol.NextArguments): void {
    // Record current file, line, and depth so the stop callback can skip
    // same-line sub-expressions and bundler-inlined module code
    this.stepOverFile = this.currentNode ? this.nodeFile(this.currentNode) : null
    this.stepOverStartLine = this.currentNode ? this.nodeLine(this.currentNode) : null
    this.stepOverEndLine = this.currentNode ? this.nodeEndLine(this.currentNode) : null
    this.stepOverDepth = this.currentContinuation ? Debugger.countCallDepth(this.currentContinuation) : null
    this.lastStepCommand = 'stepOver'
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.stepOver()
    this.sendResponse(response)
  }

  protected stepInRequest(response: DebugProtocol.StepInResponse, _args: DebugProtocol.StepInArguments): void {
    this.lastStepCommand = 'stepInto'
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.stepInto()
    this.sendResponse(response)
  }

  protected stepOutRequest(response: DebugProtocol.StepOutResponse, _args: DebugProtocol.StepOutArguments): void {
    this.lastStepCommand = 'stepOut'
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.stepOut()
    this.sendResponse(response)
  }

  // ---------------------------------------------------------------------------
  // Threads (Dvala is single-threaded)
  // ---------------------------------------------------------------------------

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [{ id: THREAD_ID, name: 'Dvala Main' }],
    }
    this.sendResponse(response)
  }

  // ---------------------------------------------------------------------------
  // Stack trace
  // ---------------------------------------------------------------------------

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments,
  ): void {
    if (!this.currentContinuation) {
      response.body = { stackFrames: [], totalFrames: 0 }
      this.sendResponse(response)
      return
    }

    const stackFrames: DebugProtocol.StackFrame[] = []

    // Top frame: the current stopped node position
    if (this.currentNode && this.sourceMap) {
      const pos = this.sourceMap.positions.get(this.currentNode[2])
      if (pos) {
        const source = this.sourceMap.sources[pos.source]
        const filePath = source?.path ?? this.programPath
        stackFrames.push({
          id: 0,
          name: '<current>',
          source: {
            name: this.shortSourceName(filePath),
            path: filePath,
          },
          // Source map positions are 0-based, DAP expects 1-based
          line: pos.start[0] + 1,
          column: pos.start[1] + 1,
        })
      }
    }

    // Call stack frames from the continuation
    const entries = Debugger.getCallStack(this.currentContinuation)
    for (const entry of entries) {
      const entryPath = entry.sourceCodeInfo?.filePath ?? this.programPath
      stackFrames.push({
        id: stackFrames.length,
        name: entry.name,
        source: {
          name: this.shortSourceName(entryPath),
          path: entryPath,
        },
        line: entry.sourceCodeInfo?.position.line ?? 0,
        column: entry.sourceCodeInfo?.position.column ?? 0,
      })
    }

    response.body = { stackFrames, totalFrames: stackFrames.length }
    this.sendResponse(response)
  }

  // ---------------------------------------------------------------------------
  // Scopes and variables
  // ---------------------------------------------------------------------------

  protected scopesRequest(response: DebugProtocol.ScopesResponse, _args: DebugProtocol.ScopesArguments): void {
    // Build handler variables once; show the scope only if non-empty
    this.cachedHandlerVars = this.currentContinuation ? this.buildHandlerVariables(this.currentContinuation.k) : []

    const scopes: DebugProtocol.Scope[] = [{ name: 'Locals', variablesReference: LOCALS_REF, expensive: false }]
    if (this.cachedHandlerVars.length > 0) {
      scopes.push({ name: 'Effect Handlers', variablesReference: HANDLERS_REF, expensive: false })
    }
    response.body = { scopes }
    this.sendResponse(response)
  }

  protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
    // Locals scope: convert Dvala values to JS and build expandable tree
    if (args.variablesReference === LOCALS_REF) {
      if (!this.currentContinuation) {
        response.body = { variables: [] }
        this.sendResponse(response)
        return
      }
      const vars = Debugger.getVariables(this.currentContinuation)
      const variables: DebugProtocol.Variable[] = vars.map(v => this.toSmartVariable(v.name, v.value))
      response.body = { variables }
      this.sendResponse(response)
      return
    }

    // Effect Handlers scope: use cached vars built in scopesRequest
    if (args.variablesReference === HANDLERS_REF) {
      response.body = { variables: this.cachedHandlerVars }
      this.sendResponse(response)
      return
    }

    // Function/macro expansion: show metadata fields
    const fn = this.functionRefs.get(args.variablesReference)
    if (fn) {
      response.body = { variables: this.expandFunction(fn) }
      this.sendResponse(response)
      return
    }

    // Effect expansion
    const eff = this.effectRefs.get(args.variablesReference)
    if (eff) {
      response.body = { variables: this.expandEffect(eff) }
      this.sendResponse(response)
      return
    }

    // RegularExpression expansion
    const re = this.regexpRefs.get(args.variablesReference)
    if (re) {
      response.body = { variables: this.expandRegExp(re) }
      this.sendResponse(response)
      return
    }

    // Nested expansion: look up a previously registered compound value
    const compound = this.variableRefs.get(args.variablesReference)
    if (!compound) {
      response.body = { variables: [] }
      this.sendResponse(response)
      return
    }

    const variables: DebugProtocol.Variable[] = Array.isArray(compound)
      ? compound.map((item, i) => this.toVariable(String(i), item))
      : Object.entries(compound).map(([key, val]) => this.toVariable(key, val))

    response.body = { variables }
    this.sendResponse(response)
  }

  /**
   * Convert any Dvala value to an expandable DAP Variable.
   * This is the main entry point for variable display — handles all Dvala types.
   */
  private toSmartVariable(name: string, value: unknown): DebugProtocol.Variable {
    // Expandable collections
    if (isPersistentVector(value) || isPersistentMap(value)) {
      return this.toVariable(name, toJS(value))
    }
    // Expandable functions/macros/handlers
    if (isDvalaFunction(value)) {
      return this.toFunctionVariable(name, value)
    }
    // Expandable effects
    if (isEffect(value)) {
      const ref = this.nextVarRef++
      this.effectRefs.set(ref, value)
      return { name, value: stringifyValue(value, false), variablesReference: ref }
    }
    // Expandable regular expressions
    if (isRegularExpression(value)) {
      const ref = this.nextVarRef++
      this.regexpRefs.set(ref, value)
      return { name, value: stringifyValue(value, false), variablesReference: ref }
    }
    return { name, value: stringifyValue(value, false), variablesReference: 0 }
  }

  /** Convert a JS value to a DAP Variable, registering a ref for objects/arrays. */
  private toVariable(name: string, value: unknown): DebugProtocol.Variable {
    // Functions inside closures or collections should also be expandable
    if (isDvalaFunction(value)) {
      return this.toFunctionVariable(name, value)
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ref = this.nextVarRef++
      this.variableRefs.set(ref, value as Record<string, unknown>)
      const keys = Object.keys(value as Record<string, unknown>)
      return { name, value: `{${keys.join(', ')}}`, variablesReference: ref }
    }
    if (Array.isArray(value)) {
      const ref = this.nextVarRef++
      this.variableRefs.set(ref, value)
      return { name, value: `[${value.length} items]`, variablesReference: ref }
    }
    return { name, value: stringifyValue(value, false), variablesReference: 0 }
  }

  /** Convert a DvalaFunction to an expandable DAP Variable with clickable source location. */
  private toFunctionVariable(name: string, fn: DvalaFunction): DebugProtocol.Variable {
    const ref = this.nextVarRef++
    this.functionRefs.set(ref, fn)
    const variable: DebugProtocol.Variable = { name, value: stringifyValue(fn, false), variablesReference: ref }
    // Set valueLocationReference for "Go to Value Definition" (DAP locations protocol).
    // VS Code will show this in the context menu when supported.
    if (fn.sourceCodeInfo?.filePath) {
      const locRef = this.nextLocationRef++
      this.locationRefs.set(locRef, {
        file: fn.sourceCodeInfo.filePath,
        line: fn.sourceCodeInfo.position.line,
        column: fn.sourceCodeInfo.position.column,
      })
      variable.valueLocationReference = locRef
    }
    return variable
  }

  /** Build child variables for an expanded function/macro/handler. */
  private expandFunction(fn: DvalaFunction): DebugProtocol.Variable[] {
    const vars: DebugProtocol.Variable[] = []

    // Type — always shown
    vars.push({ name: 'type', value: fn.functionType, variablesReference: 0 })

    // Name (for user-defined, macros, builtins, module functions)
    if ('name' in fn && fn.name) {
      vars.push({ name: 'name', value: `"${fn.name}"`, variablesReference: 0 })
    }

    // Qualified name (macros only)
    if ('qualifiedName' in fn && fn.qualifiedName) {
      vars.push({ name: 'qualifiedName', value: `"${fn.qualifiedName}"`, variablesReference: 0 })
    }

    // Arity
    const arityParts: string[] = []
    if (fn.arity.min !== undefined) arityParts.push(`min: ${fn.arity.min}`)
    if (fn.arity.max !== undefined) arityParts.push(`max: ${fn.arity.max}`)
    vars.push({
      name: 'arity',
      value: arityParts.length > 0 ? `{${arityParts.join(', ')}}` : '{}',
      variablesReference: 0,
    })

    // Source location (relative to program directory for readability)
    if (fn.sourceCodeInfo) {
      const sci = fn.sourceCodeInfo
      const displayPath = sci.filePath ? this.shortSourceName(sci.filePath) : null
      const location = displayPath
        ? `${displayPath}:${sci.position.line}:${sci.position.column}`
        : `line ${sci.position.line}, col ${sci.position.column}`
      vars.push({ name: 'defined at', value: location, variablesReference: 0 })
    }

    // Doc string
    if ('docString' in fn && fn.docString) {
      vars.push({ name: 'docString', value: `"${fn.docString}"`, variablesReference: 0 })
    }

    // Parameters and closure (UserDefined, Macro)
    if ('evaluatedfunction' in fn) {
      const [params, , closureCtx] = fn.evaluatedfunction
      const paramNames = params.map(p => extractBindingTargetName(p))
      vars.push({ name: 'parameters', value: `(${paramNames.join(', ')})`, variablesReference: 0 })

      // Closure: captured variables — expandable if non-empty
      const closureEntries = Object.entries(closureCtx)
      if (closureEntries.length > 0) {
        const closureObj: Record<string, unknown> = {}
        for (const [key, entry] of closureEntries) {
          closureObj[key] = (entry as { value: unknown }).value
        }
        const ref = this.nextVarRef++
        this.variableRefs.set(ref, closureObj)
        vars.push({ name: 'closure', value: `{${closureEntries.length} captured}`, variablesReference: ref })
      }
    }

    // Builtin function name
    if ('normalBuiltinSymbolType' in fn) {
      vars.push({ name: 'builtin', value: `"${fn.normalBuiltinSymbolType}"`, variablesReference: 0 })
    }

    // SpecialBuiltin
    if ('specialBuiltinSymbolType' in fn) {
      vars.push({ name: 'operator', value: `"${fn.specialBuiltinSymbolType}"`, variablesReference: 0 })
    }

    // Module function
    if ('moduleName' in fn && 'functionName' in fn) {
      vars.push({ name: 'module', value: `"${fn.moduleName}"`, variablesReference: 0 })
      vars.push({ name: 'function', value: `"${fn.functionName}"`, variablesReference: 0 })
    }

    // Partial: show the wrapped function and bound args
    if (fn.functionType === 'Partial') {
      vars.push(this.toSmartVariable('wrappedFunction', fn.function))
      const boundArgs = fn.params.toArray()
      for (let i = 0; i < boundArgs.length; i++) {
        vars.push(this.toSmartVariable(`arg[${i}]`, boundArgs[i]))
      }
      vars.push({ name: 'placeholders', value: `[${fn.placeholders.join(', ')}]`, variablesReference: 0 })
    }

    // Comp: show composed functions
    if (fn.functionType === 'Comp') {
      const fns = fn.params.toArray()
      for (let i = 0; i < fns.length; i++) {
        vars.push(this.toSmartVariable(`fn[${i}]`, fns[i]))
      }
    }

    // Constantly: show the constant value
    if (fn.functionType === 'Constantly') {
      vars.push(this.toSmartVariable('value', fn.value))
    }

    // Juxt: show juxtaposed functions
    if (fn.functionType === 'Juxt') {
      const fns = fn.params.toArray()
      for (let i = 0; i < fns.length; i++) {
        vars.push(this.toSmartVariable(`fn[${i}]`, fns[i]))
      }
    }

    // Complement: show the negated function
    if (fn.functionType === 'Complement') {
      vars.push(this.toSmartVariable('wrappedFunction', fn.function))
    }

    // EveryPred / SomePred: show predicate functions
    if (fn.functionType === 'EveryPred' || fn.functionType === 'SomePred') {
      const preds = fn.params.toArray()
      for (let i = 0; i < preds.length; i++) {
        vars.push(this.toSmartVariable(`predicate[${i}]`, preds[i]))
      }
    }

    // Fnull: show wrapped function and default values
    if (fn.functionType === 'Fnull') {
      vars.push(this.toSmartVariable('wrappedFunction', fn.function))
      const defaults = fn.params.toArray()
      for (let i = 0; i < defaults.length; i++) {
        vars.push(this.toSmartVariable(`default[${i}]`, defaults[i]))
      }
    }

    // QualifiedMatcher: show pattern
    if (fn.functionType === 'QualifiedMatcher') {
      vars.push({ name: 'matchType', value: fn.matchType, variablesReference: 0 })
      vars.push({ name: 'pattern', value: `"${fn.pattern}"`, variablesReference: 0 })
      if (fn.flags) {
        vars.push({ name: 'flags', value: `"${fn.flags}"`, variablesReference: 0 })
      }
    }

    // Handler: show clauses, shallow, transform
    if (fn.functionType === 'Handler') {
      vars.push({ name: 'shallow', value: `${fn.shallow}`, variablesReference: 0 })
      for (const clause of fn.clauses) {
        const paramNames = clause.params.map(p => extractBindingTargetName(p))
        vars.push({ name: `@${clause.effectName}`, value: `(${paramNames.join(', ')})`, variablesReference: 0 })
      }
      if (fn.transform) {
        vars.push({ name: 'transform', value: `(${extractBindingTargetName(fn.transform[0])})`, variablesReference: 0 })
      }
    }

    // Resume: show the handler it belongs to
    if (fn.functionType === 'Resume') {
      vars.push(this.toSmartVariable('handler', fn.handler))
    }

    return vars
  }

  /** Build child variables for an expanded effect. */
  private expandEffect(eff: EffectRef): DebugProtocol.Variable[] {
    return [
      { name: 'type', value: 'Effect', variablesReference: 0 },
      { name: 'name', value: `"${eff.name}"`, variablesReference: 0 },
    ]
  }

  /** Build child variables for an expanded regular expression. */
  private expandRegExp(re: RegularExpression): DebugProtocol.Variable[] {
    const vars: DebugProtocol.Variable[] = [
      { name: 'type', value: 'RegularExpression', variablesReference: 0 },
      { name: 'source', value: `"${re.s}"`, variablesReference: 0 },
    ]
    if (re.f) {
      vars.push({ name: 'flags', value: `"${re.f}"`, variablesReference: 0 })
    }
    if (re.sourceCodeInfo) {
      const sci = re.sourceCodeInfo
      const displayPath = sci.filePath ? this.shortSourceName(sci.filePath) : null
      const location = displayPath
        ? `${displayPath}:${sci.position.line}:${sci.position.column}`
        : `line ${sci.position.line}, col ${sci.position.column}`
      vars.push({ name: 'defined at', value: location, variablesReference: 0 })
    }
    return vars
  }

  /**
   * Convert any Dvala value to a DAP-compatible { value, variablesReference } pair.
   * Used by evaluateRequest to make hover/watch/console results expandable.
   */
  private toEvalResult(value: unknown): { value: string; variablesReference: number } {
    const v = this.toSmartVariable('result', value)
    return { value: v.value, variablesReference: v.variablesReference }
  }

  /** Build expandable variables for all active effect handlers on the stack. */
  private buildHandlerVariables(k: ContinuationStack): DebugProtocol.Variable[] {
    const variables: DebugProtocol.Variable[] = []
    let index = 0
    let node = k

    while (node !== null) {
      const frame = node.head

      if (frame.type === 'AlgebraicHandle' || frame.type === 'HandlerClause' || frame.type === 'HandlerTransform') {
        const handler = frame.handler as HandlerFunction
        const effectNames = [...handler.clauseMap.keys()]
        const status =
          frame.type === 'AlgebraicHandle'
            ? 'installed'
            : frame.type === 'HandlerClause'
              ? 'dispatching'
              : 'transforming'

        // Build child properties for this handler
        const details: Record<string, unknown> = {}
        details['status'] = status
        details['effects'] = effectNames.join(', ')
        details['shallow'] = handler.shallow

        if (handler.sourceCodeInfo) {
          const sci = handler.sourceCodeInfo
          const displayPath = sci.filePath ? this.shortSourceName(sci.filePath) : null
          details['defined at'] = displayPath
            ? `${displayPath}:${sci.position.line}:${sci.position.column}`
            : `line ${sci.position.line}, col ${sci.position.column}`
        }

        // Show each clause's effect name and parameter count
        for (const clause of handler.clauses) {
          const paramNames = clause.params.map(p => extractBindingTargetName(p))
          details[`@${clause.effectName}`] = `(${paramNames.join(', ')})`
        }

        if (handler.transform) {
          details['transform'] = `(${extractBindingTargetName(handler.transform[0])})`
        }

        const ref = this.nextVarRef++
        this.variableRefs.set(ref, details)
        const label = `handler(${effectNames.map(e => `@${e}`).join(', ')})`
        variables.push({ name: `#${index}`, value: label, variablesReference: ref })
        index++
      }

      node = node.tail
    }

    return variables
  }

  /**
   * Walk the AST to build a map of variable names → declaration source locations.
   * Finds all Binding nodes and extracts the symbol name + source position.
   * Later bindings shadow earlier ones (matches runtime scoping).
   */
  private buildBindingLocations(body: AstNode[], sourceMap: SourceMap): void {
    this.bindingLocations.clear()
    const walk = (nodes: AstNode[]): void => {
      for (const node of nodes) {
        const [type, payload, nodeId] = node
        if (type === 'Let') {
          // payload: [BindingTarget, valueAstNode]
          const [target] = payload as [BindingTarget, AstNode]
          const name = this.extractTopLevelBindingName(target)
          if (name) {
            const pos = sourceMap.positions.get(nodeId)
            if (pos) {
              const source = sourceMap.sources[pos.source]
              if (source) {
                this.bindingLocations.set(name, {
                  file: source.path,
                  line: pos.start[0] + 1, // source map is 0-based, we store 1-based
                  column: pos.start[1] + 1,
                })
              }
            }
          }
        }
        // Recurse into child nodes
        if (Array.isArray(payload)) {
          for (const child of payload) {
            if (
              Array.isArray(child) &&
              child.length === 3 &&
              typeof child[0] === 'string' &&
              typeof child[2] === 'number'
            ) {
              walk([child as AstNode])
            } else if (Array.isArray(child)) {
              // Could be an array of nodes (e.g. block body, function body)
              const nested = child.filter(
                (c): c is AstNode =>
                  Array.isArray(c) && c.length === 3 && typeof c[0] === 'string' && typeof c[2] === 'number',
              )
              if (nested.length > 0) walk(nested)
            }
          }
        }
      }
    }
    walk(body)
  }

  /** Extract the name from a simple symbol binding target (ignores destructuring). */
  private extractTopLevelBindingName(target: BindingTarget): string | null {
    if (target[0] === 'symbol') {
      const symbolNode = target[1][0]
      return symbolNode[1] as string
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Evaluate (watch expressions, hover, debug console)
  // ---------------------------------------------------------------------------

  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    if (!this.currentContinuation) {
      this.sendErrorResponse(response, 3, 'Not stopped')
      return
    }

    const expr = args.expression.trim()

    // "Copy Value" sends context "variables" with the displayed value as expression.
    // Return it as-is instead of evaluating as Dvala code.
    if (args.context === 'variables' || args.context === 'clipboard') {
      response.body = { result: expr, variablesReference: 0 }
      this.sendResponse(response)
      return
    }

    // Evaluate the expression with the current scope's bindings
    const scopeVars = Debugger.extractBindings(this.currentContinuation)
    const result = await this.evalDvala.runAsync(expr, { scope: scopeVars, pure: true })

    if (result.type === 'completed') {
      // Make the result expandable for collections and functions
      const v = this.toEvalResult(result.value)
      response.body = {
        result: v.value,
        variablesReference: v.variablesReference,
      }
    } else if (result.type === 'error') {
      response.body = {
        result: result.error.message,
        variablesReference: 0,
      }
    } else {
      response.body = {
        result: '<evaluation suspended>',
        variablesReference: 0,
      }
    }
    this.sendResponse(response)
  }

  // ---------------------------------------------------------------------------
  // Locations (Go to Value Definition)
  // ---------------------------------------------------------------------------

  protected dispatchRequest(request: DebugProtocol.Request): void {
    if (request.command === 'locations') {
      const response: DebugProtocol.LocationsResponse = {
        request_seq: request.seq,
        seq: 0,
        success: true,
        command: request.command,
        type: 'response',
      }
      this.locationsRequest(response, request.arguments as DebugProtocol.LocationsArguments)
      return
    }
    // Custom request: resolve source location for any variable
    if (request.command === 'dvalaGetSourceLocation') {
      const varRef = request.arguments?.variablesReference as number | undefined
      const varName = request.arguments?.name as string | undefined
      const response: DebugProtocol.Response = {
        request_seq: request.seq,
        seq: 0,
        success: true,
        command: request.command,
        type: 'response',
        body: {},
      }
      // Try function refs first (has runtime sourceCodeInfo)
      if (varRef) {
        const fn = this.functionRefs.get(varRef)
        if (fn?.sourceCodeInfo?.filePath) {
          response.body = {
            file: fn.sourceCodeInfo.filePath,
            line: fn.sourceCodeInfo.position.line,
            column: fn.sourceCodeInfo.position.column,
          }
          this.sendResponse(response)
          return
        }
      }
      // Fall back to binding locations from the AST (works for all variables)
      if (varName) {
        const loc = this.bindingLocations.get(varName)
        if (loc) {
          response.body = { file: loc.file, line: loc.line, column: loc.column }
        }
      }
      this.sendResponse(response)
      return
    }
    super.dispatchRequest(request)
  }

  private locationsRequest(response: DebugProtocol.LocationsResponse, args: DebugProtocol.LocationsArguments): void {
    const loc = this.locationRefs.get(args.locationReference)
    if (loc) {
      response.body = {
        source: { name: this.shortSourceName(loc.file), path: loc.file },
        line: loc.line,
        column: loc.column,
      }
    }
    this.sendResponse(response)
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): void {
    // If paused, resume so the program can exit
    this.dbg?.continue()
    this.dbg = null
    this.currentNode = null
    this.currentContinuation = null
    this.sendResponse(response)
  }
}

/**
 * Extract a human-readable name from a BindingTarget.
 * BindingTarget is [type, payload, nodeId] where payload varies by type.
 */
function extractBindingTargetName(target: BindingTarget): string {
  const [type, payload] = target
  switch (type) {
    case 'symbol': {
      // payload: [SymbolNode, defaultValue?], SymbolNode is [nodeType, name, nodeId]
      const symbolNode = payload[0]
      return symbolNode[1] as string
    }
    case 'rest': {
      // payload: [name, defaultValue?]
      return `...${payload[0]}`
    }
    case 'object':
      return '{...}'
    case 'array':
      return '[...]'
    case 'literal':
      return '_literal_'
    case 'wildcard':
      return '_'
    default:
      return '?'
  }
}

// Launch the debug adapter as a standalone process
DvalaDebugSession.run(DvalaDebugSession)
