/**
 * Public entry point for the language-service module.
 *
 * Browser-safe: this module and everything it re-exports is free of
 * `node:fs` so it can be imported by the playground's Web Worker bundle.
 * Node-only filesystem helpers live in `nodeWorkspaceIndexer.ts` and are
 * imported separately by CLI surfaces.
 */

export { WorkspaceIndex } from './WorkspaceIndex'
export type { SymbolDef } from './types'
