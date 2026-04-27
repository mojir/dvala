/**
 * Vite dev-mode config for the playground.
 *
 * Production builds still go through rolldown
 * ([rolldown.config.playground-www.mjs](../rolldown.config.playground-www.mjs))
 * and the static-site generator
 * ([playground-builder/src/buildPlaygroundSite.ts](../playground-builder/src/buildPlaygroundSite.ts)).
 * Vite is *only* used for `pnpm run dev` so we get HMR, fast iteration,
 * and stack traces that resolve to source instead of bundled output.
 *
 * The three rolldown plugins are reused as-is — Vite consumes Rollup-shape
 * plugins natively (`name`/`transform`/`resolveId`/`load` hooks are
 * compatible). `stripDocsPlugin` is *not* reused: it's a renderChunk
 * minification pass that only matters for the production minimal bundle.
 *
 * The dev server is bound to port 22230 to match the existing
 * `npx serve docs -p 22230` workflow — bookmarks, browser autocomplete,
 * and any external tooling continue to work unchanged.
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import { bookChaptersPlugin, dvalaSourcePlugin, markdownSourcePlugin } from '../rolldown.plugins.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

export default defineConfig({
  // playground-www/ is the project root in dev mode. index.html is the entry,
  // public/ is served at the URL root.
  root: here,
  publicDir: path.join(here, 'public'),
  server: {
    port: 22230,
    strictPort: true,
    open: false,
    fs: {
      // The playground imports across the monorepo (../src, ../reference,
      // ../common, ../book, ../package.json). Allow Vite to read from the
      // repo root.
      allow: [repoRoot],
    },
  },
  plugins: [dvalaSourcePlugin(), markdownSourcePlugin(), bookChaptersPlugin({ bookDir: path.join(repoRoot, 'book') })],
})
