# Remove `#dvala-panel-header` — fold into tab strip + toolbar

**Status:** Draft
**Created:** 2026-05-02

## Goal

Remove the redundant `#dvala-panel-header` bar above the editor area and redistribute its responsibilities into the editor tab strip and the `#editor-toolbar`.

---

## Background

The playground layout currently has a dual-header for the editor area:

```
#editor-top (CSS grid)
├── Row 1: #dvala-panel-header   ← redundant header
└── Row 2: #dvala-panel
    ├── .editor-tab-bar           ← tab strip + toggle
    ├── #dvala-editor-view
    ├── #dvala-snapshot-view
    └── #dvala-empty-view
```

The `#dvala-panel-header` and the tab strip both convey file identity (filename, unsaved dot, lock). The header also houses snapshot breadcrumbs, undo/redo buttons, save-scratch, and close buttons. These create a visually cluttered, non-IDE-like experience.

---

## Proposal

Remove `#dvala-panel-header` entirely. Its contents are redistributed or eliminated:

### Removed
- **Undo/Redo buttons** — Monaco provides native Cmd+Z / Cmd+Shift+Z. Buttons are redundant.
- **Lock indicator + locked-files feature** — overkill for a playground. The entire lock mechanism is removed.
- **Snapshot breadcrumbs** — sub-snapshots (checkpoints) open in modals, so there's no hierarchy to navigate. The legacy `renderSnapshotBreadcrumbs` and `#dvala-header-snapshot` are removed.
- **Close buttons** (file close ✕, snapshot "Back to editor") — the tab strip already has per-tab ✕ buttons. Exiting snapshot mode is done by clicking any file tab.

### Moved
- **Pending (unsaved) dot** → displayed inline on the active tab in `#editor-tab-strip`.
- **"Save to file"** button (formerly "Save scratch") → moves to `#editor-toolbar` as a dynamic CTA, visible when the scratch buffer or an unsaved file is active.
- **Right-panel toggle** → stays in `.editor-tab-bar` as the last item.

### Added
- **Tab icons** — `.dvala` files show the favicon (`/favicon.png`), snapshots show the camera icon (`cameraIcon` from `icons.ts`). Other file types have no icon for now.

### CSS grid changes

`#dvala-panel-header` is removed from the grid. `#dvala-panel` now spans from row 1 (consuming the freed space). The `.editor-tab-bar` effectively becomes the visual header of the editor area.

---

## Files affected

| File | Change |
|---|---|
| `playground-www/src/shell.ts` | Remove `#dvala-panel-header` HTML, remove `#dvala-header-editor`, `#dvala-header-snapshot`, `#save-scratch-btn`, `#dvala-code-undo-button`, `#dvala-code-redo-button`, `#file-close-btn`, `#snapshot-close-btn` |
| `playground-www/src/scripts/elements.ts` | Remove getters for removed elements; update grid selectors |
| `playground-www/src/scripts/sidePanels.ts` | Remove `syncCodePanelView` header toggling logic |
| `playground-www/src/scripts.ts` | Remove `renderSnapshotBreadcrumbs`, undo/redo click handlers, lock-related logic, close-button handlers; add tab-icon rendering; add pending-dot to active tab; wire "Save to file" to `#editor-toolbar` |
| `playground-www/src/scripts/modals.ts` | May need minor updates if snapshot breadcrumbs were referenced |
| `playground-www/public/styles.css` | Remove `#dvala-panel-header` styles; adjust grid; add tab-icon + pending-dot styles; remove lock-indicator styles |

---

## Dead code removal

After removing the elements and handlers listed above, audit each affected file for dead code that becomes orphaned:

- **`scripts.ts`**: After removing `renderSnapshotBreadcrumbs`, undo/redo click handlers, lock logic, and close-button handlers, check for helper functions and state variables that are no longer referenced. Examples to look for:
  - `currentSnapshotPath` or similar snapshot-tracking state (if only used by breadcrumbs)
  - Lock-related state variables and their getters/setters
  - Any imports that become unused (icons only referenced by removed buttons, etc.)
- **`icons.ts`**: If `undoIcon` and `redoIcon` are no longer imported anywhere, remove them from `icons.ts`.
- **`elements.ts`**: Remove getters for removed elements. Verify no other code references those getters before removal.
- **`styles.css`**: After removing lock-indicator styles, audit for any adjacent CSS rules that reference the same selectors and can be collapsed.
- **`shell.ts`**: After removing the header HTML, check for any helper functions that only existed to build those elements.

### Boy Scout Principle

While touching these files, improve adjacent code where possible:
- Remove commented-out code blocks
- Collapse redundant DOM queries
- Extract magic strings into named constants
- Add missing type annotations
- Remove `any` casts that can be properly typed
- Ensure consistent naming conventions within each file

## Open Questions

- None. All questions were resolved in the interview session (2026-05-02).

## Implementation Plan

1. Remove `#dvala-panel-header` HTML from `shell.ts` and all its child elements
2. Remove associated element getters from `elements.ts`
3. Update CSS grid to let `#dvala-panel` span the full height
4. Remove `renderSnapshotBreadcrumbs` and `syncCodePanelView` header toggling from `scripts.ts` and `sidePanels.ts`
5. Remove undo/redo click handlers and lock-related code
6. Add tab icon rendering (favicon for `.dvala`, camera for snapshots)
7. Add pending-dot to the active tab element
8. Wire "Save to file" button into `#editor-toolbar` as a dynamic CTA
9. Remove lock-related CSS
10. Audit for dead code (see "Dead code removal" section above) and clean up orphaned helpers, state, icons, and imports
11. Run `pnpm run check` and verify playground E2E tests
