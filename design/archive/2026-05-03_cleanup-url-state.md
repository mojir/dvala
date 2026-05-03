# Clean up playground URL state & unify snapshot paths

**Status:** Draft
**Created:** 2026-05-03

## Goal

Simplify the playground URL to encode only what matters, and ensure snapshot paths are stable and consistent for CLI mode compatibility.

---

## Background

Today the playground URL carries four params:

```
/editor?view=files&fileId=abc123&snapshotId=def456&state=...
```

| Param | Purpose | Issue |
|-------|---------|-------|
| `view` | Side panel tab | Redundant — derivable from which tab is active |
| `fileId` | Active workspace file (UUID) | UUIDs don't exist in CLI/filesystem mode |
| `snapshotId` | Active snapshot in side panel | Snapshots are editor tabs now, not side-panel selections |
| `state` | Base64-encoded full program state | Only relevant for sharing — stripped after load |

The side panel `snapshotId` is dead since Phase 1.5 made snapshots into editor tabs. The `view` param encodes state that can be derived from the active tab kind. And `fileId` uses UUIDs which won't work in CLI mode where files come from the filesystem.

---

## Proposal

### New URL scheme

```
/editor                                    → scratch (default)
/editor?path=src/utils.dvala               → workspace file
/editor?path=.dvala-playground/snapshots/1714752000000.json  → snapshot
/editor?state=...                          → shared program state
/editor?path=src/utils.dvala&state=...     → file + shared state
```

Two params only: `path` and `state`. Zero redundancy.

### `path` parameter

- Replaces both `fileId` and `snapshotId`
- Uses the workspace file's `path` field (same as `WorkspaceFile.path`)
- Works for all tab kinds: workspace files, scratch, handlers, snapshots
- `/` in paths is `%2F` encoded by `URLSearchParams` automatically
- Lookup: `getWorkspaceFiles().find(f => f.path === decodedPath)`

### `state` parameter

- Unchanged — base64-encoded JSON blob of full program state
- Stripped from URL immediately after loading (existing behavior)
- Only appears when user explicitly shares

### Dropped params

| Param | Why dropped |
|-------|-------------|
| `view` | Derived from active tab kind — `syncChromeForActiveTabKind()` handles side panel switching in `afterSwap` |
| `fileId` | Replaced by `path` |
| `snapshotId` | Dead — snapshots are editor tabs since Phase 1.5 step 23j |

### Tab-switch URL sync

Today `fileId` only appears in the URL when clicking a file in the explorer. It does NOT update when switching tabs via the tab strip. After this change, `path` is synced to the URL on every tab switch (via `afterSwap` → `syncPlaygroundUrlState`).

### Snapshot paths (no change needed)

Snapshot paths already use `savedAt` timestamps with collision-safe dedup:

```
.dvala-playground/snapshots/1714752000000.json
.dvala-playground/snapshots/1714752000000-2.json   (same-ms collision)
```

This is stable — `savedAt` never changes after write. The existing `snapshotPath()` function handles collisions with `-n` suffix. No UUID generation needed.

### CLI mode compatibility

In CLI mode, the playground's file backend is the filesystem. `path` maps directly to actual files:

```
.dvala-playground/
  scratch.dvala
  handlers.dvala
  snapshots/
    1714752000000.json
    ...
```

Workspace files live outside `.dvala-playground/`:

```
src/
  utils.dvala
  main.dvala
```

---

## Files affected

| File | Change |
|------|--------|
| `playground-www/src/scripts/sidePanels.ts` | Remove `view`, `fileId`, `snapshotId` from `syncPlaygroundUrlState`; sync `path` instead |
| `playground-www/src/scripts.ts` | Update `getDataFromUrl()` to read `path` instead of `fileId`/`snapshotId`/`view`; update `afterSwap` to sync URL |
| `playground-www/src/scripts/files.ts` | Remove URL sync calls that set `fileId` (let `afterSwap` handle it) |
| `playground-www/src/scripts/tabs.ts` | `afterSwap` hook already exists — ensure `path` URL sync fires there |
| `e2e/playground.spec.ts` | Update URL assertions to use `path` |

### Dead code removal

After removing the old params:

- `getActiveSnapshotUrlId()` — only used for URL sync, can be removed
- `syncPlaygroundUrlState` — remove `view`/`fileId`/`snapshotId` logic
- `getDataFromUrl` — remove `view`/`snapshotId` branches, use `path`
- `normalizeSideTab` usage in URL-related code — may become unused
- Test helpers that construct URLs with old params

---

## Open Questions

- None. All resolved in discussion (2026-05-03).

## Implementation Plan

1. Update `syncPlaygroundUrlState` to write/read `path` instead of `fileId` + `view` + `snapshotId`
2. Update `getDataFromUrl` to parse `path` and derive side tab from tab kind
3. Wire `afterSwap` to call `syncPlaygroundUrlState` on every tab switch
4. Remove dead `getActiveSnapshotUrlId`, old param handling, `view`-based routing
5. Update E2E tests
6. Run `pnpm run check` and verify E2E
