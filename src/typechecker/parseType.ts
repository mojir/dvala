/**
 * Type annotation parser for Dvala.
 *
 * Parses type annotation strings like "(Number, Number) -> Number" into
 * Type values. Used for builtin function type signatures and eventually
 * for user-written type annotations in source code.
 *
 * Grammar (simplified):
 *   Type       = UnionType
 *   UnionType  = InterType ("|" InterType)*
 *   InterType  = PrefixType ("&" PrefixType)*
 *   PrefixType = "!" PrefixType | PostfixType
 *   PostfixType= PrimaryType ("[]")*
 *   PrimaryType= "(" FuncOrParen ")" | "[" TupleType "]" | "{" RecordType "}"
 *              | "Number" | "String" | "Boolean" | "Null" | "Regex"
 *              | "Unknown" | "Never"
 *              | ":" identifier                    // atom type
 *              | number | string | "true" | "false" // literal types
 *              | uppercase-identifier               // type variable (A, B, T, etc.)
 *   FuncOrParen= ParamList [":" Type] "->" [EffectSet] Type    // function type
 *              | ParamList "->" identifier "is" Type // type guard
 *              | Type                               // parenthesized type
 *   ParamList   = Param ("," Param)*
 *   Param       = Type | identifier ["?"] ":" Type | "..." Type[] | "..." identifier ":" Type[]
 *   EffectSet  = "@{" [effectName ("," effectName)*] ["," "..."] "}"
 */

import type { RowVarTail, Type } from './types'
import {
  NumberType, IntegerType, StringType, BooleanType, NullType,
  Unknown, Never, RegexType, AnyFunction, PureEffects,
  atom, literal, fn, array, tuple, union, inter, neg, effectSet, handlerType,
} from './types'
import { getEffectDeclaration } from './effectTypes'

// ---------------------------------------------------------------------------
// Type alias registry
// ---------------------------------------------------------------------------

/** Registered type aliases: name → { params, body string } */
const typeAliasRegistry = new Map<string, { params: string[]; body: string }>()

export interface TypeAliasRegistrySnapshot {
  entries: [string, { params: string[]; body: string }][]
}

/** Register a type alias. Called by typecheck.ts from parsed AST. */
export function registerTypeAlias(name: string, params: string[], body: string): void {
  typeAliasRegistry.set(name, { params, body })
}

/** Reset user-registered type aliases (called between typecheck passes). */
export function resetTypeAliases(): void {
  typeAliasRegistry.clear()
}

/** Snapshot the current alias registry so nested import typechecking can restore it. */
export function snapshotTypeAliases(): TypeAliasRegistrySnapshot {
  return {
    entries: [...typeAliasRegistry.entries()].map(([name, alias]) => [name, { params: [...alias.params], body: alias.body }]),
  }
}

/** Restore a previously captured alias registry snapshot. */
export function restoreTypeAliases(snapshot: TypeAliasRegistrySnapshot): void {
  typeAliasRegistry.clear()
  for (const [name, alias] of snapshot.entries) {
    typeAliasRegistry.set(name, alias)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a type annotation string into a Type value.
 * Throws on syntax errors.
 */
export function parseTypeAnnotation(input: string): Type {
  const parser = new TypeParser(input)
  const result = parser.parseType()
  if (!parser.isAtEnd()) {
    throw new TypeParseError(`Unexpected token: '${parser.remaining()}'`, input, parser.pos)
  }
  return result
}

/**
 * Parse a function type annotation string. Returns the parsed type
 * plus any type guard info (parameter name and narrowed type).
 */
export interface ParsedFunctionType {
  type: Type
  /** If the function is a type guard, the parameter name being narrowed. */
  guardParam?: string
  /** If the function is a type guard, the type it narrows to. */
  guardType?: Type
}

export function parseFunctionTypeAnnotation(input: string): ParsedFunctionType {
  const parser = new TypeParser(input)
  const result = parser.parseFunctionOrType()
  if (!parser.isAtEnd()) {
    throw new TypeParseError(`Unexpected token: '${parser.remaining()}'`, input, parser.pos)
  }
  return result
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class TypeParser {
  private input: string
  pos: number
  /** Maps type variable names (A, B, T, etc.) to shared Var nodes within this annotation. */
  private typeVarMap = new Map<string, Type>()
  private nextVarId = 0
  /**
   * Maps row-variable names (a, b, …, single lowercase) to shared RowVar tails
   * within this annotation. Two `@{e | ρ}` occurrences in one signature
   * reference the same RowVar, enabling positional unification.
   *
   * Kept separate from `typeVarMap` by design: value-type vars have `Type[]`
   * bounds while row vars have `Set<string>[]` bounds. Static dispatch by kind
   * is cleaner than a discriminated union.
   */
  private rowVarMap = new Map<string, RowVarTail>()
  private nextRowVarId = 0
  private scopedTypeRefs: Map<string, Type>

  constructor(input: string, scopedTypeRefs = new Map<string, Type>()) {
    this.input = input
    this.pos = 0
    this.scopedTypeRefs = scopedTypeRefs
  }

  // --- Core parsing ---

  parseType(): Type {
    return this.parseUnion()
  }

  /**
   * Parse either a function type (if we see params + ->) or a regular type.
   * Also detects type guard syntax: (x: T) -> x is U
   */
  parseFunctionOrType(): ParsedFunctionType {
    // Try to parse as function type
    const saved = this.pos
    if (this.tryConsume('(')) {
      const paramsResult = this.tryParseParams()
      if (paramsResult !== null) {
        // Check for return type annotation: ): ReturnType ->
        let returnTypeAnnotation: Type | undefined
        if (this.tryConsume(':')) {
          this.skipWhitespace()
          returnTypeAnnotation = this.parseType()
          this.skipWhitespace()
        }

        if (this.tryConsume('->')) {
          this.skipWhitespace()
          // Check for type guard: -> paramName is Type
          const guardResult = this.tryParseTypeGuard(paramsResult.params)
          if (guardResult) {
            const funcType = fn(paramsResult.types, BooleanType, PureEffects, undefined, paramsResult.restType)
            return {
              type: funcType,
              guardParam: guardResult.paramName,
              guardType: guardResult.guardType,
            }
          }
          // Regular return type
          const effects = this.tryParseEffectSet() ?? undefined
          const retType = this.parseType()
          const funcType = fn(paramsResult.types, returnTypeAnnotation ?? retType, effects, undefined, paramsResult.restType)
          return { type: funcType }
        }
      }
      // Not a function — backtrack and parse as regular type
      this.pos = saved
    }

    return { type: this.parseType() }
  }

  // --- Precedence levels ---

  private parseUnion(): Type {
    let left = this.parseIntersection()
    this.skipWhitespace()
    while (this.tryConsume('|')) {
      this.skipWhitespace()
      const right = this.parseIntersection()
      left = union(left, right)
      this.skipWhitespace()
    }
    return left
  }

  private parseIntersection(): Type {
    let left = this.parsePrefix()
    this.skipWhitespace()
    while (this.tryConsume('&')) {
      this.skipWhitespace()
      const right = this.parsePrefix()
      left = inter(left, right)
      this.skipWhitespace()
    }
    return left
  }

  private parsePrefix(): Type {
    this.skipWhitespace()
    if (this.tryConsume('!')) {
      return neg(this.parsePrefix())
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Type {
    let t = this.parsePrimary()
    // Postfix operators: [] for arrays, ? for nullable — can chain in any order
    // Number[]  → array of numbers
    // Number?   → Number | Null
    // Number?[] → (Number | Null)[]
    // Number[]? → Number[] | Null
    for (;;) {
      if (this.tryConsume('[]')) {
        t = array(t)
      } else if (this.peek() === '?' && this.peekAt(1) !== '.') {
        this.advance()
        t = union(t, NullType)
      } else {
        break
      }
    }
    return t
  }

  private parsePrimary(): Type {
    this.skipWhitespace()

    // Parenthesized type or function type
    if (this.peek() === '(') {
      return this.parseParenOrFunction()
    }

    // Tuple type: [T, U, ...]
    if (this.peek() === '[') {
      return this.parseTupleType()
    }

    // Record type: { name: T, ... }
    if (this.peek() === '{') {
      return this.parseRecordType()
    }

    // Atom type: :name
    if (this.peek() === ':') {
      this.advance()
      const name = this.readIdentifier()
      if (!name) throw this.error('Expected identifier after ":"')
      return atom(name)
    }

    // String literal type: "hello"
    if (this.peek() === '"') {
      return this.parseStringLiteral()
    }

    // Number literal type: 42, -3.14
    if (this.isDigit(this.peek()) || (this.peek() === '-' && this.isDigit(this.peekAt(1)))) {
      return this.parseNumberLiteral()
    }

    // Named types
    const name = this.readIdentifier()
    if (!name) throw this.error('Expected type')

    switch (name) {
      case 'Number': return NumberType
      case 'Integer': return IntegerType
      case 'String': return StringType
      case 'Boolean': return BooleanType
      case 'Null': return NullType
      case 'Regex': return RegexType
      case 'Function': return AnyFunction
      case 'Handler': return this.parseHandlerType()
      case 'Unknown': return Unknown
      case 'Never': return Never
      case 'true': return literal(true)
      case 'false': return literal(false)
      default:
        // Single uppercase letter = type variable (for polymorphic types)
        // Multi-char identifiers starting with uppercase = named type / alias
        return this.makeTypeRef(name)
    }
  }

  // --- Compound type parsers ---

  private parseParenOrFunction(): Type {
    this.consume('(')
    this.skipWhitespace()

    // Empty parens: () -> T
    if (this.tryConsume(')')) {
      this.skipWhitespace()
      if (this.tryConsume('->')) {
        this.skipWhitespace()
        const effects = this.tryParseEffectSet() ?? undefined
        const retType = this.parseType()
        return fn([], retType, effects)
      }
      throw this.error('Expected "->" after "()"')
    }

    // Try to parse as function params
    const saved = this.pos
    const paramsResult = this.tryParseParamList()

    if (paramsResult !== null && this.tryConsume(')')) {
      this.skipWhitespace()
      if (this.tryConsume('->')) {
        this.skipWhitespace()
        const effects = this.tryParseEffectSet() ?? undefined
        const retType = this.parseType()
        return fn(paramsResult.types, retType, effects, undefined, paramsResult.restType)
      }
      // Not a function — if we parsed a single type, return it as parenthesized
      if (paramsResult.types.length === 1 && !paramsResult.hasNames) {
        return paramsResult.types[0]!
      }
    }

    // Backtrack — parse as parenthesized expression
    this.pos = saved
    const inner = this.parseType()
    this.skipWhitespace()
    this.consume(')')
    return inner
  }

  private parseTupleType(): Type {
    this.consume('[')
    this.skipWhitespace()
    const elements: Type[] = []
    if (this.peek() !== ']') {
      elements.push(this.parseType())
      this.skipWhitespace()
      while (this.tryConsume(',')) {
        this.skipWhitespace()
        elements.push(this.parseType())
        this.skipWhitespace()
      }
    }
    this.consume(']')
    return tuple(elements)
  }

  private parseRecordType(): Type {
    this.consume('{')
    this.skipWhitespace()
    const fields = new Map<string, Type>()
    let open = false

    if (this.peek() !== '}') {
      // Check for open record: { ... } or { field, ... }
      if (this.tryConsume('...')) {
        open = true
        this.skipWhitespace()
      } else {
        // Parse fields: name: Type
        const { name, type: fieldType } = this.parseRecordField()
        fields.set(name, fieldType)
        this.skipWhitespace()

        while (this.tryConsume(',')) {
          this.skipWhitespace()
          if (this.tryConsume('...')) {
            open = true
            this.skipWhitespace()
            break
          }
          const field = this.parseRecordField()
          fields.set(field.name, field.type)
          this.skipWhitespace()
        }
      }
    }
    this.consume('}')
    return { tag: 'Record', fields, open }
  }

  private parseRecordField(): { name: string; type: Type } {
    const name = this.readIdentifier()
    if (!name) throw this.error('Expected field name')
    this.skipWhitespace()
    this.consume(':')
    this.skipWhitespace()
    const type = this.parseType()
    return { name, type }
  }

  private parseStringLiteral(): Type {
    this.consume('"')
    let value = ''
    while (this.pos < this.input.length && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance()
        value += this.peek()
      } else {
        value += this.peek()
      }
      this.advance()
    }
    this.consume('"')
    return literal(value)
  }

  private parseNumberLiteral(): Type {
    const start = this.pos
    if (this.peek() === '-') this.advance()
    while (this.isDigit(this.peek())) this.advance()
    if (this.peek() === '.') {
      this.advance()
      while (this.isDigit(this.peek())) this.advance()
    }
    const value = Number(this.input.slice(start, this.pos))
    return literal(value)
  }

  private parseHandlerType(): Type {
    this.consume('<')
    const bodyType = this.parseType()

    this.skipWhitespace()
    this.consume(',')
    const outputType = this.parseType()

    this.skipWhitespace()
    this.consume(',')
    const handledEffects = this.tryParseEffectSet()
    if (!handledEffects) {
      throw this.error('Expected effect set in Handler type')
    }
    if (handledEffects.tail.tag !== 'Closed') {
      throw this.error('Open effect sets are not supported in the handled slot of Handler types')
    }

    // Optional 4th slot: @{introduced}. Defaults to @{} (PureEffects) when
    // omitted, so three-slot Handler<B, O, @{caught}> form stays legal.
    // Needed for handler-returning functions (e.g. effectHandler.fallback)
    // to declare their introduced set directly in the type string rather
    // than via the `wrapper` metadata escape hatch.
    this.skipWhitespace()
    let introducedEffects = PureEffects
    if (this.tryConsume(',')) {
      this.skipWhitespace()
      const parsed = this.tryParseEffectSet()
      if (!parsed) {
        throw this.error('Expected effect set in 4th slot of Handler type (introduced effects)')
      }
      introducedEffects = parsed
      this.skipWhitespace()
    }
    this.consume('>')

    const handled = new Map<string, { argType: Type; retType: Type }>()
    for (const effectName of handledEffects.effects) {
      const declaration = getEffectDeclaration(effectName)
      if (!declaration) {
        throw this.error(`Unknown effect '${effectName}' in Handler type`)
      }
      handled.set(effectName, {
        argType: declaration.argType,
        retType: declaration.retType,
      })
    }

    return handlerType(bodyType, outputType, handled, introducedEffects)
  }

  private tryParseEffectSet(): ReturnType<typeof effectSet> | null {
    const saved = this.pos
    this.skipWhitespace()
    if (!this.tryConsume('@')) return null

    this.skipWhitespace()
    if (!this.tryConsume('{')) {
      this.pos = saved
      return null
    }

    this.skipWhitespace()
    const effects: string[] = []
    let open = false
    let rowVarName: string | null = null

    // Handle leading "| ρ" form: @{| ρ} — no concrete effects, row-var tail.
    if (this.tryConsume('|')) {
      this.skipWhitespace()
      rowVarName = this.readRowVarName()
      if (!rowVarName) {
        this.pos = saved
        return null
      }
      this.skipWhitespace()
    }

    while (!rowVarName && !this.isAtEnd()) {
      if (this.tryConsume('...')) {
        open = true
        this.skipWhitespace()
        break
      }

      if (this.peek() === '}') break

      const effectName = this.readEffectIdentifier()
      if (!effectName) {
        this.pos = saved
        return null
      }
      effects.push(effectName)
      this.skipWhitespace()

      if (this.tryConsume(',')) {
        this.skipWhitespace()
        continue
      }

      // "| ρ" — named row-variable tail.
      if (this.tryConsume('|')) {
        this.skipWhitespace()
        rowVarName = this.readRowVarName()
        if (!rowVarName) {
          this.pos = saved
          return null
        }
        this.skipWhitespace()
      }
      break
    }

    if (!this.tryConsume('}')) {
      this.pos = saved
      return null
    }

    this.skipWhitespace()

    if (rowVarName) {
      const rowVar = this.resolveRowVar(rowVarName)
      return { effects: new Set(effects), tail: rowVar }
    }
    return effectSet(effects, open)
  }

  /**
   * Read a row-variable name. Row-var names are a single lowercase Latin
   * letter (`a`–`z`), staying distinct from value-type vars (single uppercase).
   * Returns null if the next token isn't a row-var name.
   */
  private readRowVarName(): string | null {
    const c = this.peek()
    if (!c || c < 'a' || c > 'z') return null
    // Single letter, not followed by another ident char — so `r` but not
    // `rho` (avoids accidentally swallowing longer identifiers if we ever
    // expand the form).
    const next = this.input[this.pos + 1]
    if (next && this.isIdentChar(next)) return null
    this.pos++
    return c
  }

  /**
   * Resolve a row-var name to a shared `RowVar` tail within this annotation's
   * scope. Repeated uses of the same name return the *same* `RowVar` object,
   * giving positional unification within one parsed signature.
   */
  private resolveRowVar(name: string): RowVarTail {
    const existing = this.rowVarMap.get(name)
    if (existing) return existing
    const rowVar: RowVarTail = {
      tag: 'RowVar',
      id: this.nextRowVarId++,
      level: 0,
      lowerBounds: [],
      upperBounds: [],
      lowerVarBounds: [],
      upperVarBounds: [],
    }
    this.rowVarMap.set(name, rowVar)
    return rowVar
  }

  // --- Function parameter parsing ---

  /**
   * Try to parse function parameters. Returns null if this doesn't
   * look like a parameter list (backtrack).
   */
  private tryParseParams(): { params: ParamInfo[]; types: Type[]; restType?: Type } | null {
    this.skipWhitespace()
    const result = this.tryParseParamList()
    if (result === null) return null
    this.skipWhitespace()
    if (!this.tryConsume(')')) return null
    this.skipWhitespace()
    return result
  }

  private tryParseParamList(): { params: ParamInfo[]; types: Type[]; hasNames: boolean; restType?: Type } | null {
    const params: ParamInfo[] = []
    const types: Type[] = []
    let hasNames = false
    let restType: Type | undefined

    // First param
    const first = this.tryParseParam()
    if (first === null) return null
    params.push(first)
    if (first.rest) {
      restType = this.extractRestElementType(first.type)
    } else {
      types.push(first.type)
    }
    if (first.name) hasNames = true
    if (first.rest) {
      this.skipWhitespace()
      return { params, types, hasNames, restType }
    }

    // Remaining params
    this.skipWhitespace()
    while (this.peek() === ',') {
      const saved = this.pos
      this.advance() // consume ','
      this.skipWhitespace()
      const param = this.tryParseParam()
      if (param === null) {
        this.pos = saved
        break
      }
      params.push(param)
      if (param.rest) {
        restType = this.extractRestElementType(param.type)
      } else {
        types.push(param.type)
      }
      if (param.name) hasNames = true
      this.skipWhitespace()
      if (param.rest) {
        if (this.peek() === ',') {
          throw this.error('Rest parameter must be last')
        }
        break
      }
    }

    return { params, types, hasNames, restType }
  }

  private tryParseParam(): ParamInfo | null {
    const saved = this.pos
    this.skipWhitespace()

    // Rest parameter: ...name: Type[] or ...Type[]
    if (this.tryConsume('...')) {
      this.skipWhitespace()
      const name = this.readIdentifier()
      this.skipWhitespace()
      if (name && this.tryConsume(':')) {
        this.skipWhitespace()
        const type = this.parseType()
        return { name, type, rest: true }
      }
      // No name — just a type
      this.pos = saved + 3
      const type = this.parseType()
      return { type, rest: true }
    }

    // Named param: name: Type or name?: Type
    const name = this.readIdentifier()
    if (name) {
      this.skipWhitespace()
      const optional = this.tryConsume('?')
      if (this.tryConsume(':')) {
        this.skipWhitespace()
        let type = this.parseType()
        if (optional) {
          type = union(type, NullType)
        }
        return { name, type, optional }
      }
      // Just a name — could be a type name, backtrack
      this.pos = saved
    }

    // Unnamed: just a type
    try {
      const type = this.parseType()
      return { type }
    } catch {
      this.pos = saved
      return null
    }
  }

  // --- Type guard parsing ---

  /**
   * Try to parse "paramName is Type" after "->".
   * Returns null if this isn't a type guard.
   */
  private tryParseTypeGuard(params: ParamInfo[]): { paramName: string; guardType: Type } | null {
    const saved = this.pos
    const name = this.readIdentifier()
    if (!name) return null

    this.skipWhitespace()
    const isKeyword = this.readIdentifier()
    if (isKeyword !== 'is') {
      this.pos = saved
      return null
    }

    // Verify the name refers to a parameter
    const param = params.find(p => p.name === name)
    if (!param) {
      this.pos = saved
      return null
    }

    this.skipWhitespace()
    const guardType = this.parseType()
    return { paramName: name, guardType }
  }

  // --- Type variable / named type ---

  private makeTypeRef(name: string): Type {
    const scoped = this.scopedTypeRefs.get(name)
    if (scoped) return scoped

    // Single uppercase letter = type variable (A, B, T, K, V, etc.)
    // Same letter within one annotation → same variable (shared identity)
    if (name.length === 1 && name >= 'A' && name <= 'Z') {
      const existing = this.typeVarMap.get(name)
      if (existing) return existing
      const v: Type = { tag: 'Var', id: this.nextVarId++, level: 0, lowerBounds: [], upperBounds: [] }
      this.typeVarMap.set(name, v)
      return v
    }
    // Multi-char uppercase names: check type alias registry
    const alias = typeAliasRegistry.get(name)
    if (alias) {
      const args = this.tryParseTypeArguments()
      if (args.length !== alias.params.length) {
        throw this.error(`Type alias '${name}' expects ${alias.params.length} type argument(s), got ${args.length}`)
      }

      const scopedTypeRefs = new Map(alias.params.map((param, index) => [param, args[index]!]))
      const parser = new TypeParser(alias.body, scopedTypeRefs)
      const expanded = parser.parseType()
      if (!parser.isAtEnd()) {
        throw this.error(`Unexpected token in type alias '${name}': '${parser.remaining()}'`)
      }
      return { tag: 'Alias', name, args, expanded }
    }
    // Unknown named type
    return Unknown
  }

  private tryParseTypeArguments(): Type[] {
    this.skipWhitespace()
    if (!this.tryConsume('<')) {
      return []
    }

    const args: Type[] = []
    this.skipWhitespace()
    if (this.tryConsume('>')) {
      return args
    }

    for (;;) {
      args.push(this.parseType())
      this.skipWhitespace()
      if (this.tryConsume(',')) {
        this.skipWhitespace()
        continue
      }
      if (this.tryConsume('>')) {
        return args
      }
      throw this.error('Expected "," or ">" in type argument list')
    }
  }

  // --- Lexer helpers ---

  isAtEnd(): boolean { return this.pos >= this.input.length }
  remaining(): string { return this.input.slice(this.pos) }

  peek(): string { return this.input[this.pos] ?? '' }
  peekAt(offset: number): string { return this.input[this.pos + offset] ?? '' }

  advance(): void { this.pos++ }

  skipWhitespace(): void {
    while (this.pos < this.input.length && ' \t\n\r'.includes(this.input[this.pos]!)) {
      this.pos++
    }
  }

  tryConsume(s: string): boolean {
    this.skipWhitespace()
    if (this.input.startsWith(s, this.pos)) {
      this.pos += s.length
      return true
    }
    return false
  }

  consume(s: string): void {
    this.skipWhitespace()
    if (!this.input.startsWith(s, this.pos)) {
      throw this.error(`Expected '${s}'`)
    }
    this.pos += s.length
  }

  readIdentifier(): string | null {
    const start = this.pos
    while (this.pos < this.input.length && this.isIdentChar(this.input[this.pos]!)) {
      this.pos++
    }
    return this.pos > start ? this.input.slice(start, this.pos) : null
  }

  private readEffectIdentifier(): string | null {
    this.skipWhitespace()

    let name = ''
    let sawSegment = false

    while (!this.isAtEnd()) {
      this.skipWhitespace()

      const start = this.pos
      while (this.pos < this.input.length && this.isEffectSegmentChar(this.input[this.pos]!)) {
        this.pos++
      }

      if (this.pos === start) {
        break
      }

      name += this.input.slice(start, this.pos)
      sawSegment = true

      this.skipWhitespace()
      if (this.peek() !== '.') {
        break
      }

      name += '.'
      this.advance()
    }

    return sawSegment ? name : null
  }

  private isIdentChar(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
      || (c >= '0' && c <= '9') || c === '_'
  }

  private isEffectSegmentChar(c: string): boolean {
    return this.isIdentChar(c) || c === '*'
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9'
  }

  private error(message: string): TypeParseError {
    return new TypeParseError(message, this.input, this.pos)
  }

  private extractRestElementType(type: Type): Type {
    if (type.tag !== 'Array') {
      throw this.error('Rest parameter type must be an array type')
    }
    return type.element
  }
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

interface ParamInfo {
  name?: string
  type: Type
  optional?: boolean
  rest?: boolean
}

export class TypeParseError extends Error {
  constructor(message: string, public input: string, public position: number) {
    super(`${message} at position ${position} in "${input}"`)
    this.name = 'TypeParseError'
  }
}
