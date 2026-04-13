/**
 * Top-level typecheck pass — runs after parsing, before evaluation.
 *
 * Takes an AST and returns type diagnostics (errors/warnings).
 * The type map (nodeId → Type) is built as a side effect and can
 * be used by the IDE for hover types.
 *
 * Type errors do NOT block evaluation — they're informational.
 * The evaluator runs regardless, just like in TypeScript.
 */

import type { Type } from './types'
import type { AstNode, Ast, SourceMap, SourceMapPosition } from '../parser/types'
import { resolveSourceCodeInfo } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { InferenceContext, TypeEnv, inferExpr, TypeInferenceError } from './infer'
import { initBuiltinTypes, registerModuleType } from './builtinTypes'
import { initBuiltinEffects } from './effectTypes'
import { allBuiltinModules } from '../allModules'
import { builtin } from '../builtin'

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

export interface TypeDiagnostic {
  message: string
  severity: 'error' | 'warning'
  /** Source location, if available. */
  sourceCodeInfo?: SourceCodeInfo
}

export interface TypecheckResult {
  /** Type diagnostics (errors and warnings). */
  diagnostics: TypeDiagnostic[]
  /** Side-table mapping nodeId → inferred Type. Used by IDE features. */
  typeMap: Map<number, Type>
  /** Source map for mapping nodeIds to source positions. Used by IDE hover. */
  sourceMap?: Map<number, SourceMapPosition>
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let initialized = false

/** Initialize the type system — call once before first typecheck. */
export function initTypeSystem(): void {
  if (initialized) return
  initialized = true
  initBuiltinTypes(builtin.normalExpressions)
  initBuiltinEffects()
  // Register module export types so import("math") etc. are typed
  for (const mod of allBuiltinModules) {
    registerModuleType(mod.name, mod.functions)
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Typecheck an AST. Returns diagnostics and a type map.
 *
 * Type errors are recovered per-subexpression (assigned Unknown),
 * so the type map is populated even when errors are found.
 * This enables IDE features (hover, completions) on partially-typed code.
 */
export function typecheck(ast: Ast): TypecheckResult {
  initTypeSystem()

  const ctx = new InferenceContext()
  // Pass type annotations from the parser to the inference engine
  if (ast.typeAnnotations) {
    ctx.typeAnnotations = ast.typeAnnotations
  }
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()
  const diagnostics: TypeDiagnostic[] = []

  for (const node of ast.body) {
    try {
      inferExpr(node, ctx, env, typeMap)
    } catch (e) {
      if (e instanceof TypeInferenceError) {
        diagnostics.push({
          message: e.message,
          severity: 'error',
          sourceCodeInfo: resolveNodeSourceInfo(node, ast.sourceMap),
        })
      } else {
        // Unexpected error — rethrow
        throw e
      }
    }
  }

  return { diagnostics, typeMap, sourceMap: ast.sourceMap?.positions }
}

/**
 * Typecheck a single expression (for REPL / quick checks).
 * Returns the inferred type and any diagnostics.
 */
export function typecheckExpr(nodes: AstNode[], sourceMap?: SourceMap): TypecheckResult & { type: Type } {
  initTypeSystem()

  const ctx = new InferenceContext()
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()
  const diagnostics: TypeDiagnostic[] = []
  let resultType: Type = { tag: 'Unknown' }

  for (const node of nodes) {
    try {
      resultType = inferExpr(node, ctx, env, typeMap)
    } catch (e) {
      if (e instanceof TypeInferenceError) {
        diagnostics.push({
          message: e.message,
          severity: 'error',
          sourceCodeInfo: resolveNodeSourceInfo(node, sourceMap),
        })
        resultType = { tag: 'Unknown' }
      } else {
        throw e
      }
    }
  }

  return { diagnostics, typeMap, type: resultType }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to resolve source info for an AST node. */
function resolveNodeSourceInfo(node: AstNode, sourceMap?: SourceMap): SourceCodeInfo | undefined {
  const nodeId = node[2]
  if (!sourceMap || nodeId <= 0) return undefined
  return resolveSourceCodeInfo(nodeId, sourceMap) ?? undefined
}
