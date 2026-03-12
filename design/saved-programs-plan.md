# Saved Programs — Implementation Plan

## Overview

A new "Saved Programs" feature that lets users name, save, and manage Dvala programs
(code + context together). Programs are stored in IndexedDB with in-memory cache, similar
to snapshots. The Dvala Code panel title becomes the program name and doubles as the save/rename
UI.

---

## Data Model

```typescript
// playground-www/src/programStorage.ts
export interface SavedProgram {
  id: string        // crypto.randomUUID()
  name: string
  code: string
  context: string
  createdAt: number // Date.now()
  updatedAt: number // Date.now()
}
```

---

## Storage — `programStorage.ts`

New file: `playground-www/src/programStorage.ts`

- Same IDB database (`dvala-playground`) as snapshots, but requires **DB version bump to 2**
- New store: `saved-programs`
- In-memory cache array, same write-through pattern as `snapshotStorage`
- `snapshotStorage.ts` must be updated: bump `DB_VERSION` to 2, add `saved-programs`
  store in `onupgradeneeded`

Exports:
```typescript
export async function init(): Promise<void>
export function getSavedPrograms(): SavedProgram[]
export function setSavedPrograms(entries: SavedProgram[]): void
export function clearAllPrograms(): void
```

**Init coordination**: `programStorage.init()` is NOT called separately. Instead,
`snapshotStorage.init()` is the single DB opener (bumped to v2). `programStorage.ts`
receives the shared `db` handle — or alternatively both modules share a central
`openDB()` helper in a new `playground-www/src/idb.ts`.

> **Decision**: Extract `openDB` into `playground-www/src/idb.ts` so both storage
> modules share one DB connection and one `onupgradeneeded` handler. This avoids
> version conflicts.

---

## localStorage — Current Program

New state key in `defaultState` (state.ts):
```typescript
'current-program-id': null as string | null
```

This persists the active program across page reloads. `null` = Untitled.

---

## Dvala Code Panel Title

### Current state
`dvalaCodeTitle` shows "Dvala Code" (static).

### New behavior
- Title text = loaded program name, or "Untitled Program" if `current-program-id` is null
- Clicking title → replace `<span>` with `<input>` pre-filled with current name
  (empty if "Untitled Program")
- **Return** or **blur**: commit
  - If input is empty → cancel (revert)
  - If name matches an existing program (different ID) → confirm modal:
    "Replace existing program '{name}'? This will overwrite it."
    - Confirm: delete old entry, save/rename current, set `current-program-id`
    - Cancel: keep input open (or revert — keep it open so user can change name)
  - Otherwise: save/rename program in IDB, set `current-program-id`, update title
- **Esc** → cancel, revert to display mode

### Implementation
- Add `data-ref="program-title-display"` span and `program-title-input` input to
  the Dvala Code panel header in `playground.ts`
- `onProgramTitleClick()`, `onProgramTitleBlur()`, `onProgramTitleKeydown()` in scripts.ts

---

## Auto-Save

- Debounce: 5 seconds after last change to dvala-code or context
- **Only active** when `current-program-id !== null`
- On trigger: update `code`, `context`, `updatedAt` in IDB for current program
- localStorage continues to save current editing state as before (unchanged)
- Visual indicator: subtle unsaved dot on title when changes are pending (optional — nice to have)

---

## Saved Programs Page

### HTML — `playground-builder/src/components/savedProgramsPage.ts`

```
[New]                                              (toolbar button — creates new Untitled)
┌─────────────────────────────────────────────────┐
│  My Program          updated 2 min ago          │
│  let x = 1; if x > 0 then "positive"...        │  ← 1-2 line code snippet
│                                          [🗑]   │
└─────────────────────────────────────────────────┘
...
```

- Page ID: `saved-programs-page`
- `<div id="saved-programs-list">` — populated dynamically
- Empty state: "No saved programs"
- Toolbar: just a title/description, no clear-all needed

### Card behavior
- Click anywhere (except delete) → load program (set code + context in editor,
  set `current-program-id`, navigate to playground, scroll to top)
- Delete button → confirm modal, then remove from IDB; if it was the active program,
  set `current-program-id` to null (→ "Untitled Program")

### Sidebar link
Between Examples and Snapshots:
```typescript
${menuLink(savedProgramsIcon, 'Saved Programs', 'Playground.showSavedProgramsPage()')}
```
Icon: use `diskIcon` (new icon to add) or repurpose existing `saveIcon`.

---

## Import / Export Updates

### Export payload
```typescript
type ExportPayload = {
  version: number
  data: Record<string, string>
  savedSnapshots?: SavedSnapshot[]
  recentSnapshots?: TerminalSnapshotEntry[]
  savedPrograms?: SavedProgram[]           // NEW
}
```

### Export modal — new checkbox
- `export-opt-saved-programs` — "Saved programs" (default: checked)

### Import modal — new checkbox
- `import-opt-saved-programs` — "Saved programs" (disabled if not in file)

### Import merge logic
- Same as snapshots: add by ID, skip conflicts, report count in result modal

### Export keys for settings/layout
- `current-program-id` is NOT exported (it's a session-local pointer, not portable)

---

## Implementation Steps

1. **`idb.ts`** — Extract shared IDB open helper, bump version to 2, add `saved-programs` store
2. **`snapshotStorage.ts`** — Update to use shared `idb.ts`
3. **`programStorage.ts`** — New file using shared `idb.ts`
4. **`state.ts`** — Add `current-program-id` to `defaultState`
5. **`savedProgramsPage.ts`** — New page component
6. **`sideBar.ts`** — Add link between Examples and Snapshots
7. **`playground.ts`** — Update Dvala Code panel title (clickable, input mode)
8. **`scripts.ts`**:
   - Init `programStorage` alongside snapshot storage
   - `showSavedProgramsPage()` + `populateSavedProgramsList()`
   - `loadSavedProgram(id)` — loads program into editor
   - `deleteSavedProgram(id)` — deletes, clears active if needed
   - Title click/blur/keydown handlers
   - Auto-save debounce logic
   - Export/import updates
9. **Export/import modals** (`playground.ts`) — add `saved-programs` checkboxes
10. **`buildPlaygroundSite.ts`** — register new page component

---

## Open Questions / Assumptions

- **Code snippet length**: ~120 chars, single line, truncated with `…`
- **"New" button**: Not needed (user said no). Start new program by clearing title
  to Untitled is natural. A "New" toolbar button on the Saved Programs page can be
  added as a nice-to-have.
- **Context field in program card**: Not shown in the card (only code snippet shown)
- **currentProgramId export**: Not included in export (it's a local cursor, not data)
- **Auto-save indicator**: A small dot or "(saving...)" text next to title — implement
  as a simple CSS class toggle, low effort

---

## Files to Create
- `playground-www/src/idb.ts`
- `playground-www/src/programStorage.ts`
- `playground-builder/src/components/savedProgramsPage.ts`

## Files to Modify
- `playground-www/src/snapshotStorage.ts` — use shared idb
- `playground-www/src/state.ts` — add `current-program-id`
- `playground-builder/src/sideBar.ts` — add sidebar link
- `playground-builder/src/components/playground.ts` — title input, new modal checkboxes
- `playground-builder/src/icons.ts` — add icon if needed
- `playground-www/src/scripts.ts` — all runtime logic
- `playground-builder/src/buildPlaygroundSite.ts` — register page
