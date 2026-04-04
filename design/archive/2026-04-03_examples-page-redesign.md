# Examples Page Redesign — Categories, Search, and Card UI

**Status:** Draft
**Created:** 2026-04-03

## Goal

Redesign the playground's `/examples` page to support categorized, searchable examples with a card-based UI — matching the look and feel of the Book pages.

---

## Background

The current examples page is a flat list of expandable `<details>` elements with no categories, no search, and no individual example pages. As the example collection grows, discoverability suffers. The Book already has a polished pattern: sticky header with title + search icon, section grouping, and individual content pages. We want the examples to follow a similar UX while keeping their own identity (small cards, "Load in playground" CTA).

### Current state

- **Data model:** `Example { id, name, description, code, context? }` — flat array, ~25 examples, no `category` field.
- **Rendering:** `examplePage.ts` renders a single `<ul>` with all examples as collapsible items.
- **Route:** `/examples` — single page, no individual example routes.

### Existing patterns to reuse

- **Sticky header:** `chapter-header` component (title, action buttons) from `chapterPage.ts`.
- **Search:** `toggleBookSearch()` in `scripts.ts` — search overlay pattern already exists for the Book.
- **Markdown rendering:** `renderDvalaMarkdown()` for code blocks with syntax highlighting and run buttons.
- **Router:** `navigate()` / `href()` from `router.ts` already supports nested routes.

---

## Proposal

### 1. Data model — add `category` to Example

```typescript
// reference/examples.ts
export interface Example {
  id: string
  name: string
  description: string
  category: string          // NEW — e.g. "Basics", "Algorithms", "Effects", "Macros"
  code: string
  context?: { ... }
}
```

Proposed categories for existing examples:

| Category | Examples |
|---|---|
| **Basics** | Collection accessors, Template strings, Factorial, Sort, FizzBuzz |
| **Effects & Context** | Using context, Async host effects, Interactive async, Playground Effects Demo |
| **Macros** | Macros — Introduction, Macros — Advanced, Macro Inception, Macro toolkit |
| **Projects** | A game |
| **Test Fixtures** | AST node coverage, AST coverage (extended) |

### 2. Routes

| Route | Page | Description |
|---|---|---|
| `/examples` | Examples index | Sticky header + categories with example cards |
| `/examples/:id` | Individual example | Sticky header + full example view |

### 3. Examples index page (`/examples`)

```
┌──────────────────────────────────────────┐
│  ←  Examples                        🔍   │  ← sticky header (no TOC, no →)
├──────────────────────────────────────────┤
│                                          │
│  Basics                                  │  ← category heading
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Simple   │ │ Collec-  │ │ Template │ │  ← small cards grid
│  │ Dvala    │ │ tion     │ │ strings  │ │
│  │ program  │ │ access.  │ │          │ │
│  │          │ │          │ │          │ │
│  │ [Load ▶] │ │ [Load ▶] │ │ [Load ▶] │ │  ← CTA button
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  Effects & Context                       │
│  ┌──────────┐ ┌──────────┐              │
│  │ ...      │ │ ...      │              │
│  └──────────┘ └──────────┘              │
│                                          │
└──────────────────────────────────────────┘
```

**Header:** Reuse `chapter-header` pattern — title "Examples", search icon only (no TOC hamburger, no prev/next arrows).

**Cards:** Each card shows:
- Example name (title)
- Short description (1-2 lines, truncated)
- "Load in playground" button (small CTA at bottom)
- Clicking the card body navigates to `/examples/:id`

**Search:** Reuse the book search overlay pattern. Filter examples by name/description/category. Results update the visible cards (hide non-matching categories and cards).

### 4. Individual example page (`/examples/:id`)

```
┌──────────────────────────────────────────┐
│  ←  Collection accessors            🔍   │  ← sticky header (← goes back to /examples)
├──────────────────────────────────────────┤
│                                          │
│  Syntactic sugar for accessing object,   │  ← description
│  array and string elements.              │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │ // Access object properties with .   ││  ← syntax-highlighted code block
│  │ let data = { ... };                  ││     (rendered via renderCodeBlock)
│  │ ...                                  ││
│  └──────────────────────────────────────┘│
│                                          │
│  [Load in playground]                    │  ← primary CTA button
│                                          │
│  ← prev example    next example →        │  ← prev/next within same category
│                                          │
└──────────────────────────────────────────┘
```

**Header:** Sticky, with ← back to `/examples`, example name as title, search icon.

**Content:** Description, syntax-highlighted code block (using `renderCodeBlock` or `tokenizeToHtml`), prominent "Load in playground" button.

**Navigation:** Prev/next links to adjacent examples within the same category.

### 5. Search behavior

- Search icon in the header opens a search input bar (inline, below the header — same pattern as book search).
- Filters by example name, description, and category (case-insensitive substring match).
- On the index page: hides non-matching cards and empty categories in real-time.
- On an individual example page: shows a dropdown of matching results that navigate on click.

### 6. File structure

```
playground-www/src/components/
  examplePage.ts        ← rewrite: index + individual routes
```

No new files needed — the existing `examplePage.ts` can handle both routes (index vs individual), keeping it parallel to how `chapterPage.ts` handles `/book` vs `/book/:id`.

### 7. CSS

New classes needed (in existing stylesheet):
- `.example-card` — small card in grid layout
- `.example-card__title`, `.example-card__desc`, `.example-card__cta`
- `.example-category` — category section with heading
- `.example-category__grid` — CSS grid container for cards
- Reuse `.chapter-header` as-is for the sticky header

---

## Open Questions

- Should prev/next on individual example pages wrap across categories or stay within one category?
- Should the search on the index page also highlight matching text in card titles/descriptions?
- Should categories be ordered explicitly or alphabetically?
- Should the "Load in playground" CTA on cards load immediately (staying on examples page) or navigate to playground view?

## Implementation Plan

1. **Add `category` field to `Example` interface** and assign categories to all existing examples in `reference/examples.ts`.
2. **Update `ReferenceData`** if needed to pass categories through.
3. **Add routing** for `/examples/:id` in `scripts.ts` route handler.
4. **Rewrite `examplePage.ts`** with two render functions:
   - `renderExampleIndexPage()` — categorized card grid with sticky header
   - `renderExampleDetailPage(id)` — individual example with header, code, CTA, prev/next
5. **Add example search** — wire up search icon in header, implement filter logic.
6. **Add CSS** for card grid, category sections, and example detail page.
7. **Update sidebar** if needed (currently just links to `/examples`).
8. **Update e2e tests** to cover new routes and search.
