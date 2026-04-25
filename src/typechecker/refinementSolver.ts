import { NodeTypes } from '../constants/constants'
import type { AstNode } from '../parser/types'
import type { Type } from './types'
import { NullType, literal, typeEquals } from './types'

type DomainSubject = 'self' | 'count'

type Domain =
  | {
    kind: 'interval'
    subject: DomainSubject
    integral: boolean
    min: number | null
    minInclusive: boolean
    max: number | null
    maxInclusive: boolean
  }
  | {
    kind: 'set'
    subject: DomainSubject
    values: Type[]
  }
  | {
    kind: 'excludedSet'
    subject: DomainSubject
    excluded: Type[]
  }
  | {
    kind: 'intervalExclusion'
    subject: DomainSubject
    interval: Extract<Domain, { kind: 'interval' }>
    excluded: Type[]
  }

export type RefinementSolveVerdict =
  | { tag: 'Proved' }
  | { tag: 'Disproved'; witness: Type }
  | { tag: 'OutOfFragment' }

const MAX_FINITE_INTEGER_DOMAIN_SIZE = 8

export function solveRefinedSubtype(
  source: Type,
  target: Extract<Type, { tag: 'Refined' }>,
): RefinementSolveVerdict {
  const targetDomain = applyIntegralConstraint(
    analyzeRefinementPredicate(target.predicate, target.binder),
    target.base,
  )
  if (!targetDomain) return { tag: 'OutOfFragment' }

  const sourceDomain = extractSourceDomain(source)
  if (!sourceDomain || sourceDomain.subject !== targetDomain.subject) {
    return { tag: 'OutOfFragment' }
  }

  if (isDomainEmpty(sourceDomain)) return { tag: 'Proved' }
  if (isDomainSubset(sourceDomain, targetDomain)) return { tag: 'Proved' }

  const witness = pickWitnessOutside(source, sourceDomain, targetDomain)
  return witness ? { tag: 'Disproved', witness } : { tag: 'OutOfFragment' }
}

export function simplifyRefinedType(refined: Extract<Type, { tag: 'Refined' }>): Type | null {
  const domain = applyIntegralConstraint(
    analyzeRefinementPredicate(refined.predicate, refined.binder),
    refined.base,
  )
  if (!domain) return null
  if (isDomainEmpty(domain)) return { tag: 'Never' }

  const baseVerdict = solveRefinedSubtype(refined.base, refined)
  if (baseVerdict.tag === 'Proved') return refined.base
  if (baseVerdict.tag === 'Disproved') return { tag: 'Never' }
  return null
}

function extractSourceDomain(source: Type): Domain | null {
  if (source.tag === 'Refined') {
    const refinedDomain = applyIntegralConstraint(
      analyzeRefinementPredicate(source.predicate, source.binder),
      source.base,
    )
    if (!refinedDomain) return null

    const singletonBase = singletonDomainFromType(source.base)
    if (!singletonBase || singletonBase.subject !== refinedDomain.subject) return refinedDomain

    return intersectDomains(singletonBase, refinedDomain)
  }

  return singletonDomainFromType(source)
}

function singletonDomainFromType(source: Type): Domain | null {
  if (source.tag === 'Literal' || source.tag === 'Atom') {
    return { kind: 'set', subject: 'self', values: [source] }
  }
  if (source.tag === 'Primitive' && source.name === 'Null') {
    return { kind: 'set', subject: 'self', values: [NullType] }
  }
  return null
}

function analyzeRefinementPredicate(node: AstNode, binder: string): Domain | null {
  if (node[0] === NodeTypes.And && Array.isArray(node[1])) {
    const operands = node[1] as AstNode[]
    let current: Domain | null = null
    for (const operand of operands) {
      const operandDomain = analyzeRefinementPredicate(operand, binder)
      if (!operandDomain) return null
      current = current ? intersectDomains(current, operandDomain) : operandDomain
    }
    return current
  }

  if (node[0] === NodeTypes.Or && Array.isArray(node[1])) {
    const operands = node[1] as AstNode[]
    let current: Domain | null = null
    for (const operand of operands) {
      const operandDomain = analyzeRefinementPredicate(operand, binder)
      if (!operandDomain) return null
      current = current ? unionDomains(current, operandDomain) : operandDomain
      if (!current) return null
    }
    return current
  }

  if (node[0] !== NodeTypes.Call || !Array.isArray(node[1])) return null
  const [callee, args] = node[1] as [AstNode, AstNode[]]
  if (callee[0] !== NodeTypes.Builtin) return null

  const operator = callee[1] as string
  if (operator === '!') return null
  if (args.length !== 2) return null

  const normalized = normalizeRelationArgs(args[0]!, operator, args[1]!, binder)
  if (!normalized) return null
  return relationDomain(normalized.subject, normalized.operator, normalized.rhs)
}

function normalizeRelationArgs(
  left: AstNode,
  operator: string,
  right: AstNode,
  binder: string,
): { subject: DomainSubject; operator: string; rhs: AstNode } | null {
  const leftSubject = classifySubject(left, binder)
  if (leftSubject) return { subject: leftSubject, operator, rhs: right }

  const rightSubject = classifySubject(right, binder)
  if (!rightSubject) return null

  const flipped = flipRelationOperator(operator)
  return flipped ? { subject: rightSubject, operator: flipped, rhs: left } : null
}

function flipRelationOperator(operator: string): string | null {
  switch (operator) {
    case '==':
      return '=='
    case '!=':
      return '!='
    case '>':
      return '<'
    case '>=':
      return '<='
    case '<':
      return '>'
    case '<=':
      return '>='
    default:
      return null
  }
}

function classifySubject(node: AstNode, binder: string): DomainSubject | null {
  if (node[0] === NodeTypes.Sym && node[1] === binder) return 'self'
  if (node[0] !== NodeTypes.Call || !Array.isArray(node[1])) return null
  const [callee, args] = node[1] as [AstNode, AstNode[]]
  if (
    callee[0] === NodeTypes.Builtin
    && callee[1] === 'count'
    && args.length === 1
    && args[0]![0] === NodeTypes.Sym
    && args[0]![1] === binder
  ) {
    return 'count'
  }
  return null
}

function relationDomain(subject: DomainSubject, operator: string, rhs: AstNode): Domain | null {
  const rhsType = literalNodeToSingletonType(rhs)
  if (!rhsType) return null

  if (subject === 'count') {
    if (rhsType.tag !== 'Literal' || typeof rhsType.value !== 'number' || !Number.isInteger(rhsType.value)) {
      return null
    }
    if (operator === '==') return { kind: 'set', subject, values: [rhsType] }
    if (operator === '!=') return { kind: 'excludedSet', subject, excluded: [rhsType] }
    const relation = intervalFromRelation(subject, operator, rhsType.value)
    if (!relation || relation.kind !== 'interval') return null
    return normalizeInterval({
      kind: 'interval',
      subject,
      integral: true,
      min: 0,
      minInclusive: true,
      max: null,
      maxInclusive: false,
    }, relation)
  }

  if (operator === '==' || operator === '!=') {
    if (operator === '!=') return { kind: 'excludedSet', subject: 'self', excluded: [rhsType] }
    return { kind: 'set', subject: 'self', values: [rhsType] }
  }

  if (rhsType.tag !== 'Literal' || typeof rhsType.value !== 'number') return null
  return intervalFromRelation(subject, operator, rhsType.value)
}

function intervalFromRelation(subject: DomainSubject, operator: string, value: number): Domain | null {
  switch (operator) {
    case '==':
      return { kind: 'interval', subject, integral: subject === 'count', min: value, minInclusive: true, max: value, maxInclusive: true }
    case '>':
      return { kind: 'interval', subject, integral: subject === 'count', min: value, minInclusive: false, max: null, maxInclusive: false }
    case '>=':
      return { kind: 'interval', subject, integral: subject === 'count', min: value, minInclusive: true, max: null, maxInclusive: false }
    case '<':
      return { kind: 'interval', subject, integral: subject === 'count', min: null, minInclusive: false, max: value, maxInclusive: false }
    case '<=':
      return { kind: 'interval', subject, integral: subject === 'count', min: null, minInclusive: false, max: value, maxInclusive: true }
    default:
      return null
  }
}

function literalNodeToSingletonType(node: AstNode): Type | null {
  switch (node[0]) {
    case NodeTypes.Num:
      return literal(node[1] as number)
    case NodeTypes.Str:
      return literal(node[1] as string)
    case NodeTypes.Atom:
      return { tag: 'Atom', name: node[1] as string }
    case NodeTypes.Reserved: {
      const value = node[1] as string
      if (value === 'true') return literal(true)
      if (value === 'false') return literal(false)
      if (value === 'null') return NullType
      return null
    }
    default:
      return null
  }
}

function intersectDomains(left: Domain, right: Domain): Domain | null {
  if (left.subject !== right.subject) return null
  if (left.kind === 'interval' && right.kind === 'interval') {
    return normalizeInterval(left, {
      kind: 'interval',
      subject: left.subject,
      integral: left.integral || right.integral,
      min: tighterMin(left, right).value,
      minInclusive: tighterMin(left, right).inclusive,
      max: tighterMax(left, right).value,
      maxInclusive: tighterMax(left, right).inclusive,
    })
  }
  if (left.kind === 'interval' && right.kind === 'excludedSet') {
    return toIntervalExclusion(left, right)
  }
  if (left.kind === 'excludedSet' && right.kind === 'interval') {
    return toIntervalExclusion(right, left)
  }
  if (left.kind === 'intervalExclusion' && right.kind === 'interval') {
    const narrowed = normalizeInterval(left.interval, right)
    return narrowed?.kind === 'interval' ? toIntervalExclusion(narrowed, { kind: 'excludedSet', subject: left.subject, excluded: left.excluded }) : null
  }
  if (left.kind === 'interval' && right.kind === 'intervalExclusion') {
    return intersectDomains(right, left)
  }
  if (left.kind === 'intervalExclusion' && right.kind === 'excludedSet') {
    return toIntervalExclusion(left.interval, { kind: 'excludedSet', subject: left.subject, excluded: mergeExcludedValues(left.excluded, right.excluded) })
  }
  if (left.kind === 'excludedSet' && right.kind === 'intervalExclusion') {
    return intersectDomains(right, left)
  }
  if (left.kind === 'set' && right.kind === 'set') {
    return {
      kind: 'set',
      subject: left.subject,
      values: left.values.filter(leftValue => right.values.some(rightValue => typeEquals(leftValue, rightValue))),
    }
  }
  if (left.kind === 'set' && right.kind === 'intervalExclusion') {
    return {
      kind: 'set',
      subject: left.subject,
      values: left.values.filter(value => valueInDomain(value, right)),
    }
  }
  if (left.kind === 'intervalExclusion' && right.kind === 'set') {
    return intersectDomains(right, left)
  }
  if (left.kind === 'excludedSet' && right.kind === 'excludedSet') {
    const excluded = [...left.excluded]
    for (const value of right.excluded) {
      if (!excluded.some(existing => typeEquals(existing, value))) excluded.push(value)
    }
    return { kind: 'excludedSet', subject: left.subject, excluded }
  }
  if (left.kind === 'set' && right.kind === 'excludedSet') {
    return {
      kind: 'set',
      subject: left.subject,
      values: left.values.filter(value => !excludedSetContains(right, value)),
    }
  }
  if (left.kind === 'excludedSet' && right.kind === 'set') {
    return intersectDomains(right, left)
  }
  if (left.kind === 'set' && right.kind === 'interval') {
    return {
      kind: 'set',
      subject: left.subject,
      values: left.values.filter(value => singletonInInterval(value, right)),
    }
  }
  if (left.kind === 'interval' && right.kind === 'set') {
    return intersectDomains(right, left)
  }
  return null
}

function unionDomains(left: Domain, right: Domain): Domain | null {
  if (left.subject !== right.subject) return null
  // Set ∪ Set is finite-list-shaped — concatenate, dedup, done. Tractable.
  if (left.kind !== 'set' || right.kind !== 'set') return null
  // Interval ∪ Interval is deferred-by-design. The result of unioning two
  // disjoint intervals (e.g. `n > 10 || n < -5`) is non-convex — it can't
  // be represented as a single `interval` domain, only as an "intervals
  // with holes" structure that the Phase 2.5+ solver work would need to
  // introduce. Today we bail to OutOfFragment, which the subtype check
  // falls through to inert pass-through. Conservative; not unsound.

  const values = [...left.values]
  for (const value of right.values) {
    if (!values.some(existing => typeEquals(existing, value))) values.push(value)
  }
  return { kind: 'set', subject: left.subject, values }
}

function normalizeInterval(left: Domain, right: Domain): Domain | null {
  if (left.kind !== 'interval' || right.kind !== 'interval' || left.subject !== right.subject) return null
  const lower = tighterMin(left, right)
  const upper = tighterMax(left, right)
  return {
    kind: 'interval',
    subject: left.subject,
    integral: left.integral || right.integral,
    min: lower.value,
    minInclusive: lower.inclusive,
    max: upper.value,
    maxInclusive: upper.inclusive,
  }
}

function tighterMin(left: Extract<Domain, { kind: 'interval' }>, right: Extract<Domain, { kind: 'interval' }>): { value: number | null; inclusive: boolean } {
  if (left.min === null) return { value: right.min, inclusive: right.minInclusive }
  if (right.min === null) return { value: left.min, inclusive: left.minInclusive }
  if (left.min > right.min) return { value: left.min, inclusive: left.minInclusive }
  if (right.min > left.min) return { value: right.min, inclusive: right.minInclusive }
  return { value: left.min, inclusive: left.minInclusive && right.minInclusive }
}

function tighterMax(left: Extract<Domain, { kind: 'interval' }>, right: Extract<Domain, { kind: 'interval' }>): { value: number | null; inclusive: boolean } {
  if (left.max === null) return { value: right.max, inclusive: right.maxInclusive }
  if (right.max === null) return { value: left.max, inclusive: left.maxInclusive }
  if (left.max < right.max) return { value: left.max, inclusive: left.maxInclusive }
  if (right.max < left.max) return { value: right.max, inclusive: right.maxInclusive }
  return { value: left.max, inclusive: left.maxInclusive && right.maxInclusive }
}

function isDomainSubset(source: Domain, target: Domain): boolean {
  if (source.subject !== target.subject) return false

  const finiteSource = toFiniteSet(source)
  if (finiteSource && source.kind !== 'set') return isDomainSubset(finiteSource, target)

  if (source.kind === 'set' && target.kind === 'set') {
    return source.values.every(sourceValue => target.values.some(targetValue => typeEquals(sourceValue, targetValue)))
  }
  if (source.kind === 'set' && target.kind === 'intervalExclusion') {
    return source.values.every(value => valueInDomain(value, target))
  }
  if (source.kind === 'set' && target.kind === 'excludedSet') {
    return source.values.every(value => !excludedSetContains(target, value))
  }
  if (source.kind === 'set' && target.kind === 'interval') {
    return source.values.every(value => singletonInInterval(value, target))
  }
  if (source.kind === 'interval' && target.kind === 'interval') {
    return intervalSubsetOfInterval(source, target)
  }
  if (source.kind === 'interval' && target.kind === 'intervalExclusion') {
    return intervalSubsetOfInterval(source, target.interval)
      && intervalAvoidsExcludedValue(source, { kind: 'excludedSet', subject: target.subject, excluded: target.excluded })
  }
  if (source.kind === 'interval' && target.kind === 'excludedSet') {
    return intervalAvoidsExcludedValue(source, target)
  }
  if (source.kind === 'interval' && target.kind === 'set') {
    if (!isIntervalSingleton(source)) return false
    const singleton = intervalSingletonValue(source)
    return singleton !== null && target.values.some(value => typeEquals(value, literal(singleton)))
  }
  if (source.kind === 'intervalExclusion' && target.kind === 'interval') {
    return intervalSubsetOfInterval(source.interval, target)
  }
  if (source.kind === 'intervalExclusion' && target.kind === 'intervalExclusion') {
    return intervalSubsetOfInterval(source.interval, target.interval)
      && intervalExclusionAvoidsExcludedValues(source, target.excluded)
  }
  if (source.kind === 'intervalExclusion' && target.kind === 'excludedSet') {
    return intervalExclusionAvoidsExcludedValues(source, target.excluded)
  }
  if (source.kind === 'excludedSet' && target.kind === 'excludedSet') {
    return target.excluded.every(targetValue => source.excluded.some(sourceValue => typeEquals(sourceValue, targetValue)))
  }
  return false
}

function intervalSubsetOfInterval(
  source: Extract<Domain, { kind: 'interval' }>,
  target: Extract<Domain, { kind: 'interval' }>,
): boolean {
  if (source.integral) {
    const first = firstIntegerInInterval(source)
    if (first === null) return true
    const last = lastIntegerInInterval(source)
    return last !== null && numberInInterval(first, target) && numberInInterval(last, target)
  }
  if (target.integral) {
    const singleton = exactRealSingletonValue(source)
    return singleton !== null && numberInInterval(singleton, target)
  }

  // Real-number bounds. For each side, the source is at-least-as-restrictive
  // as the target iff one of:
  //   - target has no bound on that side (always inside);
  //   - source's bound is strictly inside target's (>, <);
  //   - source's bound equals target's AND source isn't a wider closed end
  //     (i.e. the only failure case is source-inclusive vs target-exclusive
  //     at the same numeric value — source includes the boundary point that
  //     target excludes, so source has values target doesn't).
  return boundaryAtLeastAsRestrictive(source.min, source.minInclusive, target.min, target.minInclusive, 'lower')
    && boundaryAtLeastAsRestrictive(source.max, source.maxInclusive, target.max, target.maxInclusive, 'upper')
}

/**
 * Is the source's bound at-least-as-restrictive as the target's, for the
 * given side (`lower` = `min`, `upper` = `max`)? "At-least-as-restrictive"
 * means: every numeric value the source admits past this bound, the
 * target also admits. A source bound that equals the target's must not
 * be a *wider* closed end — see `intervalSubsetOfInterval` for the
 * three-cases summary.
 */
function boundaryAtLeastAsRestrictive(
  sourceBound: number | null,
  sourceInclusive: boolean,
  targetBound: number | null,
  targetInclusive: boolean,
  kind: 'lower' | 'upper',
): boolean {
  if (targetBound === null) return true // target has no bound on this side
  if (sourceBound === null) return false // source unbounded vs target bounded → not restrictive
  if (kind === 'lower' ? sourceBound > targetBound : sourceBound < targetBound) return true
  if (sourceBound !== targetBound) return false
  // Bounds are equal numerically. Source is restrictive iff it's NOT a
  // wider closed end: either source is exclusive (excludes the point)
  // or target is inclusive (includes the point too).
  return !sourceInclusive || targetInclusive
}

function singletonInInterval(value: Type, interval: Extract<Domain, { kind: 'interval' }>): boolean {
  if (value.tag !== 'Literal' || typeof value.value !== 'number') return false
  return numberInInterval(value.value, interval)
}

function numberInInterval(value: number, interval: Extract<Domain, { kind: 'interval' }>): boolean {
  if (interval.integral && !Number.isInteger(value)) return false
  if (interval.min !== null) {
    if (value < interval.min) return false
    if (value === interval.min && !interval.minInclusive) return false
  }
  if (interval.max !== null) {
    if (value > interval.max) return false
    if (value === interval.max && !interval.maxInclusive) return false
  }
  return true
}

function isDomainEmpty(domain: Domain): boolean {
  if (domain.kind === 'set') return domain.values.length === 0
  if (domain.kind === 'excludedSet') return false
  if (domain.kind === 'intervalExclusion') {
    return isIntervalSingleton(domain.interval)
      && domain.excluded.some(value => typeEquals(value, literal(intervalSingletonValue(domain.interval)!)))
  }
  if (domain.integral) return firstIntegerInInterval(domain) === null
  if (domain.min === null || domain.max === null) return false
  if (domain.min < domain.max) return false
  if (domain.min > domain.max) return true
  return !(domain.minInclusive && domain.maxInclusive)
}

function isIntervalSingleton(interval: Extract<Domain, { kind: 'interval' }>): boolean {
  if (interval.integral) {
    const first = firstIntegerInInterval(interval)
    const last = lastIntegerInInterval(interval)
    return first !== null && last !== null && first === last
  }
  return interval.min !== null
    && interval.max !== null
    && interval.min === interval.max
    && interval.minInclusive
    && interval.maxInclusive
}

function intervalSingletonValue(interval: Extract<Domain, { kind: 'interval' }>): number | null {
  if (interval.integral) {
    const first = firstIntegerInInterval(interval)
    const last = lastIntegerInInterval(interval)
    return first !== null && last !== null && first === last ? first : null
  }
  return isIntervalSingleton(interval) ? interval.min : null
}

function pickWitnessOutside(sourceType: Type, source: Domain, target: Domain): Type | null {
  const finiteSource = toFiniteSet(source)
  if (finiteSource && source.kind !== 'set') return pickWitnessOutside(sourceType, finiteSource, target)

  if (source.kind === 'set') {
    return source.values.find(value => !isDomainSubset({ kind: 'set', subject: source.subject, values: [value] }, target)) ?? null
  }
  if (source.kind === 'excludedSet' && target.kind === 'set') {
    return pickExcludedSetWitness(sourceType, source, target)
  }
  if (source.kind === 'excludedSet' && target.kind === 'interval') {
    return pickExcludedSetNumericWitness(sourceType, source, target)
  }
  if (source.kind === 'excludedSet' && target.kind === 'intervalExclusion') {
    return pickExcludedSetNumericWitness(sourceType, source, target)
  }
  if (source.kind === 'excludedSet' && target.kind === 'excludedSet') {
    return target.excluded.find(value => !excludedSetContains(source, value)) ?? null
  }
  if (source.kind === 'interval' && target.kind === 'excludedSet') {
    return witnessForExcludedSetInterval(source, target)
  }
  if (source.kind !== 'interval' && source.kind !== 'intervalExclusion') return null

  const sourceInterval = source.kind === 'interval' ? source : source.interval

  if (target.kind === 'set' && isSingleNumericValueDomain(source)) {
    return literal(singleNumericValueDomain(source)!)
  }

  const candidates = intervalWitnessCandidates(sourceInterval, target)
  for (const candidate of candidates) {
    if (domainContainsNumber(source, candidate) && !domainContainsNumber(target, candidate)) {
      return literal(candidate)
    }
  }
  return null
}

function intervalWitnessCandidates(
  source: Extract<Domain, { kind: 'interval' }>,
  target: Domain,
): number[] {
  const delta = source.integral || source.subject === 'count' ? 1 : 0.5
  const candidates = new Set<number>()
  const maybeAdd = (value: number | null | undefined): void => {
    if (value !== null && value !== undefined && Number.isFinite(value)) candidates.add(value)
  }

  maybeAdd(source.min)
  maybeAdd(source.max)
  maybeAdd(source.min !== null ? source.min + delta : null)
  maybeAdd(source.max !== null ? source.max - delta : null)

  if (target.kind === 'interval') {
    maybeAdd(target.min)
    maybeAdd(target.max)
    maybeAdd(target.min !== null ? target.min - delta : null)
    maybeAdd(target.min !== null ? target.min + delta : null)
    maybeAdd(target.max !== null ? target.max - delta : null)
    maybeAdd(target.max !== null ? target.max + delta : null)
  }
  if (target.kind === 'excludedSet') {
    for (const excluded of target.excluded) {
      const value = numericLiteralValue(excluded)
      maybeAdd(value)
      maybeAdd(value !== null ? value - delta : null)
      maybeAdd(value !== null ? value + delta : null)
    }
  }
  if (target.kind === 'intervalExclusion') {
    maybeAdd(target.interval.min)
    maybeAdd(target.interval.max)
    maybeAdd(target.interval.min !== null ? target.interval.min - delta : null)
    maybeAdd(target.interval.min !== null ? target.interval.min + delta : null)
    maybeAdd(target.interval.max !== null ? target.interval.max - delta : null)
    maybeAdd(target.interval.max !== null ? target.interval.max + delta : null)
    for (const excluded of target.excluded) {
      const value = numericLiteralValue(excluded)
      maybeAdd(value)
      maybeAdd(value !== null ? value - delta : null)
      maybeAdd(value !== null ? value + delta : null)
    }
  }

  maybeAdd(0)
  maybeAdd(1)
  maybeAdd(-1)
  return [...candidates]
}

function domainContainsNumber(domain: Domain, value: number): boolean {
  if (domain.kind === 'interval') return numberInInterval(value, domain)
  if (domain.kind === 'intervalExclusion') return numberInInterval(value, domain.interval) && !excludedSetContains(domainAsExcludedSet(domain), literal(value))
  if (domain.kind === 'set') {
    return domain.values.some(domainValue => domainValue.tag === 'Literal' && domainValue.value === value)
  }
  if (domain.subject === 'count' && (!Number.isInteger(value) || value < 0)) return false
  return !excludedSetContains(domain, literal(value))
}

function toIntervalExclusion(
  interval: Extract<Domain, { kind: 'interval' }>,
  excludedSet: Extract<Domain, { kind: 'excludedSet' }>,
): Domain {
  const excluded = excludedSet.excluded.filter(value => {
    const numericValue = numericLiteralValue(value)
    return numericValue !== null && numberInInterval(numericValue, interval)
  })
  return excluded.length === 0 ? interval : { kind: 'intervalExclusion', subject: interval.subject, interval, excluded }
}

// Worst-case complexity: O(left.length * right.length). Real refinement
// annotations have a handful of `!=` conjuncts (typically 0–2); the
// quadratic factor only matters for pathological inputs like a chain of
// hundreds of inequality conjuncts. No size cap today — if generated /
// LLM-authored annotations start producing such chains in practice,
// introduce a `MAX_EXCLUDED_SET_SIZE` guard analogous to
// `MAX_FINITE_INTEGER_DOMAIN_SIZE` and bail to OutOfFragment.
function mergeExcludedValues(left: Type[], right: Type[]): Type[] {
  const merged = [...left]
  for (const value of right) {
    if (!merged.some(existing => typeEquals(existing, value))) merged.push(value)
  }
  return merged
}

function valueInDomain(value: Type, domain: Extract<Domain, { kind: 'intervalExclusion' }>): boolean {
  const numericValue = numericLiteralValue(value)
  return numericValue !== null
    && numberInInterval(numericValue, domain.interval)
    && !excludedSetContains(domainAsExcludedSet(domain), value)
}

function numericLiteralValue(value: Type): number | null {
  return value.tag === 'Literal' && typeof value.value === 'number' ? value.value : null
}

function applyIntegralConstraint(domain: Domain | null, base: Type): Domain | null {
  if (!domain || !baseConstrainsIntegers(base)) return domain
  if (domain.kind === 'interval') return { ...domain, integral: true }
  if (domain.kind === 'intervalExclusion') {
    return { ...domain, interval: { ...domain.interval, integral: true } }
  }
  return domain
}

function baseConstrainsIntegers(base: Type): boolean {
  if (base.tag === 'Primitive') return base.name === 'Integer'
  if (base.tag === 'Literal') return typeof base.value === 'number' && Number.isInteger(base.value)
  if (base.tag === 'Refined') return baseConstrainsIntegers(base.base)
  return false
}

function excludedSetContains(domain: Extract<Domain, { kind: 'excludedSet' }>, value: Type): boolean {
  return domain.excluded.some(excludedValue => typeEquals(excludedValue, value))
}

function pickExcludedSetWitness(
  sourceType: Type,
  source: Extract<Domain, { kind: 'excludedSet' }>,
  target: Extract<Domain, { kind: 'set' }>,
): Type | null {
  const base = sourceType.tag === 'Refined' ? sourceType.base : sourceType
  const candidates = [
    ...witnessCandidatesForDomain(base, source.subject),
    ...witnessCandidatesForValues([...source.excluded, ...target.values]),
  ]
  return candidates.find(candidate => !excludedSetContains(source, candidate) && !target.values.some(value => typeEquals(value, candidate))) ?? null
}

function pickExcludedSetNumericWitness(
  sourceType: Type,
  source: Extract<Domain, { kind: 'excludedSet' }>,
  target: Extract<Domain, { kind: 'interval' | 'intervalExclusion' }>,
): Type | null {
  const base = sourceType.tag === 'Refined' ? sourceType.base : sourceType
  const interval = target.kind === 'interval' ? target : target.interval
  const candidates = [
    ...witnessCandidatesForDomain(base, source.subject),
    ...intervalWitnessCandidates(interval, target).map(value => literal(value)),
  ]
  for (const candidate of candidates) {
    if (candidate.tag !== 'Literal' || typeof candidate.value !== 'number') continue
    if (!domainContainsNumber(source, candidate.value)) continue
    if (!domainContainsNumber(target, candidate.value)) return candidate
  }
  return null
}

function witnessCandidatesForDomain(base: Type, subject: DomainSubject): Type[] {
  if (subject === 'count') {
    return [literal(0), literal(1), literal(2), literal(3)]
  }

  if (base.tag === 'Atom') {
    return [
      { tag: 'Atom', name: 'other' },
      { tag: 'Atom', name: 'ok' },
      { tag: 'Atom', name: 'warn' },
      { tag: 'Atom', name: '__dvala_refinement_witness__' },
    ]
  }
  if (base.tag === 'Primitive') {
    switch (base.name) {
      case 'String':
        return [literal('a'), literal(''), literal('__dvala_refinement_witness__')]
      case 'Boolean':
        return [literal(false), literal(true)]
      case 'Null':
        return [NullType]
      default:
        return []
    }
  }
  return []
}

function witnessCandidatesForValues(values: Type[]): Type[] {
  const exemplar = values[0]
  if (!exemplar) return []
  if (exemplar.tag === 'Atom') {
    return [
      { tag: 'Atom', name: 'other' },
      { tag: 'Atom', name: 'ok' },
      { tag: 'Atom', name: 'warn' },
      { tag: 'Atom', name: '__dvala_refinement_witness__' },
    ]
  }
  if (exemplar.tag === 'Literal') {
    switch (typeof exemplar.value) {
      case 'string':
        return [literal('a'), literal(''), literal('__dvala_refinement_witness__')]
      case 'boolean':
        return [literal(false), literal(true)]
      case 'number':
        return [literal(0), literal(1), literal(2), literal(-1)]
      default:
        return []
    }
  }
  if (exemplar.tag === 'Primitive' && exemplar.name === 'Null') {
    return [NullType]
  }
  return []
}

function domainAsExcludedSet(domain: Extract<Domain, { kind: 'intervalExclusion' }>): Extract<Domain, { kind: 'excludedSet' }> {
  return { kind: 'excludedSet', subject: domain.subject, excluded: domain.excluded }
}

function intervalAvoidsExcludedValue(
  interval: Extract<Domain, { kind: 'interval' }>,
  excludedSet: Extract<Domain, { kind: 'excludedSet' }>,
): boolean {
  return excludedSet.excluded.every(value => {
    if (value.tag !== 'Literal' || typeof value.value !== 'number') return true
    if (!numberInInterval(value.value, interval)) return true
    return isIntervalSingleton(interval) && intervalSingletonValue(interval) !== value.value
  })
}

function intervalExclusionAvoidsExcludedValues(
  source: Extract<Domain, { kind: 'intervalExclusion' }>,
  excludedValues: Type[],
): boolean {
  return excludedValues.every(value => {
    const numericValue = numericLiteralValue(value)
    if (numericValue === null) return true
    if (!numberInInterval(numericValue, source.interval)) return true
    return excludedSetContains(domainAsExcludedSet(source), literal(numericValue))
  })
}

function witnessForExcludedSetInterval(
  source: Extract<Domain, { kind: 'interval' }>,
  target: Extract<Domain, { kind: 'excludedSet' }>,
): Type | null {
  for (const excluded of target.excluded) {
    if (excluded.tag !== 'Literal' || typeof excluded.value !== 'number') continue
    if (numberInInterval(excluded.value, source)) return excluded
  }
  return null
}

function firstIntegerInInterval(interval: Extract<Domain, { kind: 'interval' }>): number | null {
  const start = interval.min === null
    ? Number.MIN_SAFE_INTEGER
    : interval.minInclusive ? Math.ceil(interval.min) : Math.floor(interval.min) + 1
  if (!Number.isFinite(start)) return null
  return numberInInterval(start, { ...interval, integral: false }) ? start : null
}

function lastIntegerInInterval(interval: Extract<Domain, { kind: 'interval' }>): number | null {
  const end = interval.max === null
    ? Number.MAX_SAFE_INTEGER
    : interval.maxInclusive ? Math.floor(interval.max) : Math.ceil(interval.max) - 1
  if (!Number.isFinite(end)) return null
  return numberInInterval(end, { ...interval, integral: false }) ? end : null
}

function exactRealSingletonValue(interval: Extract<Domain, { kind: 'interval' }>): number | null {
  return interval.min !== null
    && interval.max !== null
    && interval.minInclusive
    && interval.maxInclusive
    && interval.min === interval.max
    ? interval.min
    : null
}

function isSingleNumericValueDomain(domain: Extract<Domain, { kind: 'interval' | 'intervalExclusion' }>): boolean {
  const value = singleNumericValueDomain(domain)
  return value !== null
}

function singleNumericValueDomain(domain: Extract<Domain, { kind: 'interval' | 'intervalExclusion' }>): number | null {
  const interval = domain.kind === 'interval' ? domain : domain.interval
  const value = intervalSingletonValue(interval)
  if (value === null) return null
  if (domain.kind === 'intervalExclusion' && excludedSetContains(domainAsExcludedSet(domain), literal(value))) {
    return null
  }
  return value
}

function toFiniteSet(domain: Domain): Extract<Domain, { kind: 'set' }> | null {
  if (domain.kind === 'set') return domain
  if (domain.kind === 'interval') return finiteSetFromInterval(domain, [])
  if (domain.kind === 'intervalExclusion') return finiteSetFromInterval(domain.interval, domain.excluded)
  return null
}

function finiteSetFromInterval(
  interval: Extract<Domain, { kind: 'interval' }>,
  excluded: Type[],
): Extract<Domain, { kind: 'set' }> | null {
  if (!interval.integral) return null
  const first = firstIntegerInInterval(interval)
  const last = lastIntegerInInterval(interval)
  if (first === null || last === null) return { kind: 'set', subject: interval.subject, values: [] }

  const size = last - first + 1
  if (size > MAX_FINITE_INTEGER_DOMAIN_SIZE) return null

  const values: Type[] = []
  for (let value = first; value <= last; value += 1) {
    const literalValue = literal(value)
    if (!excluded.some(excludedValue => typeEquals(excludedValue, literalValue))) {
      values.push(literalValue)
    }
  }
  return { kind: 'set', subject: interval.subject, values }
}
