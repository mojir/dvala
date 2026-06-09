import { createContextStack } from '../../evaluator/ContextStack'
import { evaluate } from '../../evaluator/trampoline-evaluator'
import type { Any } from '@mojir/dvala-types'
import type { SourceMap } from '@mojir/dvala-types'
import type { UserDefinedFunction } from '@mojir/dvala-types'
import { isDvalaFunction } from '@mojir/dvala-types'
import { isObj } from '@mojir/dvala-types'
import type { ParseSource } from '../../evaluator/interface'
import collectionSource from '../core/collection.dvala'
import sequenceSource from '../core/sequence.dvala'
import functionalSource from '../core/functional.dvala'
import errorSource from '../core/error.dvala'
import objectSource from '../core/object.dvala'
import predicatesSource from '../core/predicates.dvala'
import { normalExpressions } from '.'

const coreDvalaSources: Record<string, string> = {
  collection: collectionSource,
  error: errorSource,
  sequence: sequenceSource,
  functional: functionalSource,
  object: objectSource,
  predicates: predicatesSource,
}

/** Repo-relative path each core source resolves to, for coverage attribution. */
function coreSourcePath(name: string): string {
  return `packages/dvala-engine/src/builtin/core/${name}.dvala`
}

export interface InitCoreDvalaOptions {
  /**
   * Build source maps for the builtin bodies. Required for `.dvala` coverage:
   * onNodeEval hits on a builtin node can only be attributed to source when the
   * node has a source-map position.
   */
  debug?: boolean
  /**
   * Shared node-ID allocator from the host. Mandatory for coverage — without it
   * the builtin bodies and the user program both start counting from 0 and their
   * nodeIds collide, conflating coverage. Sharing makes the user program continue
   * after the builtins' range.
   */
  allocateNodeId?: () => number
}

/**
 * Parse + register the core `.dvala` builtins onto the normalExpressions registry.
 *
 * When `debug` is set, returns a merged source map covering every core builtin
 * body (sources offset so a single map spans all files). The host seeds this into
 * its accumulated source map so coverage can resolve builtin nodeIds back to their
 * `.dvala` source. Returns `undefined` when debug is off (no source maps built).
 */
export function initCoreDvalaSources(
  parseSource: ParseSource,
  options: InitCoreDvalaOptions = {},
): SourceMap | undefined {
  const { debug = false, allocateNodeId } = options
  let builtinSourceMap: SourceMap | undefined

  // INVARIANT (load-bearing for coverage): the parse below is UNCONDITIONAL — every
  // createDvala instance re-parses all core sources, even though `dvalaImpl` is only
  // assigned once (idempotent). Because parsing is deterministic (same sources, same
  // order, allocator from 0 — debug only attaches positions, it does not change the
  // ID sequence), every instance reproduces the exact same nodeId→position mapping.
  // Two consequences both coverage depends on:
  //   1. Builtins always occupy nodeIds [0, N); the user program continues at N, so
  //      builtin and user nodeIds never collide within an instance.
  //   2. The source map returned here matches the IDs of the executed `dvalaImpl`
  //      bodies (assigned by whichever instance was first), so onNodeEval hits on
  //      builtin nodes resolve correctly even in a later instance.
  // Do NOT skip this parse when `dvalaImpl` is already set — that would leave later
  // instances' counters at 0, collapsing the [0, N) reservation and corrupting both
  // coverage attribution and the user program's nodeIds. (Covered by the
  // cross-instance attribution regression test.)
  for (const [name, source] of Object.entries(coreDvalaSources)) {
    const ast = parseSource(source, {
      debug,
      filePath: debug ? coreSourcePath(name) : undefined,
      allocateNodeId,
    })

    // Merge this file's source map into the accumulated builtin map, mirroring the
    // runtime-import merge in trampoline-evaluator: offset source indices so every
    // builtin file is addressable through a single map.
    if (ast.sourceMap) {
      if (!builtinSourceMap) {
        builtinSourceMap = { sources: [...ast.sourceMap.sources], positions: new Map(ast.sourceMap.positions) }
      } else {
        const sourceOffset = builtinSourceMap.sources.length
        builtinSourceMap.sources.push(...ast.sourceMap.sources)
        for (const [nodeId, pos] of ast.sourceMap.positions) {
          builtinSourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
        }
      }
    }

    const contextStack = createContextStack()
    const result = evaluate(ast, contextStack) as Any

    if (result instanceof Promise) {
      throw new TypeError('Core dvala sources must be synchronous')
    }

    if (!isObj(result)) {
      continue
    }

    // PersistentMap doesn't expose entries via Object.entries — iterate directly.
    for (const [fnName, fn] of result) {
      const expression = normalExpressions[fnName]
      // Idempotent: already-patched implementations win (skip re-allocating nodeIds
      // when called repeatedly, e.g. once per createDvala() instance).
      if (
        expression &&
        !expression.dvalaImpl &&
        isDvalaFunction(fn) &&
        // Defensive: all core dvala modules produce UserDefined functions
        /* v8 ignore next */
        (fn as { functionType: string }).functionType === 'UserDefined'
      ) {
        expression.dvalaImpl = fn as UserDefinedFunction
      }
    }
  }

  return builtinSourceMap
}
