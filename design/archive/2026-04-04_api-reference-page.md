# Move API Reference from Sidebar into Standalone Page

**Status:** Draft
**Created:** 2026-04-04

## Goal

Move the API reference (core functions, modules, effects) out of the sidebar into a standalone page at `/ref`, following the same UX pattern as the Book and Examples pages: sticky header with search, TOC hamburger, and ← ↑ → navigation.

---

## Background

The API reference currently lives in collapsible sidebar sections (Core API, Modules). Individual doc pages render at `/ref/:linkName`. The `/core` and `/modules` routes show overview listing pages. This approach has limitations:

- The sidebar becomes very long with all API entries expanded
- No search within the reference section (only the global Ctrl+K search)
- Inconsistent UX compared to Book and Examples which have their own pages with headers
- The sidebar mixes navigation (Home, Book, Examples) with content browsing (API entries)

### Current structure

| Route | Renders | Purpose |
|---|---|---|
| `/core` | `corePage.ts` | Core API overview — grouped list with descriptions |
| `/modules` | `modulesPage.ts` | Modules overview — grouped list with descriptions |
| `/ref/:linkName` | `docPage.ts` | Individual function/effect doc page |

### Shared components available

- `pageHeader.ts` — sticky header with title, actions, ← ↑ → nav
- `searchDropdown.ts` — generic search dropdown with grouped results
- `tocDropdown.ts` — generic TOC dropdown with sections and items

## Proposal

### 1. New route structure

| Route | Page | Description |
|---|---|---|
| `/ref` | Reference index | Sticky header + two sections: Core API and Modules |
| `/ref/:linkName` | Individual doc page | Sticky header + doc content (same as today) |

Remove `/core` and `/modules` as separate routes — merge them into `/ref` as sections.

### 2. Reference index page (`/ref`)

```
┌──────────────────────────────────────────────┐
│  Reference                  ☰  🔍  ← ↑ →    │  ← sticky header (no ← ↑, → to first entry)
├──────────────────────────────────────────────┤
│                                              │
│  Core API                                    │  ← section heading
│                                              │
│  Functional                                  │  ← category subheading
│    map — Apply fn to each element            │
│    filter — Keep elements matching predicate │
│    reduce — ...                              │
│    ...                                       │
│                                              │
│  Array                                       │
│    push — ...                                │
│    ...                                       │
│                                              │
│  Modules                                     │  ← section heading
│                                              │
│  math                                        │  ← module subheading
│    sin — ...                                 │
│    cos — ...                                 │
│                                              │
│  Effects                                     │  ← section heading
│    @dvala.io.print — ...                     │
│    ...                                       │
│                                              │
└──────────────────────────────────────────────┘
```

Each entry is a clickable link to `/ref/:linkName` with a short description.

### 3. Individual doc page (`/ref/:linkName`)

```
┌──────────────────────────────────────────────┐
│  map                        ☰  🔍  ← ↑ →    │  ← sticky header
├──────────────────────────────────────────────┤
│  FUNCTIONAL                                  │  ← category badge
│                                              │
│  Signature                                   │
│  map(arr, fn) → Array                        │
│                                              │
│  Description                                 │
│  Apply fn to each element...                 │
│                                              │
│  Examples                                    │
│  ┌──────────────────────────────────────────┐│
│  │ map([1, 2, 3], -> $ * 2)                ││
│  │ => [2, 4, 6]                             ││
│  └──────────────────────────────────────────┘│
│                                              │
│  See Also: filter, reduce                    │
│                                              │
└──────────────────────────────────────────────┘
```

**Header navigation:**
- ← prev function (alphabetical within category, wrapping to prev category)
- ↑ back to `/ref`
- → next function
- ☰ TOC dropdown showing all categories/functions
- 🔍 search dropdown (searches name, description, category)

### 4. Sidebar changes

Remove the Core API and Modules collapsible sections from the sidebar. Add a single "Reference" nav link (like "The Book" and "Examples") that navigates to `/ref`.

### 5. Search

Reuse `searchDropdown.ts`. Search across:
- Function/effect name
- Description
- Category/module name

Priority hits: name matches. Secondary: description matches.

### 6. TOC menu

Reuse `tocDropdown.ts`. Structure:
- Overview link → `/ref`
- Core API sections (by category): Functional, Array, Math, ...
- Module sections: grid, math, vector, ...
- Effects section

### 7. Navigation order

Build a flat ordered list of all reference entries for ← → navigation:
1. Core entries ordered by `coreCategories`, then alphabetically within each
2. Module entries ordered by `moduleCategories`, then alphabetically within each
3. Effect entries alphabetically

## Open Questions

- Should effects get their own section on the index page, or be mixed into core?
- Should the index page use cards (like examples) or a compact list (like book TOC)?
- Should we keep the global Ctrl+K search, or replace it with the reference search when on `/ref`?

## Implementation Plan

1. **Create `referencePage.ts`** with `renderReferenceIndexPage()` and update `renderDocPage()` to use `pageHeader`
2. **Build flat navigation list** for ← → prev/next across all entries
3. **Add reference search** via `searchDropdown`
4. **Add reference TOC** via `tocDropdown`
5. **Update routing** in `scripts.ts` — `/ref` renders index, `/ref/:linkName` renders doc with header
6. **Update sidebar** — remove Core API / Modules sections, add single "Reference" link
7. **Remove `/core` and `/modules` routes** (or redirect to `/ref`)
8. **Update e2e tests**
