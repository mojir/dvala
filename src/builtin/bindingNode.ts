import { DvalaError } from '../errors'
import type { AstNode, BindingTarget } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'

export function walkDefaults(
  bindingTarget: BindingTarget,
  onDefault: (Node: AstNode) => void,
): void {
  if (bindingTarget[0] === bindingTargetTypes.object) {
    Object.values(bindingTarget[1][0]).forEach(element => {
      if (element[1][1]) {
        onDefault(element[1][1])
      }
      walkDefaults(element, onDefault)
    })
  } else if (bindingTarget[0] === bindingTargetTypes.array) {
    for (let index = 0; index < bindingTarget[1][0].length; index += 1) {
      const element = bindingTarget[1][0][index] ?? null
      // Defensive: sparse array elements are filtered during parsing
      /* v8 ignore next 3 */
      if (element === null) {
        continue
      }
      if (element[1][1]) {
        onDefault(element[1][1])
      }
      walkDefaults(element, onDefault)
    }
  }
  // literal and wildcard have no defaults - nothing to walk
}

export function getAllBindingTargetNames(bindingTarget: BindingTarget): Record<string, true> {
  const names: Record<string, true> = {}
  getNamesFromBindingTarget(bindingTarget, names)
  return names
}

function getNamesFromBindingTarget(target: BindingTarget | null, names: Record<string, true>): void {
  if (target === null) {
    return
  }
  if (target[0] === bindingTargetTypes.array) {
    for (const element of target[1][0]) {
      getNamesFromBindingTarget(element, names)
    }
  } else if (target[0] === bindingTargetTypes.object) {
    for (const element of Object.values(target[1][0])) {
      getNamesFromBindingTarget(element, names)
    }
  } else if (target[0] === bindingTargetTypes.rest) {
    if (names[target[1][0]]) {
      throw new DvalaError(`Duplicate binding name: ${target[1][0]}`, target[2])
    }
    names[target[1][0]] = true
  } else if (target[0] === bindingTargetTypes.symbol) {
    if (names[target[1][0][1]]) {
      throw new DvalaError(`Duplicate binding name: ${target[1][0]}`, target[2])
    }
    names[target[1][0][1]] = true
  }
  // literal and wildcard bind no names - skip
}

