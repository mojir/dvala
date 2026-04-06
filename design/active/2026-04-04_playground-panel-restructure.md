# Playground Panel Restructure — Tab-Based Layout

**Status:** In Progress
**Created:** 2026-04-04

## Goal

Replace the sidebar + fixed bottom panel layout with a tab-based navigation. Each top-level concern gets a persistent tab. The sidebar is removed entirely.

---

## Background

### Current layout

```
┌──────────┬──────────────────────────────────────┐
│ SIDEBAR  │ MAIN PANEL (pages: Book, Ref, etc)   │
│          │                                       │
│ Nav      │                                       │
│ links    │                                       │
│          ├──────────────────────────────────────┤
│          │ PLAYGROUND (fixed bottom)             │
│          │ ┌────────┬─────────┬────────────┐    │
│          │ │Context │ Code    │ Output     │    │
│          │ │Panel   │ Editor  │ Panel      │    │
│          │ └────────┴─────────┴────────────┘    │
└──────────┴──────────────────────────────────────┘
```

## Proposal

### Phase 1 (this PR): Tab bar + move panels into Playground tab

Move the existing three-panel playground (Context | Code | Output) as-is into the Playground tab. Replace the sidebar with a horizontal tab bar. Other pages (Book, Examples, Reference) render in their own tabs.

```
┌────────────────────────────────────────────────────────────┐
│ Home │ Playground │ API Reference │ Examples │ The Book │ ⚙ │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PLAYGROUND TAB:                                           │
│  ┌────────────┬──────────────┬────────────────┐           │
│  │ Context    │ Code Editor  │ Output         │           │
│  │ Panel      │              │ Panel          │           │
│  │            │              │                │           │
│  └────────────┴──────────────┴────────────────┘           │
│                                                            │
│  OTHER TABS: full-page content (Book, Ref, Examples, etc)  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**What changes in Phase 1:**
- Sidebar removed, replaced by horizontal tab bar at top
- Playground panels move from fixed-bottom into the Playground tab content area
- Tab state is persistent (switching tabs preserves DOM/state)
- Active tab reflected in URL
- Resize dividers within Playground tab preserved as-is

**What does NOT change in Phase 1:**
- Three-panel layout (Context | Code | Output) stays as-is
- Panel resize behavior stays as-is
- Programs, Snapshots stay as separate pages (tabs or within Playground)

### Phase 2 (future): Restructure Playground internals

- Full-page code editor with collapsible output split
- Context moves to modal
- Single resize handle instead of three
- Mobile-friendly layout

### Tabs

| Tab | Route | Content |
|---|---|---|
| **Home** | `/` | Start page |
| **Playground** | `/playground` | Three-panel editor (Context / Code / Output) |
| **API Reference** | `/ref`, `/ref/*` | Reference pages |
| **Examples** | `/examples`, `/examples/*` | Example pages |
| **The Book** | `/book`, `/book/*` | Book pages |
| **Settings** | `/settings` | Settings (gear icon) |

### Tab behavior

- **Persistent state** — switching tabs does not destroy content. Each tab retains its DOM, scroll position, and internal state.
- **URL-driven** — active tab reflected in URL. Deep links work.
- **Tab bar always visible** — fixed at top, ~40px. Content fills remaining height.

## Open Questions

- Tab bar styling — text only? Icons + text?
- Logo placement — left of tabs? Inside Home tab?
- Mobile — tabs collapse into hamburger? Horizontal scroll?
- Programs/Snapshots — own tabs or sub-views in Playground?

## Implementation Plan (Phase 1)

1. Create tab bar component (horizontal bar, tab buttons, active state)
2. Implement tab persistence (keep DOM alive per tab, show/hide)
3. Remove sidebar (`#sidebar`, `#resize-sidebar`)
4. Move playground panels into Playground tab content area
5. Adjust CSS — playground fills tab content area instead of fixed-bottom
6. Update routing — map tab activation to URL paths
7. Update e2e tests
