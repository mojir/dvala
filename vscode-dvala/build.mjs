import * as esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const extPkgPath = 'vscode-dvala/package.json'
const extPkg = JSON.parse(readFileSync(extPkgPath, 'utf-8'))

if (extPkg.version !== rootPkg.version) {
  extPkg.version = rootPkg.version
  writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n')
  console.log(`Updated extension version to ${rootPkg.version}`)
}

await esbuild.build({
  entryPoints: ['vscode-dvala/src/extension.ts'],
  bundle: true,
  outfile: 'vscode-dvala/out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node18',
  loader: { '.dvala': 'text' },
  logLevel: 'info',
})

execSync(`../node_modules/.bin/vsce package --no-dependencies --out out/dvala-${rootPkg.version}.vsix`, {
  cwd: 'vscode-dvala',
  stdio: 'inherit',
})

console.log(`\nTo install: code --install-extension vscode-dvala/out/dvala-${rootPkg.version}.vsix`)
