/**
 * Linearized match slot types for frame-based pattern matching.
 *
 * Similar to bindingSlot.ts, but supports:
 * - Pattern match failure (literal mismatch, type mismatch)
 * - Literal pattern evaluation
 * - Sequential slot processing with early exit on failure
 */

import type { Any, Arr } from '../interface'
import type { AstNode, BindingTarget } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { isUnknownRecord } from '../typeGuards'
import { asAny } from '../typeGuards/dvala'
import type { BindingPathStep } from './bindingSlot'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A linearized match slot representing one step in pattern matching.
 *
 * Each slot either:
 * - Binds a value to a name (symbol pattern)
 * - Compares a value to a literal (literal pattern)
 * - Validates type at a path (for nested object/array patterns)
 * - Collects rest values
 *
 * Processing a slot can:
 * - Succeed and continue to next slot
 * - Fail (return null to indicate pattern doesn't match)
 * - Need to evaluate a node (literal or default)
 */
export interface MatchSlot {
  /** Type of slot */
  kind: 'bind' | 'literal' | 'typeCheck' | 'rest' | 'wildcard'

  /** Variable name to bind (for 'bind' and 'rest' kinds) */
  name?: string

  /** Path to extract value from root */
  path: BindingPathStep[]

  /** Default expression if value is undefined (for 'bind' kind) */
  defaultNode?: AstNode

  /** Literal node to evaluate and compare (for 'literal' kind) */
  literalNode?: AstNode

  /** Required type at this path (for 'typeCheck' kind) */
  requiredType?: 'object' | 'array'

  /** For object rest: keys to exclude */
  restKeys?: Set<string>

  /** For array rest: starting index */
  restIndex?: number

  /** Source info for error reporting */
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Result of flattening a match pattern.
 * Includes both the slots and length constraints for array patterns.
 */
export interface FlattenedMatchPattern {
  slots: MatchSlot[]
  /** For array patterns: exact length required (if no rest) */
  exactLength?: number
  /** For array patterns: minimum length required (if has rest) */
  minLength?: number
}

// ---------------------------------------------------------------------------
// Flatten match pattern to slots
// ---------------------------------------------------------------------------

/**
 * Flatten a binding pattern into a linear list of match slots.
 * Returns slots in order they should be processed.
 *
 * Type checks come first (to fail fast on type mismatch).
 * Then binding/literal slots in depth-first order.
 */
export function flattenMatchPattern(target: BindingTarget): MatchSlot[] {
  const slots: MatchSlot[] = []
  flattenMatchTarget(target, [], slots)
  return slots
}

function flattenMatchTarget(
  target: BindingTarget,
  path: BindingPathStep[],
  slots: MatchSlot[],
): void {
  switch (target[0]) {
    case bindingTargetTypes.wildcard:
      slots.push({
        kind: 'wildcard',
        path: [...path],
      })
      break

    case bindingTargetTypes.literal: {
      const literalNode = target[1][0]
      slots.push({
        kind: 'literal',
        path: [...path],
        literalNode,
        sourceCodeInfo: target[2],
      })
      break
    }

    case bindingTargetTypes.symbol: {
      const symbolNode = target[1][0]
      const name = symbolNode[1]
      const defaultNode = target[1][1]
      slots.push({
        kind: 'bind',
        name,
        path: [...path],
        defaultNode,
        sourceCodeInfo: target[2],
      })
      break
    }

    case bindingTargetTypes.rest: {
      const name = target[1][0]
      const defaultNode = target[1][1] as AstNode | undefined
      slots.push({
        kind: 'rest',
        name,
        path: [...path],
        defaultNode,
        sourceCodeInfo: target[2],
      })
      break
    }

    case bindingTargetTypes.object: {
      // First add type check
      if (path.length > 0) {
        slots.push({
          kind: 'typeCheck',
          path: [...path],
          requiredType: 'object',
          sourceCodeInfo: target[2],
        })
      }

      const entries = target[1][0]
      const capturedKeys = new Set<string>()
      let restElement: BindingTarget | undefined

      for (const [key, element] of Object.entries(entries)) {
        if (element[0] === bindingTargetTypes.rest) {
          restElement = element
          continue
        }

        capturedKeys.add(key)
        const newPath: BindingPathStep[] = [...path, { type: 'key', key }]
        flattenMatchTarget(element, newPath, slots)
      }

      // Add rest slot if present
      if (restElement) {
        slots.push({
          kind: 'rest',
          name: restElement[1][0] as string,
          path: [...path],
          restKeys: capturedKeys,
          sourceCodeInfo: restElement[2],
        })
      }
      break
    }

    case bindingTargetTypes.array: {
      // First add type check
      if (path.length > 0) {
        slots.push({
          kind: 'typeCheck',
          path: [...path],
          requiredType: 'array',
          sourceCodeInfo: target[2],
        })
      }

      const elements = target[1][0]

      // Process elements
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        if (element === null || element === undefined) continue // skipped position

        if (element[0] === bindingTargetTypes.rest) {
          // Rest collects remaining elements
          slots.push({
            kind: 'rest',
            name: element[1][0],
            path: [...path],
            restIndex: i,
            sourceCodeInfo: element[2],
          })
          break
        }

        const newPath: BindingPathStep[] = [...path, { type: 'index', index: i }]
        flattenMatchTarget(element, newPath, slots)
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Extract value by path (reuse from bindingSlot)
// ---------------------------------------------------------------------------

/**
 * Extract a value from a nested structure by following a path.
 * Returns undefined if path cannot be followed.
 */
export function extractMatchValueByPath(rootValue: Any, path: BindingPathStep[]): Any | undefined {
  let current: unknown = rootValue

  for (const step of path) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (step.type === 'key') {
      if (!isUnknownRecord(current)) return undefined
      current = current[step.key]
    } else {
      if (!Array.isArray(current)) return undefined
      current = current[step.index]
    }
  }

  return current as Any | undefined
}

/**
 * Check if value matches required type at path.
 */
export function checkTypeAtPath(
  rootValue: Any,
  path: BindingPathStep[],
  requiredType: 'object' | 'array',
): boolean {
  const value = path.length > 0 ? extractMatchValueByPath(rootValue, path) : rootValue

  if (value === null || value === undefined) {
    return false
  }

  if (requiredType === 'object') {
    return isUnknownRecord(value)
  } else {
    return Array.isArray(value)
  }
}

/**
 * Extract rest values for object rest.
 */
export function extractMatchObjectRest(value: Any, path: BindingPathStep[], restKeys: Set<string>): Record<string, Any> {
  const obj = path.length > 0 ? extractMatchValueByPath(value, path) : value
  if (!isUnknownRecord(obj)) return {}

  const result: Record<string, Any> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (!restKeys.has(key)) {
      result[key] = asAny(val)
    }
  }
  return result
}

/**
 * Extract rest values for array rest.
 */
export function extractMatchArrayRest(value: Any, path: BindingPathStep[], restIndex: number): Arr {
  const arr = path.length > 0 ? extractMatchValueByPath(value, path) : value
  if (!Array.isArray(arr)) return []
  return arr.slice(restIndex).map(v => asAny(v))
}

/**
 * Check array length constraints at pattern root.
 * For patterns like [a, b, c] - exact match required.
 * For patterns like [a, b, ...rest] - minimum match required.
 */
export function checkArrayLengthConstraint(
  target: BindingTarget,
  value: Any,
): boolean {
  if (target[0] !== bindingTargetTypes.array) return true
  if (!Array.isArray(value)) return false

  const elements = target[1][0]
  let hasRest = false
  let nonRestCount = 0

  for (const element of elements) {
    if (element === null) {
      nonRestCount++
      continue
    }
    if (element[0] === bindingTargetTypes.rest) {
      hasRest = true
      break
    }
    nonRestCount++
  }

  if (hasRest) {
    return value.length >= nonRestCount
  } else {
    return value.length === nonRestCount
  }
}

/**
 * Check object exists at pattern root.
 */
export function checkObjectTypeConstraint(
  target: BindingTarget,
  value: Any,
): boolean {
  if (target[0] !== bindingTargetTypes.object) return true
  return isUnknownRecord(value)
}
