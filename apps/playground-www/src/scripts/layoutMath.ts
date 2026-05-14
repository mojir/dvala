// Pure functions used by `applyLayout` and the resize-divider-3 drag
// handler. Lives in its own module (instead of inside scripts.ts) so
// it has zero DOM / state-store dependencies and can be imported into
// unit tests without dragging the whole playground module graph along.

/**
 * Minimum width the code-editor column should keep regardless of how
 * the side panel and right panel are sized. Prevents the editor from
 * being squeezed to zero when the user maxes out both side dragger
 * (10-50%) and right dragger (15-60%) — together they could otherwise
 * sum to 110% and push `1fr` negative.
 */
const MIN_EDITOR_COL_PERCENT = 15

/** Right-panel drag bounds. The panel can't be dragged narrower than 15%
 *  or wider than 60% of the viewport — outside those limits the
 *  affordance becomes hard to use. */
const RIGHT_PANEL_MIN_PERCENT = 15
const RIGHT_PANEL_MAX_PERCENT = 60

/**
 * Cap the right-panel width so the code-editor column gets at least
 * `MIN_EDITOR_COL_PERCENT` of the row, regardless of how wide the side
 * panel is. Floors at the right panel's own minimum drag-width so a
 * wide side panel never makes the right panel disappear — it just
 * squeezes the editor below the soft minimum, which is still better
 * than negative `1fr`.
 */
export function clampRightPercent(rightPercent: number, sidePercent: number): number {
  const maxRight = Math.max(RIGHT_PANEL_MIN_PERCENT, 100 - sidePercent - MIN_EDITOR_COL_PERCENT)
  return Math.min(rightPercent, maxRight)
}

/**
 * Convert a horizontal drag delta into a new right-panel percent.
 * The right panel sits to the RIGHT of its divider, so a leftward
 * drag (negative deltaX) should grow the panel — we subtract the
 * delta-fraction from the starting percent. Result is clamped to the
 * draggable range so the persisted value stays sensible.
 */
export function computeRightPanelPercent(
  percentBeforeMove: number,
  deltaX: number,
  windowWidth: number,
): number {
  const next = percentBeforeMove - (deltaX / windowWidth) * 100
  if (next < RIGHT_PANEL_MIN_PERCENT) return RIGHT_PANEL_MIN_PERCENT
  if (next > RIGHT_PANEL_MAX_PERCENT) return RIGHT_PANEL_MAX_PERCENT
  return next
}
