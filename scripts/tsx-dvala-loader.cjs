// CommonJS hook for `require('./path.dvala')` — wraps the file as
// `module.exports = { default: <source> }` so default-import sees the source
// string. Used by benchmarks/* under tsx (which routes through CJS for
// require() chains), needed because tsx applies its TS transformer to
// .dvala files and chokes on the Dvala syntax.

const fs = require('node:fs')
const Module = require('node:module')

const originalDvalaHandler = Module._extensions['.dvala']

Module._extensions['.dvala'] = function dvalaHandler(module, filename) {
  if (originalDvalaHandler) {
    try {
      return originalDvalaHandler(module, filename)
    } catch {
      // fall through to our handler
    }
  }
  const source = fs.readFileSync(filename, 'utf-8')
  module.exports = { default: source }
}
