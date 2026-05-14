// Unit tests for the pure layout helpers in `scripts/layoutMath.ts`
// (`clampRightPercent`, `computeRightPanelPercent`). They're extracted
// out of scripts.ts so they have no DOM / state-store deps — that lets
// us cover the drag-extreme edges (sidePercent + rightPercent > 100,
// drag past upper/lower bounds) without standing up the playground.

import { describe, expect, it } from 'vitest'
import { clampRightPercent, computeRightPanelPercent } from './layoutMath'

describe('clampRightPercent', () => {
  it('returns the input when sidePercent is small enough that the editor still fits', () => {
    // Default side=20, right=35 → editor gets ~45%, plenty of room.
    expect(clampRightPercent(35, 20)).toBe(35)
  })

  it('caps the right panel so the editor keeps at least MIN_EDITOR_COL_PERCENT', () => {
    // Side at max (50%); right tries to claim 60%. Editor would get
    // 100 - 50 - 60 = -10%. Clamp brings right down to 35 so editor
    // gets the 15% minimum.
    expect(clampRightPercent(60, 50)).toBe(35)
  })

  it('floors at the right panel minimum drag-width (15%) even when the side panel is wider than the cap allows', () => {
    // Side hypothetically at 90% (above the side dragger's max but
    // possible if the limit is changed in the future). The cap math
    // would otherwise push right to -5%; the floor keeps it at 15%
    // (squeezing the editor below the soft min — better than zero).
    expect(clampRightPercent(40, 90)).toBe(15)
  })

  it('does not increase the right percent if the side leaves more room than asked for', () => {
    // The cap is an upper bound only — passing 20 with a small side
    // doesn't expand the panel to fill the available space.
    expect(clampRightPercent(20, 10)).toBe(20)
  })

  it('treats sidePercent=0 as "no side panel" (right capped only by its own intrinsic max)', () => {
    // 100 - 0 - 15 = 85, so any rightPercent ≤ 85 passes through.
    expect(clampRightPercent(60, 0)).toBe(60)
    expect(clampRightPercent(85, 0)).toBe(85)
    expect(clampRightPercent(86, 0)).toBe(85)
  })
})

describe('computeRightPanelPercent', () => {
  it('returns the start percent when delta is zero', () => {
    expect(computeRightPanelPercent(35, 0, 1000)).toBe(35)
  })

  it('grows the panel when the cursor moves LEFT (negative deltaX)', () => {
    // Window 1000px, drag 100px left → 10% of width → panel grows by 10.
    expect(computeRightPanelPercent(35, -100, 1000)).toBe(45)
  })

  it('shrinks the panel when the cursor moves RIGHT (positive deltaX)', () => {
    expect(computeRightPanelPercent(35, 100, 1000)).toBe(25)
  })

  it('clamps at the lower bound (15%)', () => {
    // Drag right past where the panel would be ≤ 15% — clamps at 15.
    expect(computeRightPanelPercent(35, 999, 1000)).toBe(15)
  })

  it('clamps at the upper bound (60%)', () => {
    // Drag left past where the panel would be ≥ 60% — clamps at 60.
    expect(computeRightPanelPercent(35, -999, 1000)).toBe(60)
  })

  it('handles fractional results without rounding', () => {
    // Negative deltaX (drag left) grows the panel. 35 - (-33/1000)*100
    // = 35 + 3.3 = 38.3, preserved as-is — the caller handles rendering.
    expect(computeRightPanelPercent(35, -33, 1000)).toBeCloseTo(38.3, 5)
  })
})
