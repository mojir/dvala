import { Cache } from '../Cache'
import { parseToAst } from '../parser'
import type { Ast, SourceMap } from '@mojir/dvala-types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'

interface CreateAstBuilderOptions {
  debug: boolean
  cacheSize: number
  allocateNodeId: () => number
}

interface AstBuilder {
  buildAst: (source: string, filePath?: string, forceDebug?: boolean) => Ast
  getAccumulatedSourceMap: () => SourceMap | undefined
  setAccumulatedSourceMap: (sourceMap: SourceMap | undefined) => void
}

export function createAstBuilder(options: CreateAstBuilderOptions): AstBuilder {
  const cache = new Cache(options.cacheSize)
  let accumulatedSourceMap: SourceMap | undefined

  function buildAst(source: string, filePath?: string, forceDebug?: boolean): Ast {
    const effectiveDebug = options.debug || (forceDebug ?? false)
    if (!filePath && !forceDebug) {
      const cached = cache.get(source)
      if (cached) return cached
    }

    const tokenStream = tokenize(source, effectiveDebug, filePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = parseToAst(minified, options.allocateNodeId)

    if (ast.sourceMap) {
      if (!accumulatedSourceMap) {
        accumulatedSourceMap = { sources: [...ast.sourceMap.sources], positions: new Map(ast.sourceMap.positions) }
      } else {
        const sourceOffset = accumulatedSourceMap.sources.length
        accumulatedSourceMap.sources.push(...ast.sourceMap.sources)
        for (const [nodeId, pos] of ast.sourceMap.positions) {
          accumulatedSourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
        }
      }

      ast.sourceMap = accumulatedSourceMap
    }

    if (!filePath && !forceDebug) {
      cache.set(source, ast)
    }

    return ast
  }

  return {
    buildAst,
    getAccumulatedSourceMap: () => accumulatedSourceMap,
    setAccumulatedSourceMap: sourceMap => {
      accumulatedSourceMap = sourceMap
    },
  }
}
