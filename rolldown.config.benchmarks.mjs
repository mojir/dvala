import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from './rolldown.plugins.mjs'

// Bench scripts need `.dvala` stdlib inlined (engine's core math/sequence/etc.
// modules are written in Dvala). tsx can't intercept `.dvala` ESM imports — its
// own TS loader fires first and yields an empty default — so we bundle the
// bench into a self-contained CJS file and run it with plain `node`.
export default defineConfig([
  {
    input: 'benchmarks/pipeline-baseline.ts',
    external: ['node:fs', 'node:path', 'node:os', 'node:child_process', 'node:perf_hooks', 'node:crypto'],
    output: [{ file: 'benchmarks/build/pipeline-baseline.cjs', format: 'cjs', sourcemap: true }],
    plugins: [dvalaSourcePlugin()],
  },
  {
    input: 'benchmarks/pds-baseline.ts',
    external: ['node:fs', 'node:perf_hooks'],
    output: [{ file: 'benchmarks/build/pds-baseline.cjs', format: 'cjs', sourcemap: true }],
    plugins: [dvalaSourcePlugin()],
  },
])
