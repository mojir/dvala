import type { Reference } from '../reference'
import type { Example } from '../reference/examples'

export interface SearchEntry {
  title: string
  search: string // combined searchable string: title + category
  description: string // short first-line description (plain text, no HTML)
  category: string
  linkName: string // URL path segment, e.g. "map" or "math.sin"
}

export interface ModuleInfo {
  name: string
  description: string
}

export interface CoreCategoryInfo {
  name: string
  description: string
}

export interface ReferenceData {
  version: string
  api: Record<string, Reference> // core functions, special expressions, shorthands, datatypes
  modules: Record<string, Reference> // module functions, keyed by "module.fn"
  effects: Record<string, Reference> // effects
  moduleCategories: ModuleInfo[] // ordered list of modules with descriptions
  coreCategories: CoreCategoryInfo[] // ordered list of core categories with descriptions
  searchEntries: SearchEntry[]
  examples: Example[]
}
