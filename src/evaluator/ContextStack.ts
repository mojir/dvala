import type { SpecialExpression } from '../builtin'
import { builtin, normalExpressionKeys, specialExpressionKeys } from '../builtin'
import { allNormalExpressions } from '../builtin/normalExpressions'
import { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import { DvalaError, UndefinedSymbolError } from '../errors'
import type { Any } from '../interface'
import type { ContextParams } from '../Dvala/Dvala'
import type { DvalaModule } from '../builtin/modules/interface'
import type { NormalBuiltinFunction, SpecialBuiltinFunction, SymbolNode, UserDefinedSymbolNode } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { asNonUndefined } from '../typeGuards'
import { isNormalBuiltinSymbolNode, isSpecialBuiltinSymbolNode } from '../typeGuards/astNode'
import { toAny } from '../utils'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import type { Context, LookUpResult } from './interface'
import { isContextEntry } from './interface'

export type ContextStack = ContextStackImpl

export class ContextStackImpl {
  private _contexts: Context[]
  public globalContext: Context
  private values?: Record<string, unknown>
  private modules: Map<string, DvalaModule>
  private valueModules: Map<string, unknown>
  public pure: boolean
  constructor({
    contexts,
    values: hostValues,
    modules,
    valueModules,
    pure,
  }: {
    contexts: Context[]
    values?: Record<string, unknown>
    modules?: Map<string, DvalaModule>
    valueModules?: Map<string, unknown>
    pure?: boolean
  }) {
    this.globalContext = asNonUndefined(contexts[0])
    this._contexts = contexts
    this.values = hostValues
    this.modules = modules ?? new Map<string, DvalaModule>()
    this.valueModules = valueModules ?? new Map<string, unknown>()
    this.pure = pure ?? false
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
  public setContextsFromDeserialized(contexts: Context[], globalContextIndex: number): void {
    this._contexts = contexts
    if (globalContextIndex >= 0 && globalContextIndex < contexts.length) {
      this.globalContext = contexts[globalContextIndex]!
    }
  }

  public getModule(name: string): DvalaModule | undefined {
    return this.modules.get(name)
  }

  public getValueModule(name: string): { value: unknown, found: boolean } {
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
    })
    contextStack.globalContext = globalContext
    return contextStack
  }

  public new(context: Context): ContextStack {
    const contexts = [{}, context]

    return new ContextStackImpl({ contexts, modules: this.modules, valueModules: this.valueModules, pure: this.pure })
  }

  public addValues(values: Record<string, Any>, sourceCodeInfo: SourceCodeInfo | undefined) {
    const currentContext = this._contexts[0]!
    for (const [name, value] of Object.entries(values)) {
      if (currentContext[name]) {
        throw new DvalaError(`Cannot redefine value "${name}"`, sourceCodeInfo)
      }
      const shadowedName = getShadowedBuiltinName(name)
      if (shadowedName) {
        throw new DvalaError(`Cannot shadow ${shadowedName}`, sourceCodeInfo)
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
    const value = node[1]

    for (const context of this._contexts) {
      const contextEntry = context[value]
      if (contextEntry)
        return contextEntry
    }
    const hostValue = this.values?.[value]
    if (hostValue !== undefined) {
      return {
        value: toAny(hostValue),
      }
    }

    return null
  }

  public evaluateSymbol(node: SymbolNode): Any {
    if (isSpecialBuiltinSymbolNode(node)) {
      const functionType = node[1]
      switch (functionType) {
        case specialExpressionTypes['&&']:
        case specialExpressionTypes['||']:
        case specialExpressionTypes.array:
        case specialExpressionTypes.object:
        case specialExpressionTypes['defined?']:
        case specialExpressionTypes.recur:
        case specialExpressionTypes['??']: {
          const specialExpression: SpecialExpression = asNonUndefined(builtin.specialExpressions[functionType], node[2])
          return {
            [FUNCTION_SYMBOL]: true,
            functionType: 'SpecialBuiltin',
            specialBuiltinSymbolType: functionType,
            sourceCodeInfo: node[2],
            arity: specialExpression.arity,
          } satisfies SpecialBuiltinFunction
        }
        default:
          throw new DvalaError(`Unknown special builtin symbol type: ${functionType}`, node[2])
      }
    }
    if (isNormalBuiltinSymbolNode(node)) {
      const type = node[1]
      const normalExpression = allNormalExpressions[type]!
      const name = normalExpression.name!
      return {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Builtin',
        normalBuiltinSymbolType: type,
        sourceCodeInfo: node[2],
        arity: normalExpression.arity,
        name,
      } satisfies NormalBuiltinFunction
    }
    const lookUpResult = this.lookUp(node)

    if (isContextEntry(lookUpResult))
      return lookUpResult.value

    throw new UndefinedSymbolError(node[1], node[2])
  }
}

function getShadowedBuiltinName(name: string): string | null {
  if (specialExpressionKeys.includes(name))
    return `special expression "${name}"`
  if (normalExpressionKeys.includes(name))
    return `builtin function "${name}"`
  if (name === 'self')
    return `builtin value "${name}"`
  return null
}

function assertNotShadowingBuiltin(name: string): void {
  const shadowedName = getShadowedBuiltinName(name)
  if (shadowedName) {
    throw new DvalaError(`Cannot shadow ${shadowedName}`, undefined)
  }
}

export function createContextStack(params: ContextParams = {}, modules?: Map<string, DvalaModule>, pure?: boolean): ContextStack {
  const globalContext = params.globalContext ?? {}
  // Contexts are checked from left to right
  const contexts = params.contexts ? [globalContext, ...params.contexts] : [globalContext]

  let hostValues: Record<string, unknown> | undefined

  if (params.bindings) {
    for (const [identifier, entry] of Object.entries(params.bindings)) {
      if (identifier.includes('.')) {
        throw new DvalaError(`Dots are not allowed in binding keys: "${identifier}"`, undefined)
      }
      assertNotShadowingBuiltin(identifier)
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
  })
  return params.globalModuleScope ? contextStack : contextStack.create({})
}
