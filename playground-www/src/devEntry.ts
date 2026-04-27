/**
 * Vite dev-mode entry. Production uses `playground.ts` directly, bundled
 * into an IIFE that exposes a global named `Playground` (see
 * [rolldown.config.playground-www.mjs](../../rolldown.config.playground-www.mjs)).
 *
 * In dev mode the bundle is replaced by native ESM, so two prod-only
 * bits need to be reproduced explicitly here:
 *
 * 1. `window.referenceData` — the production `index.html` injects this
 *    inline before `playground.js` loads (see
 *    [playground-builder/src/buildPlaygroundSite.ts](../../playground-builder/src/buildPlaygroundSite.ts)
 *    `writeIndexPage`). Reference data is built at module load and
 *    assigned synchronously so it's available to all imported modules
 *    on first use.
 *
 * 2. `window.Playground` — the IIFE bundle attaches the playground's
 *    exports to a global of this name; inline `onclick="Playground.foo()"`
 *    handlers in the rendered HTML rely on it. Re-export the same
 *    surface here so those handlers keep working.
 */

import { buildReferenceData } from '../../common/buildReferenceData'
import * as Playground from './playground'

declare global {
  interface Window {
    Playground?: typeof Playground
  }
}

window.referenceData = buildReferenceData()
window.Playground = Playground
