/**
 * Dvala Debug Adapter — translates between DAP and the core Debugger controller.
 *
 * Runs as a standalone Node.js process communicating with VS Code over stdio.
 * Uses `@vscode/debugadapter` as the protocol layer and the Dvala `Debugger`
 * class (from src/debugger/Debugger.ts) as the runtime backend.
 */

import { appendFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  DebugSession,
  InitializedEvent,
  OutputEvent,
  StoppedEvent,
  TerminatedEvent,
} from '@vscode/debugadapter'

const LOG_FILE = '/tmp/dvala-dap.log'
function log(msg: string): void {
  appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`)
}
import type { DebugProtocol } from '@vscode/debugprotocol'
import { createDvala } from '../../src/createDvala'
import { allBuiltinModules } from '../../src/allModules'
import { bundle } from '../../src/bundler'
import { Debugger } from '../../src/debugger/Debugger'
import type { DebugStoppedEvent } from '../../src/debugger/Debugger'
import type { Continuation, Handlers } from '../../src/evaluator/effectTypes'
import type { AstNode, SourceMap } from '../../src/parser/types'
import { stringifyValue } from '../../common/utils'
import { toJS } from '../../src/utils/interop'
import { isPersistentMap, isPersistentVector } from '../../src/utils/persistent'

// DAP uses a single thread for Dvala (no concurrency)
const THREAD_ID = 1

// Variable reference IDs: 1 = locals scope, 2+ = nested objects/arrays
const LOCALS_REF = 1

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
  // For expandable variables: maps variablesReference IDs to JS values
  private variableRefs = new Map<number, Record<string, unknown> | unknown[]>()
  private nextVarRef = 2 // 1 is reserved for LOCALS_REF
  // Track breakpoint nodeIds per file so we only clear the right ones
  private breakpointsByFile = new Map<string, Set<number>>()
  // Buffer breakpoint requests that arrive before launch (DAP sends them early)
  private pendingBreakpoints = new Map<string, number[]>()
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

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments,
  ): void {
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
    }

    // Create debugger controller
    this.dbg = new Debugger((event: DebugStoppedEvent) => {
      const nodeFile = this.getNodeFile(event.node)
      const nodeLine = this.getNodeLine(event.node)
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
        const currentDepth = this.countCallDepth(event.continuation)

        const sameDepth = currentDepth === this.stepOverDepth
        const differentFile = nodeFile !== null && nodeFile !== this.stepOverFile
        const withinExpression = nodeLine !== null
          && this.stepOverStartLine !== null && this.stepOverEndLine !== null
          && nodeLine >= this.stepOverStartLine && nodeLine <= this.stepOverEndLine

        log(`FILTER: ${shortFile}:${nodeLine} depth=${currentDepth} stepDepth=${this.stepOverDepth} withinExpr=${withinExpression} diffFile=${differentFile} sameDepth=${sameDepth}`)

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
      this.sendEvent(new StoppedEvent(event.reason, THREAD_ID))
    })

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
      { pattern: 'dvala.io.print', handler: async (ctx) => {
        const str = stringifyValue(ctx.arg, false)
        this.sendEvent(new OutputEvent(str, 'stdout'))
        ctx.resume(ctx.arg)
      } },
      { pattern: 'dvala.io.error', handler: async (ctx) => {
        const str = stringifyValue(ctx.arg, false)
        this.sendEvent(new OutputEvent(str + '\n', 'stderr'))
        ctx.resume(ctx.arg)
      } },
      { pattern: '*', handler: async (ctx) => {
        ctx.next()
      } },
    ]

    dvala.runAsync(dvalaBundle, {
      effectHandlers: handlers,
      onNodeEval: this.dbg!.onNodeEval,
      filePath: this.programPath,
    }).then((result) => {
      if (result.type === 'completed') {
        const value = stringifyValue(result.value, false)
        this.sendEvent(new OutputEvent(`=> ${value}\n`, 'console'))
      } else if (result.type === 'error') {
        this.sendEvent(new OutputEvent(`Error: ${result.error.message}\n`, 'stderr'))
      }
      this.sendEvent(new TerminatedEvent())
    }).catch((err) => {
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
    const requestedLines = (args.breakpoints || []).map(bp => bp.line)

    // Before launch: buffer the requests — we don't have the debugger or source map yet.
    // They'll be replayed in launchRequest after bundling.
    if (!this.dbg || !this.sourceMap) {
      log(`setBreakpoints BUFFERED: ${sourcePath} lines=${JSON.stringify(requestedLines)}`)
      this.pendingBreakpoints.set(sourcePath, requestedLines)
      // Report all as verified (optimistic — will be resolved at launch)
      response.body = {
        breakpoints: requestedLines.map(line => ({ verified: true, line })),
      }
      this.sendResponse(response)
      return
    }

    log(`setBreakpoints LIVE: ${sourcePath} lines=${JSON.stringify(requestedLines)}`)
    this.applyBreakpoints(sourcePath, requestedLines)

    response.body = {
      breakpoints: requestedLines.map(line => {
        const nodeId = this.findNodeIdForLine(line, sourcePath)
        return { verified: nodeId !== null, line }
      }),
    }
    this.sendResponse(response)
  }

  /**
   * Resolve line breakpoints to nodeIds and register them on the debugger.
   * Clears any previous breakpoints for the same file first.
   */
  private applyBreakpoints(sourcePath: string, lines: number[]): void {
    if (!this.dbg) return

    // Clear previous breakpoints for this file
    const oldNodeIds = this.breakpointsByFile.get(sourcePath)
    if (oldNodeIds) {
      for (const nodeId of oldNodeIds) {
        this.dbg.removeBreakpoint(nodeId)
      }
    }

    const newNodeIds = new Set<number>()
    for (const line of lines) {
      const nodeId = this.findNodeIdForLine(line, sourcePath)
      log(`  resolve: line ${line} -> nodeId ${nodeId}`)
      if (nodeId !== null) {
        this.dbg.setBreakpoint(nodeId)
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
  private findNodeIdForLine(line: number, filePath: string): number | null {
    if (!this.sourceMap) return null

    const line0 = line - 1 // convert DAP 1-based to source map 0-based
    let bestNodeId: number | null = null
    let bestCol = Infinity

    for (const [nodeId, pos] of this.sourceMap.positions) {
      // Skip leaf nodes that onNodeEval never visits
      if (pos.structuralLeaf) continue

      // Match source file — compare by path stored in the source map
      const source = this.sourceMap.sources[pos.source]
      if (source && source.path !== filePath) continue

      if (pos.start[0] === line0 && pos.start[1] < bestCol) {
        bestNodeId = nodeId
        bestCol = pos.start[1]
      }
    }
    return bestNodeId
  }

  /** Return a short display name for a source path, relative to the program's directory. */
  private shortSourceName(filePath: string): string {
    const dir = path.dirname(this.programPath)
    return path.relative(dir, filePath) || path.basename(filePath)
  }

  /** Re-issue the last step command to skip past a node without breaking depth tracking. */
  private reissueLastStep(): void {
    switch (this.lastStepCommand) {
      case 'stepOver': this.dbg?.stepOver(); break
      case 'stepOut': this.dbg?.stepOut(); break
      case 'stepInto':
      default: this.dbg?.stepInto(); break
    }
  }

  /** Resolve a node's source file path from the source map. */
  private getNodeFile(node: AstNode): string | null {
    if (!this.sourceMap) return null
    const pos = this.sourceMap.positions.get(node[2])
    if (!pos) return null
    return this.sourceMap.sources[pos.source]?.path ?? null
  }

  /** Count call depth by counting FnBody frames in the continuation stack. */
  private countCallDepth(continuation: Continuation): number {
    let depth = 0
    let node = continuation.k
    while (node !== null) {
      if (node.head.type === 'FnBody') depth++
      node = node.tail
    }
    return depth
  }

  /** Resolve a node's 0-based start line from the source map. */
  private getNodeLine(node: AstNode): number | null {
    if (!this.sourceMap) return null
    const pos = this.sourceMap.positions.get(node[2])
    if (!pos) return null
    return pos.start[0]
  }

  /** Resolve a node's 0-based end line from the source map. */
  private getNodeEndLine(node: AstNode): number | null {
    if (!this.sourceMap) return null
    const pos = this.sourceMap.positions.get(node[2])
    if (!pos) return null
    return pos.end[0]
  }

  // ---------------------------------------------------------------------------
  // Execution control
  // ---------------------------------------------------------------------------

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
  ): void {
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.continue()
    this.sendResponse(response)
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
  ): void {
    // Record current file, line, and depth so the stop callback can skip
    // same-line sub-expressions and bundler-inlined module code
    this.stepOverFile = this.currentNode ? this.getNodeFile(this.currentNode) : null
    this.stepOverStartLine = this.currentNode ? this.getNodeLine(this.currentNode) : null
    this.stepOverEndLine = this.currentNode ? this.getNodeEndLine(this.currentNode) : null
    this.stepOverDepth = this.currentContinuation ? this.countCallDepth(this.currentContinuation) : null
    this.lastStepCommand = 'stepOver'
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.stepOver()
    this.sendResponse(response)
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
  ): void {
    this.lastStepCommand = 'stepInto'
    this.currentNode = null
    this.currentContinuation = null
    this.dbg?.stepInto()
    this.sendResponse(response)
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments,
  ): void {
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

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments,
  ): void {
    response.body = {
      scopes: [
        { name: 'Locals', variablesReference: LOCALS_REF, expensive: false },
      ],
    }
    this.sendResponse(response)
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): void {
    // Locals scope: convert Dvala values to JS and build expandable tree
    if (args.variablesReference === LOCALS_REF) {
      if (!this.currentContinuation) {
        response.body = { variables: [] }
        this.sendResponse(response)
        return
      }
      // Reset variable refs on each stop (they're only valid while paused)
      this.variableRefs.clear()
      this.nextVarRef = 2

      const vars = Debugger.getVariables(this.currentContinuation)
      const variables: DebugProtocol.Variable[] = vars.map(v => {
        // Only expand plain arrays and objects; everything else (functions,
        // macros, effects, regexps, etc.) is shown as a flat string.
        if (isPersistentVector(v.value) || isPersistentMap(v.value)) {
          return this.toVariable(v.name, toJS(v.value))
        }
        return { name: v.name, value: stringifyValue(v.value, false), variablesReference: 0 }
      })
      response.body = { variables }
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

  /** Convert a JS value to a DAP Variable, registering a ref for objects/arrays. */
  private toVariable(name: string, value: unknown): DebugProtocol.Variable {
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

  // ---------------------------------------------------------------------------
  // Evaluate (watch expressions, hover, debug console)
  // ---------------------------------------------------------------------------

  protected evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): void {
    if (!this.currentContinuation) {
      this.sendErrorResponse(response, 3, 'Not stopped')
      return
    }

    const expr = args.expression.trim()

    // Look up the expression as a variable name in the current scope
    const vars = Debugger.getVariables(this.currentContinuation)
    const found = vars.find(v => v.name === expr)

    if (found) {
      response.body = {
        result: stringifyValue(found.value, false),
        variablesReference: 0,
      }
      this.sendResponse(response)
    } else {
      response.body = {
        result: 'not available',
        variablesReference: 0,
      }
      this.sendResponse(response)
    }
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

// Launch the debug adapter as a standalone process
DvalaDebugSession.run(DvalaDebugSession)
