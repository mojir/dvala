# Light Mode for the Playground

**Status:** Draft
**Created:** 2026-04-06

## Goal

Add a light mode theme to the Dvala playground, switchable via a settings toggle, with optional auto-detection from the OS `prefers-color-scheme` preference.

---

## Background

The playground currently ships with a single dark theme (loosely based on VS Code Dark+). The CSS is already well-architected for theming: all 49 color values are defined as CSS custom properties (`--color-*`, `--syntax-*`) with no hardcoded colors in the stylesheet. Syntax highlighting in `SyntaxOverlay.ts` also uses these variables exclusively. The settings infrastructure (state + toggle + `updateCSS()`) is a trivial wire-up. The main work is designing a high-quality light palette.

## Proposal

Use a `[data-theme="light"]` attribute on `<html>` to override the CSS variable block. On app init, detect `prefers-color-scheme` if the user hasn't made an explicit choice. Persist the preference via the existing state system.

**CSS approach:**
```css
/* styles.css — existing :root defines dark values */
:root { --color-bg: #1a1a1a; … }

/* Light override block */
[data-theme="light"] {
  --color-bg: #ffffff;
  …
}
```

**JS approach:**
- Add `'light-mode': false` to `state.ts` defaultState
- In `updateCSS()`, apply/remove `data-theme="light"` on `document.documentElement`
- Add a settings toggle that calls `toggleLightMode()`
- On first load (no stored preference), read `window.matchMedia('(prefers-color-scheme: light)').matches`

**Palette reference:** VS Code Light+ for syntax colors; GitHub / Linear for UI chrome.

## Open Questions

- Should the default follow OS preference, or always default to dark?
- Do SVG icons (inline in `shell.ts`) need color overrides, or do they inherit `currentColor` correctly?
- Should the toggle live in the general settings tab or get its own "Appearance" section?
- Is there a preferred palette tool / design token source to use?

## Implementation Plan

1. **Design the light palette** — define light values for all 49 CSS variables. Use VS Code Light+ as reference for `--syntax-*`. Validate WCAG AA contrast (4.5:1) for all text/background pairs.

2. **Add `[data-theme="light"]` block to `styles.css`** — paste the override block with the new palette.

3. **Wire up state and handler** (`state.ts`, `scripts.ts`):
   - Add `'light-mode': false` to `defaultState`
   - Add `export function toggleLightMode()` that saves state and calls `updateCSS()`
   - In `updateCSS()`: `document.documentElement.setAttribute('data-theme', getState('light-mode') ? 'light' : 'dark')`

4. **Add settings toggle** (`shell.ts`): one `${toggle(...)}` call in `getSettingsPage()`.

5. **System preference detection** — on app init, if `'light-mode'` has no stored value, read `prefers-color-scheme` and set the initial state accordingly.

6. **Test all surfaces** — editor panels, syntax highlighting, AST viewer, reference pages, modals, menus, toasts, empty states.
