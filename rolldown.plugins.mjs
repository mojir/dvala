/**
 * Shared Rolldown plugins used across all rolldown config files.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * Treats .dvala files as raw string exports.
 * Allows `import source from './foo.dvala'` to import the file contents as a string.
 */
export function dvalaSourcePlugin() {
  return {
    name: 'dvala-source',
    transform(code, id) {
      if (id.endsWith('.dvala')) {
        return { code: `export default ${JSON.stringify(code)}`, map: null }
      }
    },
  }
}

/**
 * Treats .md files as raw string exports.
 * Allows `import raw from './chapter.md'` to import the file contents as a string.
 */
export function markdownSourcePlugin() {
  return {
    name: 'markdown-source',
    transform(code, id) {
      if (id.endsWith('.md')) {
        return { code: `export default ${JSON.stringify(code)}`, map: null }
      }
    },
  }
}

/**
 * Production-only stubs for two import shapes that rolldown can't handle but
 * the playground bundle drags in via `monaco-editor`:
 *
 * 1. `*.css` — rolldown removed CSS bundling support. The prebuilt Monaco
 *    stylesheet is loaded via `<link>` in `playground-www/index.html`
 *    instead.
 * 2. `*?worker` — Vite-specific worker URL syntax. Production rolldown
 *    resolves it to a no-op worker stub; Monaco then logs a warning and
 *    runs without web workers (acceptable for v1 — Monaco's worker is
 *    used for rich features we haven't enabled yet, like JS/TS/JSON
 *    language services). Vite dev mode handles `?worker` natively.
 *
 * Each stub is loaded under a `.js`-suffixed virtual id so rolldown picks
 * the JS pipeline rather than trying to parse the original extension.
 *
 * **Caveat — the `*.css` match is intentionally broad.** Any CSS import
 * introduced anywhere in the playground bundle (not just from Monaco) is
 * silently swallowed in production with no warning, which can cause
 * missing-styles bugs that are hard to diagnose. If you add a new
 * component that does `import './foo.css'`, ship the stylesheet as a
 * separate static asset and `<link>` it from the production HTML
 * (see how `monaco-editor.css` is wired in `playground-builder/`).
 */
export function cssStubPlugin() {
  const CSS_PREFIX = '\0css-stub:'
  const WORKER_PREFIX = '\0worker-stub:'
  const WORKER_STUB =
    'class NoopWorker { constructor() {} terminate() {} postMessage() {} addEventListener() {} removeEventListener() {} dispatchEvent() { return false } }; export default NoopWorker;'
  return {
    name: 'css-stub',
    resolveId(id) {
      if (id.endsWith('.css')) {
        return { id: `${CSS_PREFIX}${id}.js`, external: false }
      }
      if (id.endsWith('?worker')) {
        return { id: `${WORKER_PREFIX}${id}.js`, external: false }
      }
    },
    load(id) {
      if (id.startsWith(CSS_PREFIX)) return 'export default {}'
      if (id.startsWith(WORKER_PREFIX)) return WORKER_STUB
    },
  }
}

/**
 * Provides a virtual module `virtual:book-chapters` that exports all book chapter .md files
 * as a sorted array of { path, content } objects, discovered at build time by scanning book/.
 * This avoids import.meta.glob (unsupported in iife output format) while still being dynamic —
 * dropping a .md file in book/ is enough for it to appear.
 *
 * `bookDir` defaults to `<cwd>/book` for the existing rolldown configs (which run from the
 * monorepo root). Vite's playground config runs from `playground-www/` and passes an
 * explicit absolute path so resolution doesn't depend on cwd.
 */
export function bookChaptersPlugin({ bookDir = path.resolve('book') } = {}) {
  const VIRTUAL_ID = 'virtual:book-chapters'
  const RESOLVED_ID = '\0virtual:book-chapters'

  return {
    name: 'book-chapters',
    resolveId(id) {
      if (id === VIRTUAL_ID)
        return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID)
        return

      const entries = []

      // Walk book/NN-section/NN-chapter.md, sorted by path for correct chapter order
      for (const dir of fs.readdirSync(bookDir).sort()) {
        const dirPath = path.join(bookDir, dir)
        if (!fs.statSync(dirPath).isDirectory())
          continue
        for (const file of fs.readdirSync(dirPath).sort()) {
          if (!file.endsWith('.md'))
            continue
          const content = fs.readFileSync(path.join(dirPath, file), 'utf8')
          // Use posix-style path as the key so it's consistent across platforms
          entries.push({ path: `${dir}/${file}`, content })
        }
      }

      // Emit as a JS module exporting a plain array — works in any output format
      return `export default ${JSON.stringify(entries)};`
    },
  }
}

/**
 * Rolldown plugin to strip `docs` fields from built-in expressions.
 * Used for the minimal bundle to reduce size.
 * Operates on the final JavaScript output via renderChunk.
 */
export function stripDocsPlugin() {
  return {
    name: 'strip-docs',
    renderChunk(code) {
      let result = code

      // Helper: find the end of a balanced brace block starting at `{`
      function findBalancedBraceEnd(str, start) {
        let depth = 0
        for (let i = start; i < str.length; i++) {
          if (str[i] === '{') {
            depth++
          }
          else if (str[i] === '}') {
            depth--
            if (depth === 0) {
              return i
            }
          }
        }
        return -1
      }

      // Helper: remove all occurrences of a pattern followed by a balanced `{ ... }` block
      function stripBalancedBlocks(str, pattern) {
        let result = str
        // eslint-disable-next-line no-cond-assign
        for (let match; (match = pattern.exec(result)) !== null;) {
          const braceStart = result.indexOf('{', match.index + match[0].length - 1)
          if (braceStart === -1) {
            break
          }
          const braceEnd = findBalancedBraceEnd(result, braceStart)
          if (braceEnd === -1) {
            break
          }
          result = result.slice(0, match.index) + result.slice(braceEnd + 1)
          pattern.lastIndex = 0 // reset since string changed
        }
        return result
      }

      // 1. Remove inline `docs: { ... }` property (with balanced braces)
      result = stripBalancedBlocks(result, /docs:\s*(?=\{)/g)

      // 2. Remove `docs: variableName` (variable reference, not inline object)
      result = result.replace(/docs:\s*[a-zA-Z_$][\w$]*/g, '')

      // 3. Remove standalone docs variable declarations: `var/const/let docsXxx = { ... };`
      result = stripBalancedBlocks(result, /(?:var|const|let)\s+\w*[Dd]ocs\w*\s*=\s*(?=\{)/g)
      // Clean up trailing semicolons left behind
      result = result.replace(/^\s*;\s*$/gm, '')

      // 4. Remove shorthand `docs` property in object literals (bare `docs` as object key)
      result = result.replace(/(?<=\W)docs\s*(?=[,}])/g, '')

      // 5. Clean up comma/whitespace artifacts from removals
      result = result.replace(/,(\s*),/g, ',$1') // double commas → single
      result = result.replace(/\{(\s*),/g, '{$1') // leading comma after {
      result = result.replace(/,(\s*),/g, ',$1') // second pass for triple commas

      if (result !== code)
        return { code: result, map: null }
      return null
    },
  }
}
