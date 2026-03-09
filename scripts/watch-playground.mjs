import { watch, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'playground-www/build/playground.js')
const dest = join(root, 'docs/playground.js')

console.log('Watching playground-www/build/ for changes...')

watch(join(root, 'playground-www/build'), (_event, filename) => {
  if (filename === 'playground.js') {
    try {
      copyFileSync(src, dest)
      console.log(`[${new Date().toLocaleTimeString()}] Copied playground.js → docs/`)
    } catch {
      // File may not exist yet during first build
    }
  }
})
