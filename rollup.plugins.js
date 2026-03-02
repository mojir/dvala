/**
 * Shared Rollup plugins used across all rollup config files.
 */

/**
 * Treats .dvala files as raw string exports.
 * Allows `import source from './foo.dvala'` to import the file contents as a string.
 */
function dvalaSourcePlugin() {
  return {
    name: 'dvala-source',
    transform(code, id) {
      if (id.endsWith('.dvala')) {
        return { code: `export default ${JSON.stringify(code)}`, map: null }
      }
    },
  }
}

module.exports = { dvalaSourcePlugin }
