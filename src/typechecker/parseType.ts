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

import type { AssertsInfo, RowVarTail, Type } from './types'
import {
  NumberType, IntegerType, StringType, BooleanType, NullType,
  Unknown, Never, RegexType, AnyFunction, PureEffects,
  array, atom, effectSet, fn, handlerType, indexType, inter, keyofType, literal, neg, tuple, typeToString, union,
} from './types'
import { getEffectDeclaration } from './effectTypes'
import { isSubtype } from './subtype'
import { parse } from '../parser'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { fragmentCheckPredicate } from './refinementFragmentCheck'

// ---------------------------------------------------------------------------
// Type alias registry
// ---------------------------------------------------------------------------

// `AliasParam` is defined canonically in the parser layer (the shape
// flows from parser into AST). Re-export here so typechecker consumers
// have a single import site and the two declarations can never diverge.

import type { AliasParam, AstNode } from '../parser/types'

/** Registered type aliases: name → { params, body string } */
const typeAliasRegistry = new Map<string, { params: AliasParam[]; body: string }>()

interface TypeAliasRegistrySnapshot {
  entries: [string, { params: AliasParam[]; body: string }][]
}

/** Register a type alias. Called by typecheck.ts from parsed AST. */
export function registerTypeAlias(name: string, params: AliasParam[], body: string): void {
  typeAliasRegistry.set(name, { params, body })
}

/** Reset user-registered type aliases (called between typecheck passes). */
export function resetTypeAliases(): void {
  typeAliasRegistry.clear()
}

/** Snapshot the current alias registry so nested import typechecking can restore it. */
export function snapshotTypeAliases(): TypeAliasRegistrySnapshot {
  return {
    entries: [...typeAliasRegistry.entries()].map(([name, alias]) => [name, {
      params: alias.params.map(p => p.bound === undefined ? { name: p.name } : { name: p.name, bound: p.bound }),
      body: alias.body,
    }]),
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
 * Parse a type annotation string. An optional `scopedTypeRefs` map lets
 * callers pre-bind type-variable names to existing Types — used for
 * Phase 0b binding-scoped `let f<T: U> = ...` so that occurrences of
 * `T` inside the RHS's annotations resolve to the same pre-created
 * TypeVar (with its bound in `upperBounds`) rather than a fresh
 * annotation-local var.
 * Throws TypeParseError on syntax errors or bound violations.
 */
export function parseTypeAnnotation(input: string, scopedTypeRefs?: Map<string, Type>): Type {
  const parser = new TypeParser(input, scopedTypeRefs)
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
  /**
   * Phase 2.5c — name of the parameter asserted by the function's
   * `asserts {binder | body}` return annotation. The binder name in
   * the predicate must equal one of the parameter names; that match
   * identifies the asserted parameter. Unset when the function has no
   * `asserts` annotation.
   */
  assertsParam?: string
  /**
   * Phase 2.5c — predicate AST + binder + source for the `asserts`
   * annotation. Predicate has already been fragment-checked
   * (`fragmentCheckPredicate`) against the binder, same as the
   * `Refined` node body. Unset when the function has no `asserts`
   * annotation.
   */
  assertsPredicate?: { binder: string; predicate: AstNode; source: string }
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
   * Phase 0a — parse an optional `<T, T: Bound, ...>` prefix before a
   * function type. Registers each type variable in `typeVarMap` with its
   * bound (if any) populated in `upperBounds` before the surrounding type
   * is parsed. Called from `parsePrimary` / `parseFunctionOrType` when
   * the parser is at a `<` token at type position.
   *
   * Syntax: `<A, B: Bound, C>` — each param is a single uppercase letter
   * with an optional `: Type` bound. Bounds propagate via the existing
   * `Var.upperBounds` + `constrain` machinery (no new inference code).
   */
  private parseTypeVarPrefix(): void {
    this.consume('<')
    this.skipWhitespace()
    if (this.tryConsume('>')) return

    // Track names introduced by THIS prefix so we can reject duplicates.
    // Two `<T: Number, T: String>` would otherwise push both bounds onto
    // the same TypeVar and produce a confusing `Number & String = Never`
    // situation at call sites; a clean error here is friendlier.
    const seen = new Set<string>()
    for (;;) {
      this.skipWhitespace()
      const name = this.readIdentifier()
      if (!name) {
        throw this.error('Expected type parameter name in <...> prefix')
      }
      if (!(name.length === 1 && name >= 'A' && name <= 'Z')) {
        throw this.error(`Type parameter '${name}' must be a single uppercase letter (A, B, ..., Z)`)
      }
      if (seen.has(name)) {
        throw this.error(`Duplicate type parameter '${name}' in <...> prefix`)
      }
      seen.add(name)

      // Create the TypeVar up front so it's in scope by the time the
      // bound (if present) is parsed — a bound that references an
      // earlier type variable in the same list will resolve correctly.
      // Invariant: typeVarMap only stores Var-tagged types (created here
      // and in makeTypeRef), so the cast below is safe by construction.
      let v = this.typeVarMap.get(name)
      if (!v) {
        v = { tag: 'Var', id: this.nextVarId++, level: 0, lowerBounds: [], upperBounds: [] }
        this.typeVarMap.set(name, v)
      }

      this.skipWhitespace()
      if (this.tryConsume(':')) {
        this.skipWhitespace()
        const bound = this.parseType()
        ;(v as Extract<Type, { tag: 'Var' }>).upperBounds.push(bound)
      }

      this.skipWhitespace()
      if (this.tryConsume(',')) continue
      break
    }
    this.skipWhitespace()
    if (!this.tryConsume('>')) {
      throw this.error('Expected ">" to close type-parameter list')
    }
  }

  /**
   * Parse either a function type (if we see params + ->) or a regular type.
   * Also detects type guard syntax: (x: T) -> x is U
   */
  parseFunctionOrType(): ParsedFunctionType {
    this.skipWhitespace()
    // Phase 0a — optional `<T: U>` prefix for annotation-scoped
    // forall-quantified function types. Parses the prefix, registers
    // the type vars with their bounds, then falls through to the
    // normal function-type parse. The forall quantifier scope is the
    // whole annotation (same as the existing A/B/T convention).
    if (this.peek() === '<') {
      this.parseTypeVarPrefix()
      this.skipWhitespace()
    }
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
          // Phase 2.5c — check for asserts return: -> asserts {binder | body}
          // Sibling of type-guard syntax; both produce a Boolean-returning
          // function. Unlike type-guards, asserts metadata travels ON the
          // Function type itself (Function.asserts) so it survives flow
          // through let-bindings and call-site dispatch without needing
          // a side table. `tryParseAsserts` runs the existing refinement
          // predicate parser (`consumeAndCheckRefinementPredicate`) so the
          // predicate fragment + binder rules are exactly the same as the
          // ones used for `Type & {n | n > 0}` refinements.
          const assertsResult = this.tryParseAsserts(paramsResult.params)
          if (assertsResult) {
            const paramIndex = paramsResult.params.findIndex(p => p.name === assertsResult.paramName)
            // Cannot fail here — `tryParseAsserts` already validated the
            // binder against parameter names, so paramIndex is always >= 0.
            const assertsInfo: AssertsInfo = {
              paramIndex,
              binder: assertsResult.predicate.binder,
              predicate: assertsResult.predicate.predicate,
              source: assertsResult.predicate.source,
            }
            const funcType = fn(paramsResult.types, BooleanType, PureEffects, undefined, paramsResult.restType, assertsInfo)
            return {
              type: funcType,
              assertsParam: assertsResult.paramName,
              assertsPredicate: assertsResult.predicate,
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
      // Refinement-type predicate: `Base & { binder | predicate }`.
      // One-token lookahead disambiguates from record literal `{ field: T }`
      // — a record has `IDENT :` after the `{`, a refinement has `IDENT |`.
      // Phase 2.1 of the refinement-types plan: accept the syntax, parse
      // the predicate body as a Dvala expression, run the fragment-checker,
      // and wrap the accumulated base in a `Refined` node.
      if (this.looksLikeRefinementPredicate()) {
        const { binder, predicate, source } = this.consumeAndCheckRefinementPredicate()
        left = { tag: 'Refined', base: left, binder, predicate, source }
        this.skipWhitespace()
        continue
      }
      const right = this.parsePrefix()
      left = inter(left, right)
      this.skipWhitespace()
    }
    return left
  }

  /**
   * Refinement-predicate disambiguation — Phase 1 of the refinement-types
   * plan. Returns true if the upcoming tokens look like `{ IDENT |`
   * (a refinement predicate), false otherwise (record literal or any
   * other `{`-led shape). Does NOT advance `pos` — this is pure lookahead.
   */
  private looksLikeRefinementPredicate(): boolean {
    if (this.peek() !== '{') return false
    let i = this.pos + 1
    while (i < this.input.length && /\s/.test(this.input[i]!)) i++
    const identStart = i
    while (i < this.input.length && this.isIdentChar(this.input[i]!)) i++
    if (i === identStart) return false
    while (i < this.input.length && /\s/.test(this.input[i]!)) i++
    // Require a single `|`, not `||` (that would be a boolean OR, not
    // a binder separator — and a bare `||` after `{ IDENT` is malformed
    // regardless). The check is cheap: one char must be `|` AND the
    // next must not also be `|`.
    if (this.input[i] !== '|') return false
    if (this.input[i + 1] === '|') return false
    return true
  }

  /**
   * Phase 2.1: consume `{ binder | predicate }`, parse the predicate
   * body as a Dvala expression, and run the fragment-checker. On accept,
   * returns the `(binder, predicate, source)` triple the caller wraps
   * into a `Refined` node. On reject, throws `RefinementError`.
   *
   * Brace-depth tracking handles nested braces inside the body (e.g. a
   * record literal on one side of a relation). `{` and `}` inside string
   * literals are ignored — handled by the Dvala tokenizer in the inner
   * parse; our char-level scan here just extracts the substring.
   */
  private consumeAndCheckRefinementPredicate(): {
    binder: string
    predicate: AstNode
    source: string
  } {
    const startPos = this.pos
    this.consume('{')
    this.skipWhitespace()
    // Read the binder — a plain identifier per the grammar.
    const binderStart = this.pos
    while (this.pos < this.input.length && this.isIdentChar(this.input[this.pos]!)) this.pos++
    if (this.pos === binderStart) {
      throw new TypeParseError('Expected binder identifier before `|`', this.input, this.pos)
    }
    const binder = this.input.slice(binderStart, this.pos)
    // Reserved-word binders (`null`, `true`, `false`) tokenize as
    // ReservedSymbol inside the predicate body, never as a plain Sym.
    // `isBinderRef` only matches `Sym(binder)`, so a reserved-word binder
    // would be unreferenceable and the user would get a confusing
    // "binder must be on the LHS" error later. Reject early.
    if (binder === 'null' || binder === 'true' || binder === 'false') {
      throw new TypeParseError(
        `Refinement binder '${binder}' conflicts with a reserved keyword; choose a different name`,
        this.input,
        binderStart,
      )
    }
    this.skipWhitespace()
    this.consume('|')
    this.skipWhitespace()

    // Grab the body string through the matching `}`, tracking brace
    // depth. Content of string literals isn't special-cased — this is
    // purely boundary detection; the Dvala tokenizer handles string
    // literal semantics when we parse the substring.
    const bodyStart = this.pos
    let depth = 1
    while (this.pos < this.input.length && depth > 0) {
      const ch = this.input[this.pos]!
      if (ch === '{') depth++
      else if (ch === '}') depth--
      if (depth > 0) this.pos++
    }
    if (this.pos >= this.input.length) {
      throw new TypeParseError('Unterminated refinement predicate — expected `}`', this.input, this.pos)
    }
    const bodySource = this.input.slice(bodyStart, this.pos).trim()
    this.consume('}')

    if (bodySource.length === 0) {
      throw new TypeParseError('Empty refinement predicate body', this.input, startPos)
    }

    // Parse the body as a Dvala expression through the main parser.
    // If the body is syntactically invalid Dvala, the tokenizer or
    // parser throws — let that propagate as a normal parse error.
    const tokens = tokenize(bodySource, false, undefined)
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const body = parse(minified)
    if (body.length !== 1) {
      throw new RefinementError(
        `Refinement predicate must be a single expression; parsed ${body.length} top-level expressions.`,
        'fragment',
        this.input,
        startPos,
      )
    }

    // Run the fragment-checker. Either returns silently (accepted) or
    // throws a RefinementError with the appropriate `kind`.
    const predicate = body[0]!
    fragmentCheckPredicate(predicate, binder, this.input, startPos)
    // Phase 2.1: accepted predicates flow into a `Refined` node.
    // `source` is the raw "binder | body" text, which `typeToString`
    // renders between the braces for error messages.
    const source = `${binder} | ${bodySource}`
    return { binder, predicate, source }
  }

  private parsePrefix(): Type {
    this.skipWhitespace()
    if (this.tryConsume('!')) {
      return neg(this.parsePrefix())
    }
    // `keyof T` — must be followed by a space or a bracketed expression
    // so we don't accidentally match a user-defined alias starting with
    // "keyof" (e.g. `keyofThing`).
    if (this.matchKeyword('keyof')) {
      return keyofType(this.parsePrefix())
    }
    return this.parsePostfix()
  }

  /**
   * Try to match a full keyword (identifier boundary after the match).
   * Prevents matching `keyof` as a prefix of an alias like `keyofThing`.
   */
  private matchKeyword(word: string): boolean {
    this.skipWhitespace()
    if (!this.input.startsWith(word, this.pos)) return false
    const next = this.input[this.pos + word.length]
    if (next !== undefined && this.isIdentChar(next)) return false
    this.pos += word.length
    return true
  }

  private parsePostfix(): Type {
    let t = this.parsePrimary()
    // Postfix operators: [] for arrays, [K] for indexed access,
    // ? for nullable — can chain in any order.
    // Number[]    → array of numbers
    // Number?     → Number | Null
    // Number?[]   → (Number | Null)[]
    // Number[]?   → Number[] | Null
    // R["name"]   → the type of R's "name" field
    // R[keyof R]  → the union of R's field-value types
    for (;;) {
      if (this.tryConsume('[]')) {
        t = array(t)
      } else if (this.peek() === '[') {
        // `[K]` or — after the token-stream rebuild puts spaces between
        // `[` and `]` — a space-separated `[ ]`. Peek past `[` and any
        // whitespace; if the next char is `]`, it's the array form.
        this.consume('[')
        this.skipWhitespace()
        if (this.peek() === ']') {
          this.consume(']')
          t = array(t)
        } else {
          const keyType = this.parseType()
          this.consume(']')
          t = indexType(t, keyType)
        }
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

    // Phase 0a — annotation-scoped `<T: U>` prefix before a function type.
    // When seen inside a larger type (e.g. union/intersection members),
    // the prefix must still be recognized so nested function types can
    // declare their own forall quantification.
    if (this.peek() === '<') {
      this.parseTypeVarPrefix()
      this.skipWhitespace()
      // After the prefix, a function type follows. `(` is required — a
      // lone `<T>` without a function type is meaningless.
      if (this.peek() !== '(') {
        throw this.error('Expected "(" after type-parameter prefix')
      }
      return this.parseParenOrFunction()
    }

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
      // `Sequence` and `Collection` are user-facing type-keyword unions
      // that match the `isSequence` and `isCollection` builtins. Inlined
      // here (rather than exported from types.ts) because:
      //   - the name `SequenceType` is already the internal prefix/rest
      //     interface used for match narrowing, and
      //   - the parallel primitive-type exports (NumberType, StringType,
      //     ...) are all primitives, not unions; adding union-valued
      //     "*Type" consts would mislead callers about what kind of
      //     value they're handling.
      case 'Sequence': return union(array(Unknown), StringType)
      case 'Collection': return union(array(Unknown), StringType, { tag: 'Record', fields: new Map(), open: true })
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
        // Phase 2.5c — `asserts {binder | body}` annotation, also valid
        // when the function appears nested inside other types (e.g. inside
        // a type alias body or a `let f: ... = ...` annotation). Mirrors
        // the outer `parseFunctionOrType` path. Type-guards (`is T`) aren't
        // supported here because their narrowing info has nowhere to live
        // on a bare Type — but asserts metadata travels on FunctionType
        // itself, so it does survive.
        const assertsResult = this.tryParseAsserts(paramsResult.params)
        if (assertsResult) {
          const paramIndex = paramsResult.params.findIndex(p => p.name === assertsResult.paramName)
          const assertsInfo: AssertsInfo = {
            paramIndex,
            binder: assertsResult.predicate.binder,
            predicate: assertsResult.predicate.predicate,
            source: assertsResult.predicate.source,
          }
          return fn(paramsResult.types, BooleanType, PureEffects, undefined, paramsResult.restType, assertsInfo)
        }
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
    const optionalFields = new Set<string>()
    let open = false

    if (this.peek() !== '}') {
      // Check for open record: { ... } or { field, ... }
      if (this.tryConsume('...')) {
        open = true
        this.skipWhitespace()
      } else {
        // Parse fields: name: Type or name?: Type
        const field = this.parseRecordField()
        fields.set(field.name, field.type)
        if (field.optional) optionalFields.add(field.name)
        this.skipWhitespace()

        while (this.tryConsume(',')) {
          this.skipWhitespace()
          if (this.tryConsume('...')) {
            open = true
            this.skipWhitespace()
            break
          }
          const next = this.parseRecordField()
          fields.set(next.name, next.type)
          if (next.optional) optionalFields.add(next.name)
          this.skipWhitespace()
        }
      }
    }
    this.consume('}')
    // Keep optionalFields sidecar undefined when empty so typeEquals and
    // display paths that didn't opt in still see the original shape.
    const record: Type = { tag: 'Record', fields, open }
    if (optionalFields.size > 0) {
      (record).optionalFields = optionalFields
    }
    return record
  }

  private parseRecordField(): { name: string; type: Type; optional: boolean } {
    const name = this.readIdentifier()
    if (!name) throw this.error('Expected field name')
    this.skipWhitespace()
    const optional = this.tryConsume('?')
    this.skipWhitespace()
    this.consume(':')
    this.skipWhitespace()
    const type = this.parseType()
    return { name, type, optional }
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

  // --- Asserts-return parsing (Phase 2.5c) ---

  /**
   * Try to parse `asserts {binder | body}` after `->`. Returns the parsed
   * predicate plus the asserted parameter name (which must equal the
   * binder), or `null` if `asserts` isn't the next token.
   *
   * The constraint "binder name equals a parameter name" identifies the
   * asserted parameter unambiguously even for multi-parameter functions
   * (a `(a: Number, b: Number) -> asserts {b | b > 0}` asserts `b`).
   * Reusing the binder as the parameter selector is mildly redundant but
   * keeps `consumeAndCheckRefinementPredicate` callable without a wrapper.
   */
  private tryParseAsserts(params: ParamInfo[]): {
    paramName: string
    predicate: { binder: string; predicate: AstNode; source: string }
  } | null {
    const saved = this.pos
    const keyword = this.readIdentifier()
    if (keyword !== 'asserts') {
      this.pos = saved
      return null
    }
    this.skipWhitespace()
    // `asserts` is not a reserved word in the type grammar — a user
    // could legitimately have `type asserts = Number` and use it as a
    // return-type alias. Mirror `tryParseTypeGuard` and backtrack when
    // the next token isn't the predicate-opening `{`; the caller falls
    // through to the regular return-type parse and resolves `asserts`
    // as a normal identifier.
    if (this.peek() !== '{') {
      this.pos = saved
      return null
    }
    const predicateStart = this.pos
    const predicate = this.consumeAndCheckRefinementPredicate()
    // Binder must equal one of the function's parameter names. This is
    // the "which parameter is being asserted" selector.
    const matched = params.find(p => p.name === predicate.binder)
    if (!matched) {
      const paramNames = params.map(p => p.name).filter((n): n is string => n !== undefined)
      const hint = paramNames.length > 0
        ? ` (parameters: ${paramNames.join(', ')})`
        : ' (function has no named parameters)'
      throw new TypeParseError(
        `\`asserts\` binder '${predicate.binder}' does not match any parameter name${hint}`,
        this.input,
        predicateStart,
      )
    }
    return { paramName: predicate.binder, predicate }
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

      // Enforce upper bounds per Phase 0a. For each param with a declared
      // bound, parse the bound in the current scope (so it sees any scoped
      // type refs or aliases defined before this expansion) and check that
      // the supplied argument is a subtype of the bound. The check uses
      // `isSubtype` rather than `constrain` so it is side-effect-free —
      // argument type vars are not mutated by the bound check.
      for (let i = 0; i < alias.params.length; i++) {
        const param = alias.params[i]!
        if (param.bound === undefined) continue
        const boundParser = new TypeParser(param.bound, this.scopedTypeRefs)
        const boundType = boundParser.parseType()
        if (!boundParser.isAtEnd()) {
          throw this.error(`Invalid bound on type alias '${name}' parameter '${param.name}': '${boundParser.remaining()}'`)
        }
        const argType = args[i]!
        if (!isSubtype(argType, boundType)) {
          throw this.error(
            `Type argument does not satisfy bound on '${name}': parameter '${param.name}' is bounded by '${typeToString(boundType)}', but got '${typeToString(argType)}'`,
          )
        }
      }

      const scopedTypeRefs = new Map(alias.params.map((param, index) => [param.name, args[index]!]))
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
  /**
   * The original message without the position/input suffix. The
   * `.message` field carries the decorated form for debug output;
   * callers that convert this to a user-facing diagnostic (e.g.
   * `TypeInferenceError`) should prefer `cleanMessage` to avoid
   * leaking internal parser positions into errors.
   */
  public readonly cleanMessage: string
  constructor(message: string, public input: string, public position: number) {
    super(`${message} at position ${position} in "${input}"`)
    this.name = 'TypeParseError'
    this.cleanMessage = message
  }
}

/**
 * Refinement-specific error raised by the fragment-checker while
 * parsing a `Base & { binder | predicate }` annotation. Tests assert
 * on `kind` to stay decoupled from exact message wording.
 *
 *  - `fragment`       — predicate shape is outside the accepted
 *                       grammar (arithmetic, effects, control flow,
 *                       unknown calls, anything not in the Phase 1
 *                       accepted-fixture list).
 *  - `predicate-type` — predicate body isn't Boolean-typed.
 *  - `obligation`     — reserved for Phase 2; the solver will raise
 *                       this when it can't discharge a goal.
 *
 * Lives in parseType.ts next to `TypeParseError` to keep the
 * typechecker→parser import direction one-way (infer.ts already
 * depends on parseType.ts).
 */
export class RefinementError extends TypeParseError {
  public readonly kind: 'fragment' | 'predicate-type' | 'obligation'
  constructor(
    message: string,
    kind: 'fragment' | 'predicate-type' | 'obligation',
    input: string,
    position: number,
  ) {
    super(message, input, position)
    this.name = 'RefinementError'
    this.kind = kind
  }
}
