/**
 * Loads the standard prelude (`src/prelude.dvala`) — refined type
 * aliases that are always-on in every typecheck session, like core
 * builtins. The prelude source is tokenized + parsed once on first
 * use and cached; `installPreludeAliases` then re-registers the
 * extracted aliases via `registerTypeAlias` after each
 * `resetTypeAliases()` call so they survive the per-document reset.
 *
 * User aliases declared in source can shadow prelude aliases of the
 * same name — `registerTypeAlias` is a Map.set, so later registrations
 * win, and user aliases are registered after the prelude in
 * `typecheck.ts`.
 */

import type { AliasParam } from '../parser/types'
import { parseToAst } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { registerTypeAlias } from './parseType'
import preludeSource from '../prelude.dvala'

interface PreludeAlias {
  name: string
  params: AliasParam[]
  body: string
}

let cached: PreludeAlias[] | null = null

/**
 * Parse the prelude source on first call, register every type alias
 * it declares. Idempotent on the cache; the registration calls are
 * cheap Map.set operations.
 *
 * If parsing the prelude fails (shouldn't — it ships with the
 * codebase), the function silently leaves the registry alone rather
 * than crashing the entire typechecker. A broken prelude shouldn't
 * take down user typechecking.
 */
export function installPreludeAliases(): void {
  if (!cached) {
    try {
      const tokens = tokenize(preludeSource, false, '<prelude>')
      const min = minifyTokenStream(tokens, { removeWhiteSpace: true })
      const ast = parseToAst(min)
      cached = ast.typeAliases
        ? [...ast.typeAliases].map(([name, { params, body }]) => ({ name, params, body }))
        : []
    } catch {
      cached = []
    }
  }
  for (const alias of cached) {
    registerTypeAlias(alias.name, alias.params, alias.body)
  }
}
