import type { Reference } from '../../../reference'
import { apiReference, effectReference, getLinkName, moduleReference } from '../../../reference'
import { moduleCategories } from '../../../reference/api'
import { chevronRightIcon, homeIcon, labIcon, lampIcon, searchIcon } from '../icons'
import { styles } from '../styles'

function menuLink(icon: string, title: string, onclick: string) {
  return `
    <div onclick="${onclick}" ${styles('flex', 'mb-2', 'text-color-gray-400', 'text-base', 'cursor-pointer')}>
      <a ${styles('flex', 'items-center', 'gap-1')} class="link">
        <span ${styles('font-size: 1.2em;', 'flex', 'items-center')}>${icon}</span>
        <span>${title}</span>
      </a>
    </div>`
}

export function getSideBar() {
  // Group apiReference items by category for the new structure
  const specialExpressionRefs: Reference[] = []
  const coreFunctionRefs: Reference[] = []
  const shorthandRefs: Reference[] = []
  const datatypeRefs: Reference[] = []

  for (const obj of Object.values(apiReference)) {
    switch (obj.category) {
      case 'special-expression':
        specialExpressionRefs.push(obj)
        break
      case 'shorthand':
        shorthandRefs.push(obj)
        break
      case 'datatype':
        datatypeRefs.push(obj)
        break
      default:
        coreFunctionRefs.push(obj)
        break
    }
  }

  const effectRefs = Object.values(effectReference)

  // Group module references by module category
  const moduleCategoryCollections = Object.values(moduleReference).reduce((result: Record<string, Reference[]>, obj) => {
    result[obj.category] = result[obj.category] || []
    result[obj.category]!.push(obj)
    return result
  }, {})

  const sortRefs = (refs: Reference[]) => refs.sort((a, b) => {
    const aSpecial = a.title[0]!.match(/[^a-z]/i)
    const bSpecial = b.title[0]!.match(/[^a-z]/i)
    if (aSpecial && !bSpecial)
      return -1
    if (!aSpecial && bSpecial)
      return 1
    return (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
  })

  const renderRefLink = (obj: Reference) => {
    const linkName = getLinkName(obj)
    const name = `${escape(obj.title)}`
    return `<a id="${linkName}_link" ${styles('scroll-my-2', 'pl-2')} onclick="Playground.showPage('${linkName}', 'smooth')">${name}</a>`
  }

  const renderApiSection = (sectionId: string, label: string, refs: Reference[]) => {
    return `
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <div
          class="sidebar-collapsible-header"
          ${styles('flex', 'items-center', 'gap-1', 'cursor-pointer')}
          onclick="Playground.toggleApiSection('${sectionId}')"
        >
          <span id="api-chevron-${sectionId}" class="api-chevron">${chevronRightIcon}</span>
          <span>${label}</span>
        </div>
        <div 
          id="api-content-${sectionId}" 
          ${styles('flex-col', 'ml-2', 'text-color-gray-400', 'text-base', 'display: none;')}
        >
          ${sortRefs(refs).map(renderRefLink).join('\n')}
        </div>
      </div>`
  }

  const renderModuleCategory = (categoryKey: string) => {
    return `
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <div
          class="sidebar-collapsible-header"
          ${styles('flex', 'items-center', 'gap-1', 'cursor-pointer')}
          onclick="Playground.toggleModuleCategory('${categoryKey}')"
        >
          <span id="ns-chevron-${categoryKey}" class="ns-chevron">${chevronRightIcon}</span>
          <span>${categoryKey}</span>
        </div>
        <div 
          id="ns-content-${categoryKey.replace(/\s+/g, '-')}" 
          ${styles('flex-col', 'ml-2', 'text-color-gray-400', 'text-base', 'display: none;')}
        >
          ${
            moduleCategoryCollections[categoryKey]
              ? sortRefs(moduleCategoryCollections[categoryKey])
                  .map((obj) => {
                    const linkName = getLinkName(obj)
                    // Strip module prefix (e.g., "vector." from "vector.sum")
                    const stripPrefix = (n: string) => n.includes('.') ? n.split('.').slice(1).join('.') : n
                    const displayName = stripPrefix(obj.title)
                    const name = `${escape(displayName)}`
                    return `<a id="${linkName}_link" ${styles('scroll-my-2', 'pl-2')} onclick="Playground.showPage('${linkName}', 'smooth')">${name}</a>`
                  })
                  .join('\n')
              : ''
          }
        </div>
      </div>`
  }

  return `
  <nav id="sidebar" class="fancy-scroll-background">
    <div ${styles('py-1', 'px-2', 'text-color-gray-400', 'flex', 'items-center', 'justify-between', 'gap-2', 'mb-4', 'cursor-pointer', 'border-gray-300', 'border', 'border-solid')} onclick="Playground.Search.openSearch()">
      <span ${styles('flex', 'items-center', 'gap-1')}>
        ${searchIcon}
        <span>Search</span>
      </span>
      <span ${styles('text-sm')}>F3</span>
    </div>
    ${menuLink(homeIcon, 'Home', 'Playground.showPage(\'index\', \'smooth\')')}
    ${menuLink(lampIcon, 'Examples', 'Playground.showPage(\'example-page\', \'smooth\')')}
    ${menuLink(labIcon, 'Tutorials', 'Playground.showTutorialsPage()')}

    <!-- API Reference -->
    <div ${styles('flex', 'flex-col', 'gap-2', 'my-4')}>
      <div ${styles('text-color-gray-400', 'text-base', 'font-bold', 'mb-1')}>API Reference</div>
      <div ${styles('flex', 'flex-col', 'gap-2')}>
        ${renderApiSection('special-expressions', 'Special expressions', specialExpressionRefs)}
        ${renderApiSection('core-functions', 'Core functions', coreFunctionRefs)}
        ${renderApiSection('effects', 'Effects', effectRefs)}
        ${renderApiSection('shorthands', 'Shorthands', shorthandRefs)}
        ${renderApiSection('datatypes', 'Datatypes', datatypeRefs)}
        <!-- Modules (collapsible with sub-collapsibles) -->
        <div ${styles('flex', 'flex-col', 'gap-1')}>
          <div
            class="sidebar-collapsible-header"
            ${styles('flex', 'items-center', 'gap-1', 'cursor-pointer')}
            onclick="Playground.toggleApiSection('modules')"
          >
            <span id="api-chevron-modules" class="api-chevron">${chevronRightIcon}</span>
            <span>Modules</span>
          </div>
          <div
            id="api-content-modules"
            ${styles('flex-col', 'ml-2', 'gap-2', 'display: none;')}
          >
            ${moduleCategories.map(categoryKey => renderModuleCategory(categoryKey)).join('\n')}
          </div>
        </div>
      </div>
    </div>
  </nav>
  `
}

function escape(str: string) {
  str = str.replace(/>/g, '&gt;')
  str = str.replace(/</g, '&lt;')
  return str
}
