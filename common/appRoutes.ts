/**
 * Top-level SPA route segments.
 *
 * Used by:
 *  - playground-www router (to detect app routes vs. base path)
 *  - buildPlaygroundSite (to generate stub pages and 404.html)
 *  - tests (to verify every route has a stub page or is explicitly excluded)
 *
 * Routes listed in `stub` MUST have a corresponding directory in docs/.
 * Routes listed in `dynamicOnly` are SPA-only (no stub page needed).
 */

/** Routes that get pre-rendered stub pages for SEO / crawlers. */
export const stubRoutes = ['about', 'tutorials', 'examples', 'core', 'modules', 'ref'] as const

/** Routes that are SPA-only (user-specific, no crawling needed). */
export const dynamicOnlyRoutes = ['saved', 'snapshots', 'settings'] as const

/** All top-level app route segments. */
export const allAppRoutes = [...stubRoutes, ...dynamicOnlyRoutes] as const
