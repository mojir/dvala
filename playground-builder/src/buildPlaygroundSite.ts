import path from 'node:path'
import fs from 'node:fs'
import { apiReference, effectReference, getLinkName, moduleReference } from '../../reference'
import { moduleCategories, coreCategories } from '../../reference/api'
import { examples } from '../../reference/examples'
import { tutorials } from '../../reference/tutorials'
import type { ReferenceData, SearchEntry } from '../../common/referenceData'
import { version } from '../../package.json'

const DOC_DIR = path.resolve(__dirname, '../../docs')
const BASE_URL = 'https://mojir.github.io/dvala'

setupDocDir()
copyAssets()
writeIndexPage()
write404Page()
writeSitemap()

// ---------------------------------------------------------------------------
// Reference data assembly
// ---------------------------------------------------------------------------

function buildReferenceData(): ReferenceData {
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
    moduleCategories: moduleCategories as string[],
    coreCategories: coreCategories as string[],
    searchEntries,
    examples,
  }
}

// ---------------------------------------------------------------------------
// Page writers
// ---------------------------------------------------------------------------

function writeIndexPage() {
  const data = buildReferenceData()
  const json = JSON.stringify(data)

  const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Dvala - Suspendable Functional Language for JavaScript</title>
    <script>
      // Set <base> so relative asset URLs (playground.js, styles.css) resolve correctly
      // even when the page is loaded at a sub-path like /settings/dvala.
      // For a local dev server (served at /), base is '/'.
      // For GitHub Pages (served at /dvala/), base is '/dvala/'.
      ;(function() {
        var APP_ROOTS = ['about','tutorials','examples','core','modules','ref','saved','snapshots','settings']
        var segs = location.pathname.split('/').filter(Boolean)
        var base = document.createElement('base')
        if (segs.length === 0 || APP_ROOTS.indexOf(segs[0]) !== -1) {
          base.href = '/'
        } else {
          base.href = '/' + segs[0] + '/'
        }
        document.head.appendChild(base)
      }())
    </script>
    <link rel="icon" type="image/png" sizes="32x32" href="favicon.png">
    <meta name="description" content="Dvala is a suspendable, time-traveling functional language for JavaScript with algebraic effects. Run anywhere, resume everywhere.">
    <meta name="author" content="Albert Mojir">
    <meta name="keywords" content="Dvala, functional programming, suspendable, resumable, algebraic effects, time-travel, JavaScript, interpreter">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://mojir.github.io/dvala/">
    <meta property="og:title" content="Dvala Playground">
    <meta property="og:description" content="A suspendable, time-traveling functional language for JavaScript with algebraic effects.">
    <meta property="og:image" content="https://mojir.github.io/dvala/images/dvala-logo.webp">
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="https://mojir.github.io/dvala/">
    <meta name="twitter:title" content="Dvala Playground">
    <meta name="twitter:description" content="A suspendable, time-traveling functional language for JavaScript with algebraic effects.">
    <meta name="twitter:image" content="https://mojir.github.io/dvala/images/dvala-logo.webp">
    <!-- Additional SEO -->
    <link rel="canonical" href="https://mojir.github.io/dvala/">
    <meta name="theme-color" content="#1a1a1a">
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Dvala",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any",
      "description": "A suspendable, time-traveling functional language for JavaScript with algebraic effects.",
      "url": "https://mojir.github.io/dvala/",
      "author": {
        "@type": "Person",
        "name": "Albert Mojir"
      },
      "license": "https://opensource.org/licenses/MIT",
      "isAccessibleForFree": true
    }
    </script>
    <link rel="preload" href="playground.js" as="script">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&display=swap"></noscript>
    <link rel="stylesheet" href="styles.css">
    <script>
      // GitHub Pages SPA routing: restore path from query param set by 404.html
      ;(function(l) {
        if (l.search[1] === '/') {
          var decoded = l.search.slice(1).replace(/~and~/g, '&')
          window.history.replaceState(null, null,
            l.pathname.slice(0, -1) + decoded + (decoded.slice(-1) === '?' ? '' : l.hash))
        }
      }(window.location))
    </script>
    <script>window.referenceData = ${json}</script>
  </head>
  <body>
    <div id="wrapper" style="display:none;"></div>
    <script src="playground.js"></script>
  </body>
</html>
`
  fs.writeFileSync(path.join(DOC_DIR, 'index.html'), page, { encoding: 'utf-8' })
}

function write404Page() {
  const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Dvala Playground</title>
    <script>
      // GitHub Pages SPA routing: encode the path as a query param and redirect to index.html
      // pathSegmentsToKeep=1 keeps the /dvala/ repo prefix on GitHub Pages
      var appRoutes = ['about','tutorials','examples','core','modules','ref','saved','snapshots','settings']
      var firstSeg = window.location.pathname.split('/').filter(Boolean)[0]
      var pathSegmentsToKeep = (firstSeg && appRoutes.indexOf(firstSeg) !== -1) ? 0 : 1
      var l = window.location
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.split('/').slice(1 + pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      )
    </script>
  </head>
  <body></body>
</html>
`
  fs.writeFileSync(path.join(DOC_DIR, '404.html'), page, { encoding: 'utf-8' })
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function setupDocDir() {
  fs.rmSync(DOC_DIR, { recursive: true, force: true })
  fs.mkdirSync(DOC_DIR)
}

function copyAssets() {
  fs.cpSync(path.join(__dirname, '../../playground-www/public/'), path.join(DOC_DIR), { recursive: true })
  const jsFile = path.join(__dirname, '../../playground-www/build/playground.js')
  const mapFile = path.join(__dirname, '../../playground-www/build/playground.js.map')
  let jsContent = fs.readFileSync(jsFile, 'utf8')
  if (fs.existsSync(mapFile)) {
    const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
    const buildDir = path.resolve(__dirname, '../../playground-www/build')
    const docsDir = path.resolve(__dirname, '../../docs')
    map.sources = map.sources.map((source: string) => {
      const abs = path.resolve(buildDir, source)
      return path.relative(docsDir, abs)
    })
    fs.writeFileSync(path.join(DOC_DIR, 'playground.js.map'), JSON.stringify(map))
    // Add sourcemap reference if not present
    if (!jsContent.includes('//# sourceMappingURL=')) {
      jsContent += '\n//# sourceMappingURL=playground.js.map\n'
    }
  }
  fs.writeFileSync(path.join(DOC_DIR, 'playground.js'), jsContent)
}

function writeSitemap() {
  const today = new Date().toISOString().split('T')[0]

  // Static pages
  const staticPages = [
    '/',
    '/about',
    '/tutorials',
    '/examples',
    '/core',
    '/modules',
  ]

  // Tutorial pages
  const tutorialPages = tutorials.map(t => `/tutorials/${t.id}`)

  // Reference pages (API, modules, effects)
  const refPages = [
    ...Object.values(apiReference).map(ref => `/ref/${getLinkName(ref)}`),
    ...Object.values(moduleReference).map(ref => `/ref/${getLinkName(ref)}`),
    ...Object.values(effectReference).map(ref => `/ref/${getLinkName(ref)}`),
  ]

  const allPages = [...staticPages, ...tutorialPages, ...refPages]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${BASE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(DOC_DIR, 'sitemap.xml'), sitemap, { encoding: 'utf-8' })
}
