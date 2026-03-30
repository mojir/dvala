import type { SpecialExpression } from '../builtin'
import { builtin, specialExpressionKeys } from '../builtin'
import { normalExpressions } from '../builtin/normalExpressions'
import { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import { TypeError, UndefinedSymbolError } from '../errors'
import type { Any } from '../interface'
import type { DvalaModule } from '../builtin/modules/interface'
import type { NormalBuiltinFunction, SourceMap, SpecialBuiltinFunction, SymbolNode, UserDefinedSymbolNode } from '../parser/types'
import { resolveSourceCodeInfo } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { asNonUndefined } from '../typeGuards'
import { isBuiltinSymbolNode, isSpecialSymbolNode } from '../typeGuards/astNode'
import { toAny } from '../utils'
import { fromJS } from '../utils/interop'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import type { Context, LookUpResult } from './interface'
import { isContextEntry } from './interface'

interface CreateContextStackParams {
  globalContext?: Context
  contexts?: Context[]
  bindings?: Record<string, unknown>
  globalModuleScope?: boolean
}

export type ContextStack = ContextStackImpl

export class ContextStackImpl {
  private _contexts: Context[]
  public globalContext: Context
  private values?: Record<string, unknown>
  private modules: Map<string, DvalaModule>
  private valueModules: Map<string, unknown>
  public pure: boolean
  public sourceMap?: SourceMap
  constructor({
    contexts,
    values: hostValues,
    modules,
    valueModules,
    pure,
    sourceMap,
  }: {
    contexts: Context[]
    values?: Record<string, unknown>
    modules?: Map<string, DvalaModule>
    valueModules?: Map<string, unknown>
    pure?: boolean
    sourceMap?: SourceMap
  }) {
    this.globalContext = asNonUndefined(contexts[0])
    this._contexts = contexts
    this.values = hostValues
    this.modules = modules ?? new Map<string, DvalaModule>()
    this.valueModules = valueModules ?? new Map<string, unknown>()
    this.pure = pure ?? false
    this.sourceMap = sourceMap
  }

  public resolve(nodeId: number): SourceCodeInfo | undefined {
    return resolveSourceCodeInfo(nodeId, this.sourceMap)
  }

  // -- Serialization support (Phase 4) --

  /** Get the raw context chain for serialization. */
  public getContextsRaw(): Context[] {
    return this._contexts
  }

  /** Get host values (plain bindings passed at creation). */
  public getHostValues(): Record<string, unknown> | undefined {
    return this.values
  }

  /** Get the top-level module scope as plain key→value bindings. */
  public getModuleScopeBindings(): Record<string, unknown> {
    const scope = this._contexts[0]!
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(scope))
      result[k] = v.value
    return result
  }

  /**
   * Find the index of globalContext in the _contexts array.
   * Returns -1 if not found (should not happen in valid state).
   */
  public getGlobalContextIndex(): number {
    return this._contexts.indexOf(this.globalContext)
  }

  /**
   * Create a ContextStack from deserialized data.
   * `contexts` is the restored context chain (already resolved).
   * `globalContextIndex` identifies which element is the globalContext.
   * Host bindings (`values`, `modules`) come from resume options.
   */
  // Defensive: only called during deserialization with valid serialized data
  /* v8 ignore next 15 */
  public static fromDeserialized(params: {
    contexts: Context[]
    globalContextIndex: number
    values?: Record<string, unknown>
    modules?: Map<string, DvalaModule>
    pure: boolean
  }): ContextStackImpl {
    const cs = new ContextStackImpl({
      contexts: params.contexts,
      values: params.values,
      modules: params.modules,
      pure: params.pure,
    })
    if (params.globalContextIndex >= 0 && params.globalContextIndex < params.contexts.length) {
      cs.globalContext = params.contexts[params.globalContextIndex]!
    }
    return cs
  }

  /**
   * Replace the contexts array and globalContext. Used during deserialization
   * to fill in resolved context data after circular references are handled.
   */
  // Defensive: only called during deserialization with valid data
  /* v8 ignore next 6 */
  public setContextsFromDeserialized(contexts: Context[], globalContextIndex: number): void {
    this._contexts = contexts
    if (globalContextIndex >= 0 && globalContextIndex < contexts.length) {
      this.globalContext = contexts[globalContextIndex]!
    }
  }

  public getModule(name: string): DvalaModule | undefined {
    return this.modules.get(name)
  }

  public getValueModule(name: string): { value: unknown; found: boolean } {
    if (this.valueModules.has(name)) {
      return { value: this.valueModules.get(name), found: true }
    }
    return { value: undefined, found: false }
  }

  public registerValueModule(name: string, value: unknown): void {
    this.valueModules.set(name, value)
  }

  public create(context: Context): ContextStack {
    const globalContext = this.globalContext
    const contextStack = new ContextStackImpl({
      contexts: [context, ...this._contexts],
      values: this.values,
      modules: this.modules,
      valueModules: this.valueModules,
      pure: this.pure,
      sourceMap: this.sourceMap,
    })
    contextStack.globalContext = globalContext
    return contextStack
  }

  public new(context: Context): ContextStack {
    const contexts = [{}, context]

    return new ContextStackImpl({ contexts, modules: this.modules, valueModules: this.valueModules, pure: this.pure, sourceMap: this.sourceMap })
  }

  public addValues(values: Record<string, Any>, sourceCodeInfo: SourceCodeInfo | undefined) {
    const currentContext = this._contexts[0]!
    for (const [name, value] of Object.entries(values)) {
      if (currentContext[name]) {
        throw new TypeError(`Cannot redefine value "${name}"`, sourceCodeInfo)
      }
      // Special expressions (if, let, for, etc.) cannot be shadowed — they're keywords
      if (specialExpressionKeys.includes(name)) {
        throw new TypeError(`Cannot shadow special expression "${name}"`, sourceCodeInfo)
      }
      currentContext[name] = { value: toAny(value) }
    }
  }

  public getValue(name: string): unknown {
    for (const context of this._contexts) {
      const contextEntry = context[name]
      if (contextEntry)
        return contextEntry.value
    }

    return this.values?.[name]
  }

  public lookUp(node: UserDefinedSymbolNode): LookUpResult {
    return this.lookUpByName(node[1])
  }

  public lookUpByName(name: string): LookUpResult {
    for (const context of this._contexts) {
      const contextEntry = context[name]
      if (contextEntry)
        return contextEntry
    }
    const hostValue = this.values?.[name]
    if (hostValue !== undefined) {
      // Apply fromJS so plain JS arrays/objects passed as host bindings are
      // converted to PersistentVector/PersistentMap before entering the evaluator.
      return {
        value: fromJS(hostValue),
      }
    }

    return null
  }

  public evaluateSymbol(node: SymbolNode): Any {
    if (isSpecialSymbolNode(node)) {
      const functionType = node[1]
      switch (functionType) {
        case specialExpressionTypes['&&']:
        case specialExpressionTypes['||']:
        case specialExpressionTypes.array:
        case specialExpressionTypes.object:
        case specialExpressionTypes.recur:
        case specialExpressionTypes['??']: {
          const specialExpression: SpecialExpression = asNonUndefined(builtin.specialExpressions[functionType], this.resolve(node[2]))
          return {
            [FUNCTION_SYMBOL]: true,
            functionType: 'SpecialBuiltin',
            specialBuiltinSymbolType: functionType,
            sourceCodeInfo: this.resolve(node[2]),
            arity: specialExpression.arity,
          } satisfies SpecialBuiltinFunction
        }
        default:
          throw new TypeError(`Unknown special builtin symbol type: ${functionType}`, this.resolve(node[2]))
      }
    }
    if (isBuiltinSymbolNode(node)) {
      // Check user context first — builtins can be shadowed
      const name = node[1]
      const normalExpression = normalExpressions[name]!
      const userValue = this.lookUpByName(name)
      if (isContextEntry(userValue))
        return userValue.value
      return {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Builtin',
        normalBuiltinSymbolType: name,
        sourceCodeInfo: this.resolve(node[2]),
        arity: normalExpression.arity,
        name,
      } satisfies NormalBuiltinFunction
    }
    const lookUpResult = this.lookUp(node)

    if (isContextEntry(lookUpResult))
      return lookUpResult.value

    throw new UndefinedSymbolError(node[1], this.resolve(node[2]))
  }
}

function assertNotShadowingKeyword(name: string): void {
  if (specialExpressionKeys.includes(name)) {
    throw new TypeError(`Cannot shadow special expression "${name}"`, undefined)
  }
}

export function createContextStack(params: CreateContextStackParams = {}, modules?: Map<string, DvalaModule>, pure?: boolean, sourceMap?: SourceMap): ContextStack {
  const globalContext = params.globalContext ?? {}
  // Contexts are checked from left to right
  const contexts = params.contexts ? [globalContext, ...params.contexts] : [globalContext]

  let hostValues: Record<string, unknown> | undefined

  if (params.bindings) {
    for (const [identifier, entry] of Object.entries(params.bindings)) {
      if (identifier.includes('.')) {
        throw new TypeError(`Dots are not allowed in binding keys: "${identifier}"`, undefined)
      }
      assertNotShadowingKeyword(identifier)
      if (!hostValues) {
        hostValues = {}
      }
      hostValues[identifier] = entry
    }
  }

  const contextStack = new ContextStackImpl({
    contexts,
    values: hostValues,
    modules,
    pure,
    sourceMap,
  })
  return params.globalModuleScope ? contextStack : contextStack.create({})
}
