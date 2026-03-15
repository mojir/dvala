# Playground Rewrite Plan

## KPI Baseline (pre-rewrite)

Measured on 2026-03-15. Run `npx playwright test e2e/kpi.spec.ts` to reproduce.
Build time measured with `npm run build-playground`.

File sizes and DOM node count are deterministic. Timing metrics averaged over 5 runs (individual runs shown).

| Metric                        | Run 1  | Run 2  | Run 3  | Run 4  | Run 5  | Avg / Fixed  | Target (after)  |
|-------------------------------|--------|--------|--------|--------|--------|--------------|-----------------|
| `index.html` size             | —      | —      | —      | —      | —      | 21,035.9 KB  | ~2,000 KB  ↓90% |
| `playground.js` size          | —      | —      | —      | —      | —      | 1,221.8 KB   | ~1,500 KB  ↑20% |
| `styles.css` size             | —      | —      | —      | —      | —      | 11.1 KB      | ~40 KB     ↑    |
| `docs/` total                 | —      | —      | —      | —      | —      | 24,584.6 KB  | ~5,000 KB  ↓80% |
| DOM nodes at load             | —      | —      | —      | —      | —      | 211,168      | ~2,000     ↓99% |
| TTFB                          | 16ms   | 13ms   | 14ms   | 13ms   | 14ms   | ~14 ms       | ~14 ms     =    |
| FCP                           | 288ms  | 276ms  | 276ms  | 280ms  | 280ms  | ~280 ms      | ~220 ms    ↓    |
| LCP                           | 300ms  | 276ms  | 276ms  | 280ms  | 280ms  | ~282 ms      | ~250 ms    ↓    |
| CLS                           | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000       | 0.0000     =    |
| Time to playground ready      | 276ms  | 274ms  | 281ms  | 272ms  | 267ms  | ~274 ms      | ~200 ms    ↓    |
| Time to navigate to doc page¹ | 19ms   | 26ms   | 27ms   | 16ms   | 16ms   | ~21 ms       | ~150 ms    ↑    |
| `build-playground` time       | —      | —      | —      | —      | —      | ~3 s         | ~1 s       ↓    |

¹ Pre-rewrite navigation is a DOM class toggle — content is already in the page. Post-rewrite it involves a JS render + live example execution. The increase is the honest trade-off for a dynamic architecture.

---

## Goals

- Remove build-time HTML generation — the build step should not render pages
- Dynamic, path-based routing with SEO in mind from day one
- Reference data injected as JSON (`window.referenceData`) rather than embedded HTML
- Tutorial `.md` files bundled into `playground.js` and rendered in the browser
- Replace the utility-class style system with plain CSS using BEM naming
- `playground-builder` becomes a thin data/asset assembler, not an HTML renderer

---

## Architecture

### Before

```
playground-builder (Node.js, build time)
  ├── reads reference data, tutorials, examples
  ├── pre-runs code examples
  ├── renders everything to HTML strings
  └── writes one giant docs/index.html (~all pages baked in)
```

### After

```
playground-builder (Node.js, build time)
  ├── reads reference data (no example pre-running)
  ├── writes window.referenceData inline script into docs/index.html
  └── copies docs/404.html (GitHub Pages SPA fallback)

playground-www (browser runtime, playground.js)
  ├── bundles tutorial .md files as raw strings (rolldown plugin)
  ├── contains all component render functions (BEM classes)
  ├── path-based router (history API)
  ├── runs doc examples live via createDvala() at render time
  └── renders the current page dynamically on navigation
```

---

## Reference Data Shape

The build step produces a single JSON value injected as:

```html
<script>window.referenceData = JSON.parse(decodeURIComponent(atob('...')))</script>
```

TypeScript shape (defined in a shared `common/` file):

```typescript
interface ReferenceData {
  version: string
  api: Record<string, Reference>          // core functions, special expressions, shorthands, datatypes
  modules: Record<string, Reference>      // module functions, keyed by "module.fn"
  effects: Record<string, Reference>      // effects
  moduleCategories: string[]              // ordered list of module category names
  coreCategories: string[]                // ordered list of core category names
  searchEntries: SearchEntry[]            // pre-built search index (title, search string, snippet)
  examples: ExampleEntry[]                // named example programs
}
```

`Reference`, `SearchEntry`, `ExampleEntry` are all plain data — no HTML, no rendered strings.

Tutorials are **not** in `referenceData` — they are imported directly as raw strings by
`playground-www` at bundle time (see Tutorials section below).

---

## Routing

Path-based routing using the history API. The router listens to `popstate` and the initial
`DOMContentLoaded`. All navigation goes through `router.navigate(pageId)` and all link `href`
values are produced by `router.href(pageId)` — never by constructing paths manually in component code.

### URL structure

| Path | Page |
|---|---|
| `/` | Home / start page |
| `/about` | About |
| `/tutorials` | Tutorial index |
| `/tutorials/getting-started` | A specific tutorial |
| `/examples` | Examples index |
| `/core` | Core functions overview |
| `/modules` | Modules overview |
| `/ref/map` | Doc page for `map` |
| `/ref/math.sin` | Doc page for module function |
| `/saved` | Saved programs |
| `/snapshots` | Snapshots |
| `/settings` | Settings |

The router maps a path to a render function and calls it with the current `referenceData`.
Result is set as `innerHTML` of `#main-panel`. On every navigation the router also updates
`document.title` and the `<meta name="description">` tag.

### GitHub Pages 404 fallback

GitHub Pages serves static files only — a request for `/ref/map` returns a 404 since there is
no such file. The workaround: `404.html` encodes the requested path as a query parameter and
redirects to `/`, where the app reads it back and calls `history.replaceState` to restore the
original path before the router runs.

**`docs/404.html`** (generated by the build step — a copy of `index.html` with this script prepended):
```html
<script>
  // Encode the path as ?p=/ref/map and redirect to /
  var l = window.location
  l.replace(l.origin + '/?p=' + encodeURIComponent(l.pathname + l.search) + l.hash)
</script>
```

**`docs/index.html`** (inline script before app loads):
```html
<script>
  // Restore path encoded by 404.html
  var p = new URLSearchParams(location.search).get('p')
  if (p) history.replaceState(null, '', decodeURIComponent(p))
</script>
```

This gives every page a real, shareable URL that works when navigated to directly or shared.

---

## Tutorials

Tutorial `.md` files move from `playground-builder/src/components/tutorials/pages/` to a
top-level `tutorials/` directory (alongside `src/`, `reference/`, etc.).

They are imported directly by `playground-www` as raw strings. A `markdownSourcePlugin` is added
to `rolldown.plugins.mjs` — identical in structure to the existing `dvalaSourcePlugin`, just
matching `.md` instead of `.dvala`. No external rolldown plugin needed.

```ts
// tutorials/02-core-language/01-data-types.md
import rawDataTypes from '../../../tutorials/02-core-language/01-data-types.md'
```

The browser renders markdown to HTML using **`marked`**, bundled into `playground.js` (not CDN).
`marked` is ~13 KB gzipped — negligible given the bundle already contains the full Dvala runtime.

`TutorialEntry` (defined in `playground-www`, not in `referenceData`):
```typescript
interface TutorialEntry {
  id: string     // URL slug, e.g. "getting-started"
  title: string  // extracted from first # heading in the .md
  raw: string    // raw markdown string
}
```

Folder structure mirrors the filesystem — a `TutorialFolder` groups entries under a display name
derived from the directory name (same logic as today).

Mermaid diagrams: rendered client-side via the `mermaid` library (already used).

---

## CSS / BEM

The utility-class style system (`playground-builder/src/styles/`) is deleted entirely.

All styling lives in `playground-www/public/styles.css`, organized into sections by component.
No SCSS — plain CSS with custom properties for all constants (colors, fonts, spacing).

Classes follow BEM:

```
.block
.block__element
.block--modifier
.block__element--modifier
```

### Custom properties (`:root`)

All design tokens are defined once at the top of `styles.css`:

```css
:root {
  /* Colors */
  --color-bg:       #1a1a1a;
  --color-surface:  #2a2a2a;
  --color-text:     #d4d4d4;
  --color-text-dim: #888;
  --color-accent:   #7c9ef8;
  --color-border:   #444;

  /* Typography */
  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Roboto', sans-serif;
  --font-size-sm:   0.875rem;
  --font-size-base: 1rem;
  --font-size-lg:   1.25rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
}
```

No magic numbers anywhere else in `styles.css` — all values reference these tokens.
Theme changes (e.g. light mode) require only overriding `:root` variables.

### Rough class inventory

```css
/* Layout */
.app { }
.app__main { }
.app__sidebar { }
.app__resize-handle { }

/* Sidebar */
.sidebar { }
.sidebar__logo { }
.sidebar__search-btn { }
.sidebar__nav { }
.sidebar__nav-item { }
.sidebar__nav-item--active { }
.sidebar__section { }
.sidebar__section-header { }
.sidebar__section-header--open { }
.sidebar__section-content { }
.sidebar__link { }

/* Pages (shared content wrapper) */
.content-page { }
.content-page__header { }
.content-page__body { }

/* Doc page */
.doc-page { }
.doc-page__signature { }
.doc-page__section { }
.doc-page__section-title { }
.doc-page__example { }
.doc-page__example-code { }
.doc-page__example-output { }

/* Tutorial page */
.tutorial-page { }
.tutorial-page__nav { }
.tutorial-page__nav-link { }

/* Search dialog */
.search-dialog { }
.search-dialog__input { }
.search-dialog__results { }
.search-dialog__entry { }
.search-dialog__entry--focused { }
.search-dialog__entry-title { }
.search-dialog__entry-category { }

/* Playground (code editor panel) */
.playground { }
.playground__editor { }
.playground__output { }
.playground__toolbar { }

/* Misc */
.toast { }
.toast--error { }
.toast--info { }
```

---

## Doc Example Execution

Doc examples (the code snippets in function/module reference pages) are **run live in the
browser** at page-render time using `createDvala()`.

Rationale:
- `playground.js` already bundles the full Dvala runtime — live execution costs microseconds
- Always accurate: output reflects actual runtime behavior, no stale pre-run results
- Simpler build step: no example pre-running, no storing results in JSON
- Tests already verify example correctness independently

The render function for a doc page calls `createDvala().run(exampleCode)` for each example
and renders the result inline. Async examples use `runAsync()`.

---

## What Stays in `playground-builder`

After the rewrite, `playground-builder` is responsible only for:

1. **`buildPlaygroundSite.ts`** — simplified to:
   - Assemble `ReferenceData` object from `reference/`
   - Serialize to JSON and inject as `window.referenceData` into shell `index.html`
   - Copy static assets (`playground.js`, `styles.css`, images, favicon)
   - Write `docs/404.html` with the path-restore redirect script

Everything else (component functions, style utilities, markdown rendering, tutorial loading,
example pre-running) is deleted or moved to `playground-www`.

---

## What Moves to `playground-www`

- All component render functions (rewritten with BEM classes)
- Path router (`src/router.ts`) using history API
- Markdown renderer (wraps `marked`)
- Sidebar renderer (reads from `window.referenceData`)
- Search logic (reads from `window.referenceData.searchEntries`)

---

## Process Rule

**After completing each chunk: update the Migration Steps below** — mark the chunk as done,
note any deviations from the plan, and record the date. This keeps the plan as a living
record of what was actually done, not just what was intended.

---

## Migration Steps

### Chunk 1 — Foundation ✅ (2026-03-15)
- [x] Define `ReferenceData` + `SearchEntry` types in `common/referenceData.ts`
- [x] Write `e2e/kpi.spec.ts` and capture KPI baseline (5 runs, Core Web Vitals included)
- [ ] Move tutorial `.md` files to top-level `tutorials/` folder
- [ ] Add `markdownSourcePlugin` to `rolldown.plugins.mjs` (mirrors `dvalaSourcePlugin`)
- [ ] Install `marked`
- [ ] Verify `npm run check` passes

### Chunk 2 — Build step rewrite
- [ ] Rewrite `buildPlaygroundSite.ts` — assemble JSON only, no HTML rendering, emit `404.html`
- [ ] Delete `playground-builder` component/style files

### Chunk 3 — Router + shell
- [ ] Implement path router in `playground-www/src/router.ts` (history API + `popstate`)
- [ ] Wire up `DOMContentLoaded` + `popstate` in `playground.ts`

### Chunk 4 — Pages
- [ ] Rewrite component functions in `playground-www/src/components/` with BEM classes:
  `sidebar.ts`, `docPage.ts`, `tutorialPage.ts`, `corePage.ts`, `modulesPage.ts`, `examplePage.ts`, `startPage.ts`, etc.
- [ ] Rewrite search to read from `window.referenceData.searchEntries`

### Chunk 5 — CSS
- [ ] Rewrite `styles.css` with `:root` tokens + BEM classes
- [ ] Remove all old inline styles

### Chunk 6 — Cleanup + KPI
- [ ] Delete `playground-builder/src/styles/` and all dead component code
- [ ] Run `npm run check`
- [ ] Run KPI spec (5 runs) and fill in the "After" column in the baseline table
- [ ] Smoke-test routing, search, tutorials, doc pages, playground editor

---

## Non-Goals

- No framework (React, Vue etc.) — keep vanilla TS + DOM
- No lazy loading of route chunks (bundle is already small enough)
- No server-side rendering — the 404 fallback trick is sufficient for GitHub Pages
