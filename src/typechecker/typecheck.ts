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
import { Unknown } from './types'
import type { AstNode, Ast, SourceMap, SourceMapPosition } from '../parser/types'
import { resolveSourceCodeInfo } from '../parser/types'
import { parseToAst } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import type { SourceCodeInfo } from '../tokenizer/token'
import { InferenceContext, TypeEnv, inferExpr, TypeInferenceError } from './infer'
import { initBuiltinTypes, registerModuleType } from './builtinTypes'
import { declareEffect, initBuiltinEffects, resetUserEffects } from './effectTypes'
import { parseTypeAnnotation, registerTypeAlias, resetTypeAliases } from './parseType'
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

export interface TypecheckOptions {
  /** Resolves file imports. Returns the source code of the file.
   * Should throw if the file is not found. */
  fileResolver?: (importPath: string, fromDir: string) => string
  /** Base directory for resolving relative imports. */
  fileResolverBaseDir?: string
}

/** Cache of typechecked file imports: filePath → exported type */
const fileTypeCache = new Map<string, Type>()

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
export function typecheck(ast: Ast, options?: TypecheckOptions): TypecheckResult {
  initTypeSystem()

  const ctx = new InferenceContext()
  // Wire file import resolution if a file resolver is provided
  if (options?.fileResolver) {
    const resolver = options.fileResolver
    const baseDir = options.fileResolverBaseDir ?? '.'
    ctx.resolveFileType = (importPath: string): Type => {
      // Check cache first
      const cacheKey = `${baseDir}:${importPath}`
      const cached = fileTypeCache.get(cacheKey)
      if (cached) return cached

      // Resolve and typecheck the imported file
      try {
        const source = resolver(importPath, baseDir)
        const ts = tokenize(source, true, undefined)
        const min = minifyTokenStream(ts, { removeWhiteSpace: true })
        const importedAst = parseToAst(min)
        const importCtx = new InferenceContext()
        const importEnv = new TypeEnv()
        const importTypeMap = new Map<number, Type>()

        let resultType: Type = Unknown
        for (const node of importedAst.body) {
          resultType = inferExpr(node, importCtx, importEnv, importTypeMap)
        }

        // Cache and return
        fileTypeCache.set(cacheKey, resultType)
        return resultType
      } catch {
        // File typecheck failed — return Unknown, don't crash
        fileTypeCache.set(cacheKey, Unknown)
        return Unknown
      }
    }
  }
  // Clear per-document state from previous typecheck passes
  resetUserEffects()
  resetTypeAliases()
  // Pass type annotations from the parser to the inference engine
  if (ast.typeAnnotations) {
    ctx.typeAnnotations = ast.typeAnnotations
  }
  // Register type aliases before inference so annotations can reference them
  if (ast.typeAliases) {
    for (const [name, { params, body }] of ast.typeAliases) {
      registerTypeAlias(name, params, body)
    }
  }
  // Register effect declarations before inference so perform() can type-check
  if (ast.effectDeclarations) {
    for (const [name, { argType, retType }] of ast.effectDeclarations) {
      declareEffect(name, parseTypeAnnotation(argType), parseTypeAnnotation(retType))
    }
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
