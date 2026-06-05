import { readFileSync } from 'node:fs'
import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-common's public entry points into self-contained dist
// files. All workspace deps stay external; consumers resolve them via their own
// node_modules.
//
// `__DVALA_VERSION__` is replaced at build time with the monorepo version (read
// from the root package.json). buildReferenceData surfaces it in the playground
// reference data. Using a define instead of importing the root package.json
// avoids a cross-package, rootDir-violating import.
const rootVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version

const externalDeps = [/^@mojir\//, /^node:/]

const entry = (name) => ({
  input: `./src/${name}.ts`,
  external: externalDeps,
  transform: { define: { __DVALA_VERSION__: JSON.stringify(rootVersion) } },
  output: { file: `./dist/${name}.js`, format: 'esm', sourcemap: true },
})

export default defineConfig([
  entry('utils'),
  entry('appRoutes'),
  entry('referenceData'),
  entry('buildReferenceData'),
])
