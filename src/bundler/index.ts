import fs from 'node:fs'
import path from 'node:path'
import { NodeTypes } from '../constants/constants'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { parseToAst } from '../parser'
import type { Ast, AstNode, SourceMap } from '../parser/types'
import type { DvalaBundle } from './interface'

const builtinModuleNames = new Set([
  'assert',
  'grid',
  'vector',
  'linearAlgebra',
  'matrix',
  'numberTheory',
  'math',
  'functional',
  'string',
  'collection',
  'sequence',
  'bitwise',
])

/**
 * Regex to match file imports: import("./..."), import("../..."), or import("/...").
 * Only paths starting with ./, ../, or / are treated as file imports.
 * Bare module names like import("math") are left untouched.
 */
const fileImportPattern = /import\(\s*"(\.{0,2}\/[^"]+)"\s*\)|import\(\s*'(\.{0,2}\/[^']+)'\s*\)/g

export interface BundleOptions {
  /** Include source maps in the bundle. Default: true */
  sourceMap?: boolean
}

/**
 * Bundles a Dvala entry file and all its file imports into a DvalaBundle.
 *
 * Resolves all `import("./path/to/file.dvala")` calls recursively,
 * deduplicates, detects circular dependencies, topologically sorts,
 * and produces a single AST with file modules inlined as let bindings.
 */
export function bundle(entryPath: string, options?: BundleOptions): DvalaBundle {
  const absoluteEntryPath = path.resolve(entryPath)
  const entryDir = path.dirname(absoluteEntryPath)
  const includeSourceMap = options?.sourceMap ?? true

  // Map from absolute file path → source code
  const fileSources = new Map<string, string>()
  // Map from absolute file path → canonical module name
  const canonicalNames = new Map<string, string>()
  // Map from absolute file path → parsed AST
  const fileAsts = new Map<string, Ast>()
  // Adjacency list: file → set of files it imports
  const dependencies = new Map<string, Set<string>>()
  // Map from absolute file path → binding variable name (e.g. __module_lib_math)
  const bindingNames = new Map<string, string>()

  // Phase 1: Resolve all file imports recursively and parse to AST
  resolveFile(absoluteEntryPath, [])

  // Phase 2: Build canonical names and binding variable names
  buildCanonicalNames(entryDir)

  // Phase 3: Topological sort (exclude entry file — it becomes the program body)
  const sorted = topologicalSort(absoluteEntryPath)

  // Phase 4: Rewrite Import nodes to Sym references in all ASTs
  for (const filePath of [...sorted, absoluteEntryPath]) {
    const ast = fileAsts.get(filePath)!
    ast.body = ast.body.map(node => rewriteImportNodes(node, filePath))
  }

  // Phase 5: Build the single merged AST
  // Each file module becomes: let __module_X = do <body> end;
  // Then the entry body follows
  const mergedBody: AstNode[] = []
  const mergedSourceMap: SourceMap = { sources: [], positions: new Map() }

  for (const filePath of sorted) {
    const ast = fileAsts.get(filePath)!
    const varName = bindingNames.get(filePath)!

    // Merge source map entries
    mergeSourceMapInto(mergedSourceMap, ast.sourceMap)

    // Create: let __module_X = do <module body> end;
    const blockNode: AstNode = [NodeTypes.Block, ast.body, 0]
    const symNode: AstNode = [NodeTypes.Sym, varName, 0]
    const bindingTarget = ['symbol', [symNode, null], 0]
    const letNode: AstNode = [NodeTypes.Let, [bindingTarget, blockNode], 0]
    mergedBody.push(letNode)
  }

  // Append entry file body
  const entryAst = fileAsts.get(absoluteEntryPath)!
  mergeSourceMapInto(mergedSourceMap, entryAst.sourceMap)
  mergedBody.push(...entryAst.body)

  const ast: Ast = {
    body: mergedBody,
    sourceMap: includeSourceMap && mergedSourceMap.positions.size > 0 ? mergedSourceMap : undefined,
  }

  return { version: 1, ast }

  // --- Helper functions (closures over the maps above) ---

  function resolveFile(absoluteFilePath: string, stack: string[]): void {
    // Circular dependency detection
    if (stack.includes(absoluteFilePath)) {
      const cycle = [...stack.slice(stack.indexOf(absoluteFilePath)), absoluteFilePath]
      throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`)
    }

    // Already resolved (deduplication)
    if (fileSources.has(absoluteFilePath)) {
      return
    }

    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${absoluteFilePath}`)
    }

    const source = fs.readFileSync(absoluteFilePath, 'utf-8')
    fileSources.set(absoluteFilePath, source)

    // Parse to AST
    const tokenStream = tokenize(source, includeSourceMap, absoluteFilePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const parsedAst = parseToAst(minified)
    fileAsts.set(absoluteFilePath, parsedAst)

    const deps = new Set<string>()
    dependencies.set(absoluteFilePath, deps)

    const dir = path.dirname(absoluteFilePath)

    // Find file imports from the source text (regex is simpler than walking AST for discovery)
    for (const match of source.matchAll(fileImportPattern)) {
      const importPath = (match[1] ?? match[2])!
      const resolvedPath = path.resolve(dir, importPath)

      deps.add(resolvedPath)
      resolveFile(resolvedPath, [...stack, absoluteFilePath])
    }
  }

  function buildCanonicalNames(entryDirectory: string): void {
    const usedNames = new Set<string>()

    for (const absoluteFilePath of fileSources.keys()) {
      // Skip the entry file — it doesn't need a canonical name
      if (absoluteFilePath === absoluteEntryPath) {
        continue
      }

      let name = deriveCanonicalName(absoluteFilePath, entryDirectory)

      // Resolve collisions with builtin modules
      while (builtinModuleNames.has(name) || usedNames.has(name)) {
        name = `_${name}`
      }

      usedNames.add(name)
      canonicalNames.set(absoluteFilePath, name)
      // Convert canonical name to a valid variable name: lib/math → __module_lib_math
      bindingNames.set(absoluteFilePath, `__module_${name.replace(/[^a-zA-Z0-9]/g, '_')}`)
    }
  }

  function deriveCanonicalName(absoluteFilePath: string, entryDirectory: string): string {
    const relativePath = path.relative(entryDirectory, absoluteFilePath)

    // If the file is under the entry directory (no leading ..)
    if (!relativePath.startsWith('..')) {
      return stripExtension(relativePath)
    }

    // File is outside the entry directory — use last N path segments
    const segments = absoluteFilePath.split(path.sep)
    const fallback = segments.slice(-2).join('/')
    return stripExtension(fallback)
  }

  function stripExtension(filePath: string): string {
    if (filePath.endsWith('.dvala')) {
      return filePath.slice(0, -('.dvala'.length))
    }
    return filePath
  }

  function topologicalSort(entryFilePath: string): string[] {
    const result: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    function visit(filePath: string): void {
      if (visited.has(filePath)) {
        return
      }
      /* v8 ignore next 3 */
      if (visiting.has(filePath))
        throw new Error(`Circular dependency detected during topological sort: ${filePath}`)

      visiting.add(filePath)

      const deps = dependencies.get(filePath)
      if (deps) {
        for (const dep of deps) {
          visit(dep)
        }
      }

      visiting.delete(filePath)
      visited.add(filePath)

      // Don't add the entry file — its body is appended after module bindings
      if (filePath !== entryFilePath) {
        result.push(filePath)
      }
    }

    visit(entryFilePath)

    return result
  }

  // Walk AST and replace Import nodes for file modules with Sym references
  function rewriteImportNodes(node: AstNode, sourceFilePath: string): AstNode {
    const [type, payload, nodeId] = node

    if (type === NodeTypes.Import) {
      const moduleName = payload as string
      // Check if this import path resolves to a known file module
      // Import nodes from parsed source contain the original path string (e.g. "./lib/math.dvala")
      if (moduleName.startsWith('./') || moduleName.startsWith('../') || moduleName.startsWith('/')) {
        const dir = path.dirname(sourceFilePath)
        const resolvedPath = path.resolve(dir, moduleName)
        const varName = bindingNames.get(resolvedPath)
        if (varName) {
          return [NodeTypes.Sym, varName, nodeId]
        }
      }
      // Not a file import — leave as-is (builtin module)
      return node
    }

    // Recurse into payload
    if (Array.isArray(payload)) {
      const newPayload = payload.map(item =>
        isAstNode(item) ? rewriteImportNodes(item as AstNode, sourceFilePath) : item,
      )
      return [type, newPayload, nodeId]
    }

    return node
  }
}

function isAstNode(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number'
}

function mergeSourceMapInto(target: SourceMap, source: SourceMap | undefined): void {
  if (!source) return
  const sourceOffset = target.sources.length
  target.sources.push(...source.sources)
  for (const [nodeId, pos] of source.positions) {
    target.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
  }
}
