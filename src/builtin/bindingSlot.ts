/**
 * Linearized binding slot types for frame-based destructuring.
 *
 * Instead of using a callback-based recursive traversal for destructuring,
 * we pre-flatten the binding pattern into a linear list of "slots". Each slot
 * represents one variable to bind, with a path describing how to extract the
 * value from the source object.
 *
 * This enables:
 * 1. Frame-based evaluation of defaults (no callbacks)
 * 2. Serializable continuation state
 * 3. Suspension/resume at any point during binding
 */

import type { Any, Arr } from '../interface'
import type { AstNode, BindingTarget, UserDefinedSymbolNode } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { assertArray } from '../typeGuards/array'
import { assertObj } from '../typeGuards/dvala'
import { PersistentMap, PersistentVector } from '../utils/persistent'

// ---------------------------------------------------------------------------
// Root type validation
// ---------------------------------------------------------------------------

/**
 * Validate that the root value matches the expected binding target structure.
 *
 * For array destructuring (`let [a, b] = value`), value must be an array.
 * For object destructuring (`let {a, b} = value`), value must be an object.
 * For symbol binding (`let x = value`), no validation needed.
 */
export function validateBindingRootType(target: BindingTarget, value: Any, sourceCodeInfo?: SourceCodeInfo): void {
  switch (target[0]) {
    case bindingTargetTypes.array:
      assertArray(value, sourceCodeInfo)
      break
    case bindingTargetTypes.object:
      assertObj(value, sourceCodeInfo)
      break
    // symbol, rest, literal, wildcard don't need root type validation
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single step in the path to extract a value from a nested structure.
 */
export type BindingPathStep =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number }

/**
 * A linearized binding slot representing one variable to bind.
 *
 * - `name`: The variable name to add to the context (or '_intermediate_N' for intermediate defaults)
 * - `path`: Sequence of steps to extract the value from the root
 * - `defaultNode`: Optional default expression if value is undefined
 * - `isRest`: If true, this is a rest binding (...x)
 * - `restKeys`: For object rest, the keys to exclude from rest collection
 * - `restIndex`: For array rest, the starting index for rest collection
 * - `nestedTarget`: If present, this slot has an intermediate default and needs
 *   further destructuring after the value is resolved.
 */
export interface BindingSlot {
  name: string
  path: BindingPathStep[]
  defaultNode?: AstNode
  isRest?: boolean
  restKeys?: Set<string> // for object rest: keys captured by other bindings
  restIndex?: number // for array rest: starting index
  nestedTarget?: BindingTarget // for intermediate defaults: nested binding to process
  nodeId: number
}

// ---------------------------------------------------------------------------
// Flatten binding pattern to slots
// ---------------------------------------------------------------------------

/**
 * Flatten a binding pattern into a linear list of slots.
 *
 * Example: `{a = 1, b: {c = 2}}`
 * Produces: [
 *   { name: 'a', path: [{type: 'key', key: 'a'}], defaultNode: <1> },
 *   { name: 'c', path: [{type: 'key', key: 'b'}, {type: 'key', key: 'c'}], defaultNode: <2> }
 * ]
 */
export function flattenBindingPattern(target: BindingTarget): BindingSlot[] {
  const slots: BindingSlot[] = []
  flattenTarget(target, [], slots)
  return slots
}

function flattenTarget(
  target: BindingTarget,
  path: BindingPathStep[],
  slots: BindingSlot[],
): void {
  const nodeId = target[2]

  switch (target[0]) {
    case bindingTargetTypes.symbol: {
      // Simple binding: x or x = default
      const symbolNode = target[1][0] as UserDefinedSymbolNode
      const defaultNode = target[1][1]
      slots.push({
        name: symbolNode[1],
        path: [...path],
        defaultNode,
        nodeId,
      })
      break
    }

    case bindingTargetTypes.rest: {
      // Rest binding: ...x
      const name = target[1][0]
      const defaultNode = target[1][1]

      // For rest, we need to know what keys/indices to exclude
      // This is computed at runtime based on sibling slots
      slots.push({
        name,
        path: [...path],
        defaultNode,
        isRest: true,
        nodeId,
      })
      break
    }

    case bindingTargetTypes.object: {
      // Object destructuring: {a, b: c, ...rest}
      const entries = target[1][0]
      const capturedKeys = new Set<string>()

      for (const { key, target: element } of entries) {
        if (element[0] === bindingTargetTypes.rest) {
          // Rest element - add after processing all other keys
          continue
        }
        capturedKeys.add(key)
        const newPath: BindingPathStep[] = [...path, { type: 'key', key }]

        // Check for intermediate default on compound binding
        const hasDefault = element[1][1] !== undefined
        const isCompound = element[0] === bindingTargetTypes.object || element[0] === bindingTargetTypes.array

        if (hasDefault && isCompound) {
          // Intermediate default: create a slot that will spawn nested binding
          slots.push({
            name: `_intermediate_${slots.length}`,
            path: newPath,
            defaultNode: element[1][1],
            nestedTarget: element,
            nodeId: element[2],
          })
        } else {
          flattenTarget(element, newPath, slots)
        }
      }

      // Handle rest element if present
      for (const { target: element } of entries) {
        if (element[0] === bindingTargetTypes.rest) {
          const name = element[1][0]
          slots.push({
            name,
            path: [...path],
            isRest: true,
            restKeys: capturedKeys,
            nodeId: element[2],
          })
          break
        }
      }
      break
    }

    case bindingTargetTypes.array: {
      // Array destructuring: [a, b, ...rest]
      const elements = target[1][0]

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        if (element === null || element === undefined) continue // Skipped position

        if (element[0] === bindingTargetTypes.rest) {
          const name = element[1][0]
          slots.push({
            name,
            path: [...path],
            isRest: true,
            restIndex: i,
            nodeId: element[2],
          })
          break
        }

        const newPath: BindingPathStep[] = [...path, { type: 'index', index: i }]

        // Check for intermediate default on compound binding
        const hasDefault = element[1][1] !== undefined
        const isCompound = element[0] === bindingTargetTypes.object || element[0] === bindingTargetTypes.array

        if (hasDefault && isCompound) {
          // Intermediate default: create a slot that will spawn nested binding
          slots.push({
            name: `_intermediate_${slots.length}`,
            path: newPath,
            defaultNode: element[1][1],
            nestedTarget: element,
            nodeId: element[2],
          })
        } else {
          flattenTarget(element, newPath, slots)
        }
      }
      break
    }

  }
}

// ---------------------------------------------------------------------------
// Extract value by path
// ---------------------------------------------------------------------------

/**
 * Extract a value from a nested structure by following a path.
 *
 * Returns undefined if the path cannot be followed (missing key/index).
 */
export function extractValueByPath(rootValue: Any, path: BindingPathStep[], sourceCodeInfo?: SourceCodeInfo): Any | undefined {
  let current: unknown = rootValue

  for (const step of path) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (step.type === 'key') {
      assertObj(current, sourceCodeInfo)
      current = (current).get(step.key)
    } else {
      assertArray(current, sourceCodeInfo)
      current = (current).get(step.index)
    }
  }

  return current as Any | undefined
}

/**
 * Extract rest values for an object rest binding.
 * Returns an object with all keys except those in restKeys.
 */
export function extractObjectRest(value: Any, restKeys: Set<string>, sourceCodeInfo?: SourceCodeInfo): PersistentMap {
  assertObj(value, sourceCodeInfo)
  let result = PersistentMap.empty<Any>()
  for (const [key, val] of value as PersistentMap<Any>) {
    if (!restKeys.has(key)) {
      result = result.assoc(key, val)
    }
  }
  return result
}

/**
 * Extract rest values for an array rest binding.
 * Returns elements from restIndex onwards.
 */
export function extractArrayRest(value: Any, restIndex: number, sourceCodeInfo?: SourceCodeInfo): Arr {
  assertArray(value, sourceCodeInfo)
  // Collect elements from restIndex to end — PersistentVector has no native slice
  const arr = value
  const items: unknown[] = []
  for (let i = restIndex; i < arr.size; i++) {
    items.push(arr.get(i))
  }
  return PersistentVector.from(items)
}
