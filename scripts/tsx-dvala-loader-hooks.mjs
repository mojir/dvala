// ESM loader hook so `import x from './path.dvala'` yields the file's source
// as a default-exported string. Mirrors the vite plugin in vite.config.mts.
// Needed by benchmarks/* under tsx, which can't otherwise handle .dvala
// imports pulled in transitively via @mojir/dvala-engine.

import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.dvala')) {
    const parentURL = context.parentURL ? new URL(context.parentURL) : pathToFileURL(process.cwd() + '/')
    const resolved = new URL(specifier, parentURL)
    return { url: resolved.href, format: 'module', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.dvala')) {
    const source = await readFile(fileURLToPath(url), 'utf-8')
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)}`,
    }
  }
  return nextLoad(url, context)
}
