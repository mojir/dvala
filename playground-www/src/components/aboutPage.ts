/**
 * Renders the About page (/about).
 */

import type { ReferenceData } from '../../../common/referenceData'
import { getPageHeader } from '../utils'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

// Feature card icons
const pureIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4l1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>'
const immutableIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2s2 .9 2 2s-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1c1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>'
const embedIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7c1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>'
const sandboxIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M23 12l-2.44-2.78l.34-3.68l-3.61-.82l-1.89-3.18L12 3L8.6 1.54L6.71 4.72l-3.61.81l.34 3.68L1 12l2.44 2.78l-.34 3.69l3.61.82l1.89 3.18L12 21l3.4 1.46l1.89-3.18l3.61-.82l-.34-3.68zm-12 2.55l-3.54-3.55l1.41-1.42l2.13 2.13l4.24-4.24l1.41 1.42z"/></svg>'
const effectIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>'
const suspendIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>'
// Stat card icons
const coreIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="m8 18l-6-6l6-6l1.425 1.425l-4.6 4.6L9.4 16.6zm8 0l-1.425-1.425l4.6-4.6L14.6 7.4L16 6l6 6z"/></svg>'
const moduleIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="m21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42M5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4S7 4.67 7 5.5S6.33 7 5.5 7"/></svg>'
export function renderAboutPage(): string {
  const data = window.referenceData
  const coreCount = data ? Object.keys(data.api).length : 0
  const moduleCount = data ? data.moduleCategories.length : 0
  const effectCount = data ? Object.keys(data.effects).length : 0

  return `
<div class="content-page about-page">
  ${getPageHeader({ tagline: true })}

  <div class="about-intro">
    <p class="about-intro__text">
      Dvala is a pure functional expression language designed for embedding in JavaScript applications.
      It provides a safe, sandboxed scripting layer with powerful features like algebraic effects
      and serializable continuations.
    </p>
  </div>

  <section class="about-features">
    <h2 class="about-section-title">Key Features</h2>
    <div class="about-features__grid">
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${suspendIcon}</span>
        <h3 class="about-feature-card__title">Suspend & Resume</h3>
        <p class="about-feature-card__desc">Serialize program state and resume later</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${pureIcon}</span>
        <h3 class="about-feature-card__title">Pure by Default</h3>
        <p class="about-feature-card__desc">No side effects without explicit effect handlers</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${embedIcon}</span>
        <h3 class="about-feature-card__title">Embeddable in JS</h3>
        <p class="about-feature-card__desc">Drop into any JavaScript or TypeScript application</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${immutableIcon}</span>
        <h3 class="about-feature-card__title">Immutable Data</h3>
        <p class="about-feature-card__desc">All values are immutable by design</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${sandboxIcon}</span>
        <h3 class="about-feature-card__title">Safe Sandbox</h3>
        <p class="about-feature-card__desc">No file system, no network — fully controlled execution</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${effectIcon}</span>
        <h3 class="about-feature-card__title">Algebraic Effects</h3>
        <p class="about-feature-card__desc">Structured, resumable effects with handlers</p>
      </div>
    </div>
  </section>

  <section class="about-stats">
    <h2 class="about-section-title">Built-in Reference</h2>
    <div class="about-stats__grid">
      <div class="about-stat-card">
        <span class="about-stat-card__icon">${coreIcon}</span>
        <span class="about-stat-card__value">${coreCount}</span>
        <span class="about-stat-card__label">Core Functions</span>
      </div>
      <div class="about-stat-card">
        <span class="about-stat-card__icon">${moduleIcon}</span>
        <span class="about-stat-card__value">${moduleCount}</span>
        <span class="about-stat-card__label">Modules</span>
      </div>
      <div class="about-stat-card">
        <span class="about-stat-card__icon">${effectIcon}</span>
        <span class="about-stat-card__value">${effectCount}</span>
        <span class="about-stat-card__label">Effects</span>
      </div>
    </div>
  </section>
</div>`.trim()
}

