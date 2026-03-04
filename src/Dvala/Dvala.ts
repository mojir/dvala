import { getUndefinedSymbols } from '../getUndefinedSymbols'
import { evaluate, evaluateAsync, evaluateNode, evaluateWithEffects } from '../evaluator/trampoline'
import { createContextStack } from '../evaluator/ContextStack'
import type { Context } from '../evaluator/interface'
import type { Any, Obj } from '../interface'
import type { Ast, DvalaFunction } from '../parser/types'
import { tokenize } from '../tokenizer/tokenize'
import type { TokenStream } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { transformSymbolTokens } from '../transformer'
import { untokenize } from '../untokenizer'
import { builtin } from '../builtin'
import { AutoCompleter } from '../AutoCompleter/AutoCompleter'
import type { DvalaModule } from '../builtin/modules/interface'
import { isDvalaBundle } from '../bundler/interface'
import type { DvalaBundle } from '../bundler/interface'
import type { MaybePromise } from '../utils/maybePromise'

import { parse } from '../parser'
import type { Handlers } from '../evaluator/effectTypes'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from '../utils/symbols'
import { Cache } from './Cache'

export interface DvalaRuntimeInfo {
  astCache: Cache | null
  astCacheSize: number | null
  debug: boolean
}

export interface ContextParams {
  globalContext?: Context
  contexts?: Context[]
  bindings?: Record<string, unknown>
  handlers?: Handlers
  globalModuleScope?: boolean
}

export interface MinifyParams {
  minify?: boolean
}

export interface FilePathParams {
  filePath?: string
}

export interface PureParams {
  pure?: boolean
}

interface DvalaConfig {
  initialCache?: Record<string, Ast>
  astCacheSize?: number | null
  debug?: boolean
  modules?: DvalaModule[]
}

export class Dvala {
  private astCache: Cache | null
  private astCacheSize: number | null
  private debug: boolean
  private modules: Map<string, DvalaModule>

  constructor(config: DvalaConfig = {}) {
    this.debug = config.debug ?? false
    this.astCacheSize = config.astCacheSize ?? null
    if (this.astCacheSize) {
      this.astCache = new Cache(this.astCacheSize)
      const initialCache = config.initialCache ?? {}
      for (const cacheEntry of Object.keys(initialCache))
        this.astCache.set(cacheEntry, initialCache[cacheEntry] as Ast)
    }
    else {
      this.astCache = null
    }
    const nsList = config.modules ?? []
    this.modules = new Map(nsList.map(ns => [ns.name, ns]))
  }

  public getRuntimeInfo(): DvalaRuntimeInfo {
    return {
      astCacheSize: this.astCacheSize,
      astCache: this.astCache,
      debug: this.debug,
    }
  }

  public readonly async = {
    run: async (programOrBundle: string | DvalaBundle, params: ContextParams & FilePathParams & PureParams = {}): Promise<unknown> => {
      assertSerializableBindings(params.bindings)
      if (isDvalaBundle(programOrBundle)) {
        return this.runBundle(programOrBundle, params)
      }
      const ast = this.generateAst(programOrBundle, params)
      if (params.handlers) {
        const contextStack = createContextStack(params, this.modules, params.pure)
        const result = await evaluateWithEffects(ast, contextStack, params.handlers)
        if (result.type === 'completed')
          return result.value
        if (result.type === 'error')
          throw result.error
        throw new TypeError('Unexpected suspension in Dvala.async.run(). Use the standalone effects API for suspend/resume.')
      }
      return this.evaluateAsync(ast, params)
    },
    apply: async (fn: DvalaFunction, fnParams: unknown[], params: ContextParams & PureParams = {}): Promise<unknown> => {
      return this.apply(fn, fnParams, params)
    },
  }

  public run(programOrBundle: string | DvalaBundle, params: ContextParams & FilePathParams & PureParams = {}): unknown {
    assertSerializableBindings(params.bindings)
    if (isDvalaBundle(programOrBundle)) {
      return this.runBundle(programOrBundle, params)
    }
    const ast = this.generateAst(programOrBundle, params)
    const result = this.evaluate(ast, params)
    if (result instanceof Promise) {
      throw new TypeError('Unexpected async result in synchronous run(). Use dvala.async.run() for async operations.')
    }
    return result
  }

  private runBundle(bundle: DvalaBundle, params: ContextParams & FilePathParams & PureParams = {}): unknown {
    const contextStack = createContextStack(params, this.modules, params.pure)

    // Evaluate file modules in dependency order and register as value modules.
    // Each file module is evaluated in its own scope so local bindings don't leak.
    // File modules are always evaluated in pure mode to ensure deterministic,
    // side-effect-free initialization regardless of the caller's pure setting.
    const savedPure = contextStack.pure
    contextStack.pure = true
    for (const [name, source] of bundle.fileModules) {
      const ast = this.generateAst(source, params)
      const moduleContextStack = contextStack.create({})
      const result = evaluate(ast, moduleContextStack)

      // TODO: When async functions in file modules are able to mark themselves as pure and
      // are returning a Promise, uncomment the following check, and make sure a test is verifying the behaviour.
      // if (result instanceof Promise) {
      //   throw new TypeError('Unexpected async result in synchronous runBundle(). Use dvala.async.run() for async operations.')
      // }
      contextStack.registerValueModule(name, result)
    }
    contextStack.pure = savedPure

    // Parse and evaluate the main program
    const ast = this.generateAst(bundle.program, params)
    const result = evaluate(ast, contextStack)
    if (result instanceof Promise) {
      throw new TypeError('Unexpected async result in synchronous runBundle(). Use dvala.async.run() for async operations.')
    }
    return result
  }

  public getUndefinedSymbols(programOrAst: string | Ast, params: ContextParams = {}): Set<string> {
    const ast = typeof programOrAst === 'string' ? this.generateAst(programOrAst, params) : programOrAst
    const contextStack = createContextStack(params, this.modules)
    return getUndefinedSymbols(ast, contextStack, builtin, evaluateNode)
  }

  public tokenize(program: string, tokenizeParams: FilePathParams & MinifyParams = {}): TokenStream {
    const tokenStream = tokenize(program, this.debug, tokenizeParams.filePath)
    return tokenizeParams.minify ? minifyTokenStream(tokenStream, { removeWhiteSpace: false }) : tokenStream
  }

  public parse(tokenStream: TokenStream): Ast {
    tokenStream = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = {
      body: [],
      hasDebugData: tokenStream.hasDebugData,
    }

    ast.body = parse(tokenStream)

    return ast
  }

  private evaluate(ast: Ast, params: ContextParams & PureParams): MaybePromise<Any> {
    const contextStack = createContextStack(params, this.modules, params.pure)
    return evaluate(ast, contextStack)
  }

  private evaluateAsync(ast: Ast, params: ContextParams & PureParams): Promise<Any> {
    const contextStack = createContextStack(params, this.modules, params.pure)
    return evaluateAsync(ast, contextStack)
  }

  public transformSymbols(tokenStream: TokenStream, transformer: (symbol: string) => string): TokenStream {
    return transformSymbolTokens(tokenStream, transformer)
  }

  public untokenize(tokenStream: TokenStream): string {
    return untokenize(tokenStream)
  }

  public apply(fn: DvalaFunction, fnParams: unknown[], params: ContextParams & PureParams = {}): MaybePromise<Any> {
    const fnName = 'FN_2eb7b316_471c_5bfa_90cb_d3dfd9164a59'
    const program = this.generateApplyFunctionCall(fnName, fnParams)

    const ast = this.generateAst(program, params)

    const hostValues: Obj = fnParams.reduce(
      (result: Obj, param, index) => {
        result[`${fnName}_${index}`] = param
        return result
      },
      { [fnName]: fn },
    )

    params.bindings = { ...params.bindings, ...hostValues }

    return this.evaluate(ast, params)
  }

  private generateApplyFunctionCall(fnName: string, fnParams: unknown[]) {
    const paramsString: string = fnParams
      .map((_, index) => {
        return `${fnName}_${index}`
      })
      .join(', ')
    return `${fnName}(${paramsString})`
  }

  private generateAst(program: string, params: ContextParams & FilePathParams): Ast {
    if (this.astCache) {
      const cachedAst = this.astCache.get(program)
      if (cachedAst)
        return cachedAst
    }
    const tokenStream = this.tokenize(program, {
      filePath: params.filePath,
    })
    const ast: Ast = this.parse(tokenStream)
    this.astCache?.set(program, ast)
    return ast
  }

  public getAutoCompleter(program: string, position: number, params: ContextParams = {}): AutoCompleter {
    return new AutoCompleter(program, position, this, params)
  }
}

function assertSerializableBindings(bindings: Record<string, unknown> | undefined): void {
  if (!bindings)
    return
  for (const [key, value] of Object.entries(bindings)) {
    assertSerializable(value, `bindings["${key}"]`)
  }
}

function assertSerializable(value: unknown, path: string): void {
  if (value === null || value === undefined)
    return
  if (typeof value === 'boolean' || typeof value === 'string')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${path} is not serializable (${value})`)
    return
  }
  if (typeof value === 'function')
    throw new TypeError(`${path} is not serializable (function)`)
  if (typeof value === 'object') {
    // Dvala values (functions, regexps, effects) are valid
    if (FUNCTION_SYMBOL in value) {
      return
    }
    if (REGEXP_SYMBOL in value || EFFECT_SYMBOL in value)
      return
    if (Array.isArray(value)) {
      value.forEach((item, i) => assertSerializable(item, `${path}[${i}]`))
      return
    }
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new TypeError(`${path} is not serializable (not a plain object)`)
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      assertSerializable(v, `${path}.${k}`)
    return
  }
  throw new TypeError(`${path} is not serializable`)
}
