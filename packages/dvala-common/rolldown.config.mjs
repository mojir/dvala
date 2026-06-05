import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-common's public entry points into self-contained dist
// files. All workspace deps stay external; consumers resolve them via their own
// node_modules. buildReferenceData reads the monorepo version straight from the
// root package.json (a .json data import that rolldown inlines).
const externalDeps = [/^@mojir\//, /^node:/]

const entry = (name) => ({
  input: `./src/${name}.ts`,
  external: externalDeps,
  output: { file: `./dist/${name}.js`, format: 'esm', sourcemap: true },
})

export default defineConfig([
  entry('index'),
  entry('utils'),
  entry('appRoutes'),
  entry('referenceData'),
  entry('buildReferenceData'),
])
