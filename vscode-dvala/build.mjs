import * as esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Version sync is now handled by `pnpm -r version` in release.yml — the
// extension's package.json is bumped in lockstep with the root via the
// workspace, so no runtime sync is needed here. Read the version once
// for the .vsix filename.
const extPkg = JSON.parse(readFileSync('vscode-dvala/package.json', 'utf-8'))

const sharedOptions = {
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node18',
  loader: { '.dvala': 'text' },
  logLevel: 'info',
}

await Promise.all([
  esbuild.build({
    ...sharedOptions,
    entryPoints: ['vscode-dvala/src/extension.ts'],
    outfile: 'vscode-dvala/out/extension.js',
  }),
  esbuild.build({
    ...sharedOptions,
    entryPoints: ['vscode-dvala/src/debugAdapter.ts'],
    outfile: 'vscode-dvala/out/debugAdapter.js',
  }),
])

execSync(`../node_modules/.bin/vsce package --no-dependencies --out out/dvala-${extPkg.version}.vsix`, {
  cwd: 'vscode-dvala',
  stdio: 'inherit',
})

console.log(`\nTo install: code --install-extension vscode-dvala/out/dvala-${extPkg.version}.vsix`)
