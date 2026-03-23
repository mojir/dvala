/**
 * Path-based router using the History API.
 *
 * Detects the base path at runtime so the same build works both locally
 * (served at /) and on GitHub Pages (served at /dvala/).
 */

import { allAppRoutes } from '../../common/appRoutes'

/** Known top-level app paths — anything else is treated as a sub-path of the base. */
const APP_ROOTS = allAppRoutes.map(r => `/${r}`)

function detectBasePath(): string {
  const p = location.pathname
  // Exact root path means no base
  if (p === '/')
    return ''
  // Check if path starts with a known app route (no base prefix)
  for (const root of APP_ROOTS) {
    if (p === root || p.startsWith(`${root}/`) || (root.endsWith('/') && p.startsWith(root)))
      return ''
  }
  // First path segment is the deployment base (e.g. /dvala)
  const firstSeg = p.split('/').filter(Boolean)[0]
  return firstSeg ? `/${firstSeg}` : ''
}

let basePath = ''
let routeHandler: ((appPath: string) => void) | null = null

/** Returns the app-relative path (strips base prefix). */
export function currentPath(): string {
  const p = location.pathname
  const stripped = basePath ? p.slice(basePath.length) || '/' : p
  return stripped || '/'
}

/** Returns a full URL path for the given app-relative path. */
export function href(appPath: string): string {
  return basePath + (appPath.startsWith('/') ? appPath : `/${appPath}`)
}

/** Navigate to an app-relative path, pushing a history entry. */
export function navigate(appPath: string, replace = false): void {
  const url = href(appPath)
  if (replace)
    history.replaceState(null, '', url)
  else
    history.pushState(null, '', url)
  routeHandler?.(appPath)
}

/** Initialize the router: detect base path, set up popstate, call handler for current path. */
export function init(handler: (appPath: string) => void): void {
  basePath = detectBasePath()
  routeHandler = handler
  window.addEventListener('popstate', () => {
    handler(currentPath())
  })
  handler(currentPath())
}
