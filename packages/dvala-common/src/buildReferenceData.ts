/**
 * Build the runtime `ReferenceData` payload that the playground reads from
 * `window.referenceData`. Shared between the playground-builder (which
 * embeds this in the production `index.html`) and the Vite dev entry
 * (which assigns it to `window.referenceData` before the playground's
 * own scripts run).
 *
 * Pure: no filesystem access. Inputs are the static reference catalogs
 * imported from `reference/`.
 */

import { apiReference, effectReference, getLinkName, moduleReference } from '@mojir/dvala-core-tooling/reference'
import { coreCategoryDescriptions, coreCategories } from '@mojir/dvala-core-tooling/reference/api'
import { examples } from '@mojir/dvala-core-tooling/reference/examples'
import { allBuiltinModules } from '@mojir/dvala-core-tooling'
// The monorepo version shown in the playground. Reading the workspace-root
// manifest (a .json data import, exempt from tsgo's rootDir check) mirrors how
// the CLI sources it — simpler than threading a build-time define through every
// bundler that compiles this file.
import { version } from '../../../package.json'
import type { ReferenceData, SearchEntry } from './referenceData'

export function buildReferenceData(): ReferenceData {
  const shortDescRegExp = /(.*?) {2}\n|\n\n|$/

  const searchEntries: SearchEntry[] = Object.values({
    ...apiReference,
    ...moduleReference,
    ...effectReference,
  }).map(ref => {
    const match = shortDescRegExp.exec(ref.description)
    const description = (match?.[1] ?? ref.description)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
    return {
      title: ref.title,
      search: `${ref.title} ${ref.category}`,
      description,
      category: ref.category,
      linkName: getLinkName(ref),
    } satisfies SearchEntry
  })

  return {
    version,
    api: apiReference,
    modules: moduleReference,
    effects: effectReference,
    moduleCategories: allBuiltinModules.map(m => ({ name: m.name, description: m.description })),
    coreCategories: coreCategories.map(name => ({ name, description: coreCategoryDescriptions[name] ?? '' })),
    searchEntries,
    examples,
  }
}
