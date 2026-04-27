import path from 'node:path'
import fs from 'node:fs'
import {
  apiReference,
  effectReference,
  getLinkName,
  isFunctionReference,
  isCustomReference,
  isEffectReference,
  moduleReference,
} from '../../reference'
import type { Reference } from '../../reference'
import { coreCategoryDescriptions, coreCategories } from '../../reference/api'
import { allBuiltinModules } from '../../src/allModules'
import { examples } from '../../reference/examples'
import { isBookSection, chapters, bookItems } from '../../reference/book'
import { allAppRoutes } from '../../common/appRoutes'
import type { ReferenceData, SearchEntry } from '../../common/referenceData'
import { version } from '../../package.json'

const DOC_DIR = path.resolve(__dirname, '../../docs')
const BASE_URL = 'https://mojir.github.io/dvala'

// All references lookup (for seeAlso links in stub pages)
const allRefs: Record<string, Reference> = {
  ...apiReference,
  ...moduleReference,
}
for (const [key, ref] of Object.entries(effectReference)) {
  allRefs[key] = ref
  allRefs[ref.title] = ref
}

setupDocDir()
copyAssets()
writeIndexPage()
write404Page()
writeStubPages()
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
    moduleCategories: allBuiltinModules.map(m => ({ name: m.name, description: m.description })),
    coreCategories: coreCategories.map(name => ({ name, description: coreCategoryDescriptions[name] ?? '' })),
    searchEntries,
    examples,
  }
}

// ---------------------------------------------------------------------------
// Minimal markdown → HTML (for chapter bodies in stub pages)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inCode = false
  let inParagraph = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inParagraph) {
        out.push('</p>')
        inParagraph = false
      }
      if (inCode) {
        out.push('</code></pre>')
        inCode = false
      } else {
        out.push('<pre><code>')
        inCode = true
      }
      continue
    }
    if (inCode) {
      out.push(escapeHtml(line))
      continue
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line)
    if (headingMatch) {
      if (inParagraph) {
        out.push('</p>')
        inParagraph = false
      }
      const level = headingMatch[1]!.length
      out.push(`<h${level}>${escapeHtml(headingMatch[2]!)}</h${level}>`)
      continue
    }

    // Empty line — close paragraph
    if (line.trim() === '') {
      if (inParagraph) {
        out.push('</p>')
        inParagraph = false
      }
      continue
    }

    // Text line — open paragraph if needed
    if (!inParagraph) {
      out.push('<p>')
      inParagraph = true
    }
    // Inline formatting
    let html = escapeHtml(line)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    out.push(html)
  }
  if (inParagraph) out.push('</p>')
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Stub page helpers
// ---------------------------------------------------------------------------

function shortDescription(description: string): string {
  const match = /(.*?) {2}\n|\n\n|$/.exec(description)
  return (match?.[1] ?? description)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .slice(0, 200)
}

function stubPage(opts: { route: string; title: string; description: string; body: string; nav?: string }): string {
  const canonicalUrl = `${BASE_URL}${opts.route}`
  const desc = escapeHtml(opts.description.slice(0, 160))
  const navHtml = opts.nav ?? defaultNav()
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(opts.title)} - Dvala</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:title" content="${escapeHtml(opts.title)} - Dvala">
    <meta property="og:description" content="${desc}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${BASE_URL}/images/dvala-logo.webp">
    <script>
      // Redirect JS-enabled clients (human users) to the interactive SPA.
      // JS-disabled crawlers fall through and see the static content below.
      ;(function() {
        var appRoutes = ${JSON.stringify([...allAppRoutes])}
        var l = window.location
        var firstSeg = l.pathname.split('/').filter(Boolean)[0]
        var keep = (firstSeg && appRoutes.indexOf(firstSeg) !== -1) ? 0 : 1
        l.replace(
          l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
          l.pathname.split('/').slice(0, 1 + keep).join('/') + '/?/' +
          l.pathname.split('/').slice(1 + keep).join('/').replace(/&/g, '~and~') +
          (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
          l.hash
        )
      }())
    </script>
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:1rem;color:#e0e0e0;background:#1a1a1a}a{color:#6cb6ff}pre{background:#2d2d2d;padding:1rem;overflow-x:auto;border-radius:4px}code{font-family:monospace}nav{margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid #333}nav a{margin-right:1rem}h1,h2,h3{color:#fff}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:0.5rem;border-bottom:1px solid #333}</style>
  </head>
  <body>
    ${navHtml}
    <main>
      ${opts.body}
    </main>
    <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #333;font-size:0.85rem">
      <p><a href="${BASE_URL}/">Dvala Playground</a> &mdash; a suspendable, time-traveling functional language for JavaScript with algebraic effects.</p>
    </footer>
  </body>
</html>
`
}

function defaultNav(): string {
  return `<nav>
      <a href="${BASE_URL}/">Home</a>
      <a href="${BASE_URL}/about/">About</a>
      <a href="${BASE_URL}/book/">The Book</a>
      <a href="${BASE_URL}/examples/">Examples</a>
      <a href="${BASE_URL}/core/">Core API</a>
      <a href="${BASE_URL}/modules/">Modules</a>
    </nav>`
}

function writeStubFile(route: string, content: string) {
  const dir = path.join(DOC_DIR, route)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), content, { encoding: 'utf-8' })
}

// ---------------------------------------------------------------------------
// Reference rendering helpers
// ---------------------------------------------------------------------------

function renderRefBody(ref: Reference): string {
  const parts: string[] = []
  parts.push(`<h1>${escapeHtml(ref.title)}</h1>`)
  parts.push(`<p><strong>Category:</strong> ${escapeHtml(ref.category)}</p>`)
  parts.push(`<div>${markdownToHtml(ref.description)}</div>`)

  if (isFunctionReference(ref) || isEffectReference(ref)) {
    // Args
    const argEntries = Object.entries(ref.args)
    if (argEntries.length > 0) {
      parts.push('<h2>Arguments</h2><table><tr><th>Name</th><th>Type</th><th>Description</th></tr>')
      for (const [name, arg] of argEntries) {
        const type = Array.isArray(arg.type) ? arg.type.join(' | ') : arg.type
        parts.push(
          `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(type)}</td><td>${escapeHtml(arg.description ?? '')}</td></tr>`,
        )
      }
      parts.push('</table>')
    }

    // Returns
    const retType = Array.isArray(ref.returns.type) ? ref.returns.type.join(' | ') : ref.returns.type
    parts.push(`<p><strong>Returns:</strong> ${escapeHtml(retType)}</p>`)

    // Variants
    if (ref.variants.length > 0) {
      parts.push('<h2>Usage</h2>')
      for (const v of ref.variants) {
        parts.push(`<p><code>${escapeHtml(ref.title)}(${v.argumentNames.join(', ')})</code></p>`)
      }
    }
  }

  if (isCustomReference(ref)) {
    if (ref.customVariants.length > 0) {
      parts.push('<h2>Syntax</h2>')
      for (const v of ref.customVariants) {
        parts.push(`<p><code>${escapeHtml(v)}</code></p>`)
      }
    }
    if (ref.details) {
      parts.push('<h2>Details</h2><table><tr><th>Form</th><th>Description</th></tr>')
      for (const [form, desc] of ref.details) {
        parts.push(`<tr><td><code>${escapeHtml(form)}</code></td><td>${escapeHtml(desc)}</td></tr>`)
      }
      parts.push('</table>')
    }
  }

  // Examples
  if (ref.examples.length > 0) {
    parts.push('<h2>Examples</h2>')
    for (const ex of ref.examples) {
      const code = typeof ex === 'string' ? ex : ex.code
      parts.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
    }
  }

  // See also
  if (ref.seeAlso && ref.seeAlso.length > 0) {
    const links = ref.seeAlso.map(name => {
      const target = allRefs[name]
      if (target) {
        return `<a href="${BASE_URL}/ref/${getLinkName(target)}/">${escapeHtml(name)}</a>`
      }
      return escapeHtml(name)
    })
    parts.push(`<p><strong>See also:</strong> ${links.join(', ')}</p>`)
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Stub page generation
// ---------------------------------------------------------------------------

function writeStubPages() {
  // --- Book index ---
  const bookListHtml = bookItems
    .map(item => {
      if (isBookSection(item)) {
        const entries = item.entries
          .map(e => `<li><a href="${BASE_URL}/book/${e.id}/">${escapeHtml(e.title)}</a></li>`)
          .join('\n')
        return `<h3>${escapeHtml(item.title)}</h3>\n<ul>${entries}</ul>`
      }
      return `<ul><li><a href="${BASE_URL}/book/${item.id}/">${escapeHtml(item.title)}</a></li></ul>`
    })
    .join('\n')

  writeStubFile(
    'book',
    stubPage({
      route: '/book/',
      title: 'The Book',
      description: 'Learn Dvala step by step — from basics to advanced topics like algebraic effects and concurrency.',
      body: `<h1>The Dvala Book</h1>\n<p>Step-by-step guide to learning Dvala.</p>\n${bookListHtml}`,
    }),
  )

  // --- Individual chapter pages ---
  for (const chapter of chapters) {
    const bodyHtml = markdownToHtml(chapter.body)
    writeStubFile(
      `book/${chapter.id}`,
      stubPage({
        route: `/book/${chapter.id}/`,
        title: chapter.title,
        description: `Dvala book chapter: ${chapter.title}`,
        body: `<h1>${escapeHtml(chapter.title)}</h1>\n${bodyHtml}`,
      }),
    )
  }

  // --- Examples index ---
  const exampleListHtml = examples
    .map(ex => `<li><strong>${escapeHtml(ex.name)}</strong> &mdash; ${escapeHtml(ex.description)}</li>`)
    .join('\n')

  writeStubFile(
    'examples',
    stubPage({
      route: '/examples/',
      title: 'Examples',
      description: 'Example programs written in Dvala — from simple arithmetic to games and matrix math.',
      body: `<h1>Dvala Examples</h1>\n<p>Example programs showcasing Dvala features.</p>\n<ul>${exampleListHtml}</ul>`,
    }),
  )

  // --- Core API index ---
  const coreByCategory: Record<string, { title: string; linkName: string; description: string }[]> = {}
  for (const ref of Object.values(apiReference)) {
    const cat = ref.category
    if (!coreByCategory[cat]) coreByCategory[cat] = []
    coreByCategory[cat].push({
      title: ref.title,
      linkName: getLinkName(ref),
      description: shortDescription(ref.description),
    })
  }
  const coreSections = coreCategories
    .map(cat => {
      const items = coreByCategory[cat]
      if (!items) return ''
      const listItems = items
        .map(
          i =>
            `<li><a href="${BASE_URL}/ref/${i.linkName}/">${escapeHtml(i.title)}</a> &mdash; ${escapeHtml(i.description)}</li>`,
        )
        .join('\n')
      return `<h3>${escapeHtml(cat)}</h3>\n<ul>${listItems}</ul>`
    })
    .join('\n')

  writeStubFile(
    'core',
    stubPage({
      route: '/core/',
      title: 'Core API',
      description: 'Dvala core built-in functions — math, string, collection, array, and more.',
      body: `<h1>Core API Reference</h1>\n<p>Built-in functions and special expressions available in every Dvala program.</p>\n${coreSections}`,
    }),
  )

  // --- Modules index ---
  const modulesByCategory: Record<string, { title: string; linkName: string; description: string }[]> = {}
  for (const ref of Object.values(moduleReference)) {
    const cat = ref.category
    if (!modulesByCategory[cat]) modulesByCategory[cat] = []
    modulesByCategory[cat].push({
      title: ref.title,
      linkName: getLinkName(ref),
      description: shortDescription(ref.description),
    })
  }
  const moduleSections = allBuiltinModules
    .map(m => m.name)
    .map(cat => {
      const items = modulesByCategory[cat]
      if (!items) return ''
      const listItems = items
        .map(
          i =>
            `<li><a href="${BASE_URL}/ref/${i.linkName}/">${escapeHtml(i.title)}</a> &mdash; ${escapeHtml(i.description)}</li>`,
        )
        .join('\n')
      return `<h3>${escapeHtml(cat)}</h3>\n<ul>${listItems}</ul>`
    })
    .join('\n')

  writeStubFile(
    'modules',
    stubPage({
      route: '/modules/',
      title: 'Modules',
      description: 'Dvala module library — grid, vector, linear algebra, number theory, and more.',
      body: `<h1>Module Reference</h1>\n<p>Optional modules that extend Dvala with additional functionality.</p>\n${moduleSections}`,
    }),
  )

  // --- Ref index (lists all references for crawler discovery) ---
  const allRefEntries = [
    ...Object.values(apiReference),
    ...Object.values(moduleReference),
    ...Object.values(effectReference),
  ]
  const refListHtml = allRefEntries
    .map(ref => {
      const linkName = getLinkName(ref)
      return `<li><a href="${BASE_URL}/ref/${linkName}/">${escapeHtml(ref.title)}</a> (${escapeHtml(ref.category)})</li>`
    })
    .join('\n')
  writeStubFile(
    'ref',
    stubPage({
      route: '/ref/',
      title: 'All References',
      description: 'Complete Dvala reference — all functions, modules, effects, and datatypes.',
      body: `<h1>All References</h1>\n<p>Complete index of all Dvala functions, modules, effects, and datatypes.</p>\n<ul>${refListHtml}</ul>`,
    }),
  )

  // --- Individual reference pages (API, modules, effects) ---
  for (const ref of allRefEntries) {
    const linkName = getLinkName(ref)
    const desc = shortDescription(ref.description)
    writeStubFile(
      `ref/${linkName}`,
      stubPage({
        route: `/ref/${linkName}/`,
        title: ref.title,
        description: `${ref.title} — ${desc}`,
        body: renderRefBody(ref),
      }),
    )
  }

  // eslint-disable-next-line no-console
  console.log(`Generated ${7 + chapters.length + allRefEntries.length} stub pages`)
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
        var APP_ROOTS = ${JSON.stringify([...allAppRoutes])}
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
    <meta name="google-site-verification" content="TB5G9QHF-Tl5gJeF1OJ1nk25ReJwGkTRN9pjjKFaSdE">
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
      // GitHub Pages SPA routing: restore path from query param set by 404.html.
      // 404.html encodes the path as: /?/<path>&<search> where the first '&' separates
      // the encoded path segment from the original query params (which had '&' → '~and~').
      ;(function(l) {
        if (l.search[1] === '/') {
          var decoded = l.search.slice(1).replace(/~and~/g, '&')
          var sep = decoded.indexOf('&')
          var appPath = sep >= 0 ? decoded.slice(0, sep) : decoded
          var appSearch = sep >= 0 ? '?' + decoded.slice(sep + 1) : ''
          window.history.replaceState(null, null,
            l.pathname.slice(0, -1) + appPath + appSearch + l.hash)
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
    <meta name="robots" content="noindex">
    <title>Dvala Playground</title>
    <script>
      // GitHub Pages SPA routing: encode the path as a query param and redirect to index.html
      // pathSegmentsToKeep=1 keeps the /dvala/ repo prefix on GitHub Pages
      var appRoutes = ${JSON.stringify([...allAppRoutes])}
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
  const staticPages = ['/', '/book/', '/examples/', '/ref/']

  // Chapter pages
  const chapterPages = chapters.map(t => `/book/${t.id}/`)

  // Reference pages (API, modules, effects)
  const refPages = [
    ...Object.values(apiReference).map(ref => `/ref/${getLinkName(ref)}/`),
    ...Object.values(moduleReference).map(ref => `/ref/${getLinkName(ref)}/`),
    ...Object.values(effectReference).map(ref => `/ref/${getLinkName(ref)}/`),
  ]

  const allPages = [...staticPages, ...chapterPages, ...refPages]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    page => `  <url>
    <loc>${BASE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(DOC_DIR, 'sitemap.xml'), sitemap, { encoding: 'utf-8' })
}
