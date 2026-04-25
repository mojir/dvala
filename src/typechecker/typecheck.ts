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
import type { DvalaModule } from '../builtin/modules/interface'
import type { AstNode, Ast, SourceMap, SourceMapPosition } from '../parser/types'
import { resolveSourceCodeInfo } from '../parser/types'
import { parseToAst } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import type { SourceCodeInfo } from '../tokenizer/token'
import { expandType, InferenceContext, TypeEnv, inferExpr, TypeInferenceError } from './infer'
import { initBuiltinTypes, registerModuleType, resetModuleTypeCache } from './builtinTypes'
import { declareEffect, initBuiltinEffects, resetUserEffects, restoreEffectRegistry, snapshotEffectRegistry } from './effectTypes'
import { parseTypeAnnotation, registerTypeAlias, resetTypeAliases, restoreTypeAliases, snapshotTypeAliases, TypeParseError } from './parseType'
import { installPreludeAliases } from './prelude'
import { builtin } from '../builtin'
import { expandMacros } from '../ast/expandMacros'

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
  /** Modules available to import during type checking. */
  modules?: DvalaModule[]
  /**
   * Enable constant folding during inference. When `true`, pure calls with
   * all-literal arguments produce Literal types; literal-cond branches prune
   * unreachable arms; etc. Takes precedence over the `DVALA_FOLD` env var.
   * If omitted, the env var default is used.
   *
   * See design/archive/2026-04-16_constant-folding-in-types.md.
   */
  fold?: boolean
}

interface CachedFileTypeResult {
  type: Type
  diagnostics: TypeDiagnostic[]
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

  // Expand macros before type inference so macro calls get concrete types
  const resolver = options?.fileResolver
  const baseDir = options?.fileResolverBaseDir ?? '.'
  const expandedAst = expandMacros(ast, resolver ? { fileResolver: resolver, fileResolverBaseDir: baseDir } : undefined)
  const sourceMap = expandedAst.sourceMap ?? ast.sourceMap
  const diagnostics: TypeDiagnostic[] = []
  const reportedImportDiagnostics = new Set<string>()
  // Imported-file types should be cached within one top-level typecheck pass
  // so transitive imports are deduplicated without leaking stale results into
  // later editor checks after a file changes on disk.
  const fileTypeCache = new Map<string, CachedFileTypeResult>()

  const ctx = new InferenceContext()
  // Per-call fold override. Omitted → use env-var default (FOLD_ENABLED).
  if (options?.fold !== undefined) ctx.foldEnabled = options.fold
  // Wire file import resolution if a file resolver is provided
  if (resolver) {
    // Build a resolveFileType closure for a given base directory.
    // Used both for the top-level context and recursively for nested imports
    // so that transitive file imports (e.g. constants.dvala → macros.dvala) are resolved.
    const makeResolveFileType = (fromDir: string) => (importPath: string): Type => {
      const cacheKey = `${fromDir}:${importPath}`
      const cached = fileTypeCache.get(cacheKey)
      if (cached) {
        for (const diagnostic of cached.diagnostics) {
          pushUniqueDiagnostic(diagnostics, diagnostic, reportedImportDiagnostics)
        }
        return cached.type
      }

      try {
        const source = resolver(importPath, fromDir)
        const resolvedImportPath = resolveImportedFilePath(fromDir, importPath)
        const ts = tokenize(source, true, resolvedImportPath)
        const min = minifyTokenStream(ts, { removeWhiteSpace: true })
        const rawAst = parseToAst(min)
        // Expand macros before type inference so macro calls get concrete types.
        // Pass the file resolver so cross-file macros (e.g. import("./macros")) are discovered.
        const nestedDir = resolveImportedFileDir(fromDir, importPath)
        const importedAst = expandMacros(rawAst, { fileResolver: resolver, fileResolverBaseDir: nestedDir })
        const importCtx = new InferenceContext()
        importCtx.resolveFileType = makeResolveFileType(nestedDir)
        if (importedAst.typeAnnotations) {
          importCtx.typeAnnotations = importedAst.typeAnnotations
        }
        if (importedAst.typeParams) {
          importCtx.typeParams = importedAst.typeParams
        }
        const importEnv = new TypeEnv()
        const importTypeMap = new Map<number, Type>()
        const importDiagnostics: TypeDiagnostic[] = []
        const effectSnapshot = snapshotEffectRegistry()
        const typeAliasSnapshot = snapshotTypeAliases()

        try {
          // Imported files need the same declaration setup as top-level files.
          // Without this, handler/effect/type annotations inside imported modules
          // silently collapse to Unknown during module interface inference.
          if (importedAst.typeAliases) {
            for (const [name, { params, body }] of importedAst.typeAliases) {
              registerTypeAlias(name, params, body)
            }
          }
          if (importedAst.effectDeclarations) {
            for (const [name, { argType, retType }] of importedAst.effectDeclarations) {
              // Effect-type annotations can reference bounded aliases; a
              // bound violation raises TypeParseError. Surface as a
              // diagnostic on the imported-file side rather than aborting
              // the outer typecheck.
              try {
                declareEffect(name, parseTypeAnnotation(argType), parseTypeAnnotation(retType))
              } catch (error) {
                if (error instanceof TypeParseError) {
                  importDiagnostics.push({
                    message: `Invalid effect type for @${name}: ${error.cleanMessage}`,
                    severity: 'error',
                  })
                } else {
                  throw error
                }
              }
            }
          }

          const resultType = inferNodesRecoveringErrors(
            importedAst.body,
            importCtx,
            importEnv,
            importTypeMap,
            importDiagnostics,
            importedAst.sourceMap ?? rawAst.sourceMap,
          )

          const cachedResult = { type: normalizeImportedExportType(resultType), diagnostics: importDiagnostics }
          fileTypeCache.set(cacheKey, cachedResult)
          for (const diagnostic of importDiagnostics) {
            pushUniqueDiagnostic(diagnostics, diagnostic, reportedImportDiagnostics)
          }
          return cachedResult.type
        } finally {
          restoreEffectRegistry(effectSnapshot)
          restoreTypeAliases(typeAliasSnapshot)
        }
      } catch {
        // File resolution or parsing failed — return Unknown, don't crash
        fileTypeCache.set(cacheKey, { type: Unknown, diagnostics: [] })
        return Unknown
      }
    }
    ctx.resolveFileType = makeResolveFileType(baseDir)
  }
  // Clear per-document state from previous typecheck passes
  resetUserEffects()
  resetTypeAliases()
  // Re-install the standard prelude aliases (`Positive`, `NonEmpty`,
  // etc.) right after the reset so they're available to user source —
  // before user-declared aliases are registered, so user aliases can
  // shadow prelude ones of the same name (later `registerTypeAlias`
  // calls win on the underlying Map).
  //
  // ORDERING: must run BEFORE inference (line ~262 below). The
  // import-resolver closure takes a `snapshotTypeAliases()` mid-
  // flight; that snapshot must include the prelude so a
  // `restoreTypeAliases` after the imported file finishes doesn't
  // strip the prelude. Today install is before inference so any
  // closure invocation sees the prelude — moving it after inference
  // would silently break imports that rely on prelude aliases.
  installPreludeAliases()
  resetModuleTypeCache()
  for (const mod of options?.modules ?? []) {
    registerModuleType(mod.name, mod.functions, mod.docs)
  }
  // Pass type annotations from the parser to the inference engine
  if (ast.typeAnnotations) {
    ctx.typeAnnotations = ast.typeAnnotations
  }
  // Phase 0b — pass binding-scoped type-param side-table so `let f<T: U>`
  // installs the bounded TypeVars for the RHS.
  if (ast.typeParams) {
    ctx.typeParams = ast.typeParams
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
      // See the imported-file path above for rationale on TypeParseError
      // handling — bounded aliases in effect types can produce these
      // during parse.
      try {
        declareEffect(name, parseTypeAnnotation(argType), parseTypeAnnotation(retType))
      } catch (error) {
        if (error instanceof TypeParseError) {
          // Effect declarations live in the parser's side-table keyed by
          // name only — no nodeId / source location is retained today.
          // The error message includes the effect name so users can
          // grep their source. Adding location info would require
          // threading the declaration nodeId into `effectDeclarations`,
          // which is out of scope for Phase 0a.
          diagnostics.push({
            message: `Invalid effect type for @${name}: ${error.cleanMessage}`,
            severity: 'error',
          })
        } else {
          throw error
        }
      }
    }
  }
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()
  inferNodesRecoveringErrors(expandedAst.body, ctx, env, typeMap, diagnostics, sourceMap)

  return { diagnostics, typeMap, sourceMap: sourceMap?.positions }
}

/**
 * Typecheck a single expression (for REPL / quick checks).
 * Returns the inferred type and any diagnostics.
 */
export function typecheckExpr(nodes: AstNode[], sourceMap?: SourceMap, options?: TypecheckOptions): TypecheckResult & { type: Type } {
  initTypeSystem()

  const ctx = new InferenceContext()
  if (options?.fold !== undefined) ctx.foldEnabled = options.fold
  resetUserEffects()
  resetTypeAliases()
  // Re-install prelude aliases for the same reason as in `typecheck`
  // above — keeps `Positive`, `NonEmpty`, etc. visible in REPL /
  // single-expression checks too.
  installPreludeAliases()
  resetModuleTypeCache()
  for (const mod of options?.modules ?? []) {
    registerModuleType(mod.name, mod.functions, mod.docs)
  }
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()
  const diagnostics: TypeDiagnostic[] = []
  const resultType = inferNodesRecoveringErrors(nodes, ctx, env, typeMap, diagnostics, sourceMap)

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

function resolveErrorSourceInfo(error: TypeInferenceError, fallbackNode: AstNode, sourceMap?: SourceMap): SourceCodeInfo | undefined {
  if (sourceMap && error.nodeId && error.nodeId > 0) {
    const resolved = resolveSourceCodeInfo(error.nodeId, sourceMap)
    if (resolved) return resolved
  }

  return resolveNodeSourceInfo(fallbackNode, sourceMap)
}

function resolveImportedFileDir(fromDir: string, importPath: string): string {
  const normalizedFromDir = normalizePath(fromDir)
  const normalizedImportPath = normalizePath(importPath)

  if (isAbsolutePath(normalizedImportPath)) {
    return dirnamePath(normalizedImportPath)
  }

  return dirnamePath(joinPath(normalizedFromDir, normalizedImportPath))
}

function resolveImportedFilePath(fromDir: string, importPath: string): string {
  const normalizedFromDir = normalizePath(fromDir)
  const normalizedImportPath = normalizePath(importPath)

  if (isAbsolutePath(normalizedImportPath)) {
    return normalizedImportPath
  }

  return joinPath(normalizedFromDir, normalizedImportPath)
}

function pushUniqueDiagnostic(
  diagnostics: TypeDiagnostic[],
  diagnostic: TypeDiagnostic,
  seen: Set<string>,
): void {
  const key = JSON.stringify({
    message: diagnostic.message,
    severity: diagnostic.severity,
    filePath: diagnostic.sourceCodeInfo?.filePath,
    line: diagnostic.sourceCodeInfo?.position.line,
    column: diagnostic.sourceCodeInfo?.position.column,
  })

  if (seen.has(key)) return
  seen.add(key)
  diagnostics.push(diagnostic)
}

function inferNodesRecoveringErrors(
  nodes: AstNode[],
  ctx: InferenceContext,
  env: TypeEnv,
  typeMap: Map<number, Type>,
  diagnostics: TypeDiagnostic[],
  sourceMap?: SourceMap,
): Type {
  let resultType: Type = Unknown

  for (const node of nodes) {
    try {
      resultType = inferExpr(node, ctx, env, typeMap)
      drainDeferredDiagnostics(ctx, diagnostics, node, sourceMap)
    } catch (error) {
      if (!(error instanceof TypeInferenceError)) {
        throw error
      }

      diagnostics.push({
        message: error.message,
        severity: error.severity,
        sourceCodeInfo: resolveErrorSourceInfo(error, node, sourceMap),
      })
      resultType = Unknown
    }
  }

  return resultType
}

function drainDeferredDiagnostics(
  ctx: InferenceContext,
  diagnostics: TypeDiagnostic[],
  fallbackNode: AstNode,
  sourceMap?: SourceMap,
): void {
  for (const error of ctx.takeDeferredErrors()) {
    diagnostics.push({
      message: error.message,
      severity: error.severity,
      sourceCodeInfo: resolveErrorSourceInfo(error, fallbackNode, sourceMap),
    })
  }
}

function normalizeHandledSignatures(
  handled: Map<string, { argType: Type; retType: Type }>,
): Map<string, { argType: Type; retType: Type }> {
  return new Map(
    [...handled.entries()].map(([name, sig]) => [name, {
      argType: expandType(sig.argType, 'negative'),
      retType: expandType(sig.retType, 'positive'),
    }]),
  )
}

function normalizeImportedExportType(type: Type): Type {
  switch (type.tag) {
    case 'Function': {
      const handlerWrapper = type.handlerWrapper
        ? {
          paramIndex: type.handlerWrapper.paramIndex,
          handled: normalizeHandledSignatures(type.handlerWrapper.handled),
          introduced: type.handlerWrapper.introduced,
        }
        : undefined
      return {
        ...type,
        params: type.params.map(normalizeImportedExportType),
        ...(type.restParam !== undefined ? { restParam: normalizeImportedExportType(type.restParam) } : {}),
        ret: normalizeImportedExportType(type.ret),
        ...(handlerWrapper ? { handlerWrapper } : {}),
      }
    }
    case 'Handler':
      return {
        ...type,
        body: normalizeImportedExportType(type.body),
        output: normalizeImportedExportType(type.output),
        handled: normalizeHandledSignatures(type.handled),
        // `introduced` is carried through via the `...type` spread. It's
        // an EffectSet of string names with no nested Type references,
        // so nothing inside it needs recursive normalization — listing
        // it here explicitly to keep the Handler-shape audit uniform
        // with the Function case above, which now forwards `introduced`
        // on its handlerWrapper.
        introduced: type.introduced,
      }
    case 'Record':
      return {
        ...type,
        fields: new Map(
          [...type.fields.entries()].map(([name, fieldType]) => [name, normalizeImportedExportType(fieldType)]),
        ),
      }
    case 'Array':
      return { ...type, element: normalizeImportedExportType(type.element) }
    case 'Sequence':
      return {
        ...type,
        prefix: type.prefix.map(normalizeImportedExportType),
        rest: normalizeImportedExportType(type.rest),
      }
    case 'Tuple':
      return { ...type, elements: type.elements.map(normalizeImportedExportType) }
    case 'Union':
      return { ...type, members: type.members.map(normalizeImportedExportType) }
    case 'Inter':
      return { ...type, members: type.members.map(normalizeImportedExportType) }
    case 'Neg':
      return { ...type, inner: normalizeImportedExportType(type.inner) }
    case 'Alias':
      return {
        ...type,
        args: type.args.map(normalizeImportedExportType),
        expanded: normalizeImportedExportType(type.expanded),
      }
    case 'Recursive':
      return { ...type, body: normalizeImportedExportType(type.body) }
    default:
      return type
  }
}

function normalizePath(pathLike: string): string {
  return pathLike.replaceAll('\\', '/')
}

function isAbsolutePath(pathLike: string): boolean {
  return pathLike.startsWith('/') || /^[A-Za-z]:\//.test(pathLike)
}

function dirnamePath(pathLike: string): string {
  const normalized = normalizePath(pathLike)
  const root = getPathRoot(normalized)
  const segments = splitPathSegments(normalized)

  if (segments.length === 0) {
    return root || '.'
  }

  const parentSegments = segments.slice(0, -1)
  return buildPath(root, parentSegments)
}

function joinPath(baseDir: string, importPath: string): string {
  const root = getPathRoot(baseDir)
  const combinedSegments = [...splitPathSegments(baseDir), ...splitPathSegments(importPath)]
  const resolvedSegments: string[] = []

  for (const segment of combinedSegments) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') {
      if (resolvedSegments.length > 0 && resolvedSegments[resolvedSegments.length - 1] !== '..') {
        resolvedSegments.pop()
      } else if (!root) {
        resolvedSegments.push('..')
      }
      continue
    }
    resolvedSegments.push(segment)
  }

  return buildPath(root, resolvedSegments)
}

function getPathRoot(pathLike: string): string {
  if (pathLike.startsWith('/')) return '/'
  const driveMatch = pathLike.match(/^[A-Za-z]:/)
  return driveMatch?.[0] ?? ''
}

function splitPathSegments(pathLike: string): string[] {
  const normalized = normalizePath(pathLike)
  const root = getPathRoot(normalized)
  const withoutRoot = root === '/'
    ? normalized.slice(1)
    : root
      ? normalized.slice(root.length).replace(/^\//, '')
      : normalized
  return withoutRoot.split('/').filter(Boolean)
}

function buildPath(root: string, segments: string[]): string {
  const joined = segments.join('/')
  if (root === '/') return joined ? `/${joined}` : '/'
  if (root) return joined ? `${root}/${joined}` : `${root}/`
  return joined || '.'
}
