import type { Reference } from '../reference'
import type { Example } from '../reference/examples'

export interface SearchEntry {
  title: string
  search: string       // combined searchable string: title + category
  description: string  // short first-line description (plain text, no HTML)
  category: string
  linkName: string     // URL path segment, e.g. "map" or "math.sin"
}

export interface ReferenceData {
  version: string
  api: Record<string, Reference>      // core functions, special expressions, shorthands, datatypes
  modules: Record<string, Reference>  // module functions, keyed by "module.fn"
  effects: Record<string, Reference>  // effects
  moduleCategories: string[]          // ordered list of module category names
  coreCategories: string[]            // ordered list of core category names
  searchEntries: SearchEntry[]
  examples: Example[]
}
