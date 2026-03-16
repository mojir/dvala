import path from 'node:path'
import fs from 'node:fs'
import { apiReference, effectReference, getLinkName, moduleReference } from '../../reference'
import { moduleCategories, coreCategories } from '../../reference/api'
import { examples } from '../../reference/examples'
import type { ReferenceData, SearchEntry } from '../../common/referenceData'
import { version } from '../../package.json'

const DOC_DIR = path.resolve(__dirname, '../../docs')

setupDocDir()
copyAssets()
writeIndexPage()
write404Page()

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
    <title>Dvala Playground</title>
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
    <meta name="description" content="A reference and a playground for Dvala">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <link rel="preload" href="playground.js" as="script">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&display=swap">
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
  fs.copyFileSync(path.join(__dirname, '../../playground-www/build/playground.js'), path.join(DOC_DIR, 'playground.js'))
  const mapFile = path.join(__dirname, '../../playground-www/build/playground.js.map')
  if (fs.existsSync(mapFile)) {
    const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
    const buildDir = path.resolve(__dirname, '../../playground-www/build')
    const docsDir = path.resolve(__dirname, '../../docs')
    map.sources = map.sources.map((source: string) => {
      const abs = path.resolve(buildDir, source)
      return path.relative(docsDir, abs)
    })
    fs.writeFileSync(path.join(DOC_DIR, 'playground.js.map'), JSON.stringify(map))
  }
}
