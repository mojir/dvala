/**
 * Shared Rolldown plugins used across all rolldown config files.
 */

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
 * Allows `import raw from './tutorial.md'` to import the file contents as a string.
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
