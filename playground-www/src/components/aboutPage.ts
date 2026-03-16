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

const featureIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"/></svg>'
const effectIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>'
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
        <span class="about-feature-card__icon">${featureIcon}</span>
        <h3 class="about-feature-card__title">Pure by Default</h3>
        <p class="about-feature-card__desc">No side effects without explicit effect handlers</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${featureIcon}</span>
        <h3 class="about-feature-card__title">Expression-Oriented</h3>
        <p class="about-feature-card__desc">Every construct returns a value</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${featureIcon}</span>
        <h3 class="about-feature-card__title">Immutable Data</h3>
        <p class="about-feature-card__desc">All values are immutable by design</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${featureIcon}</span>
        <h3 class="about-feature-card__title">Tail-Call Optimised</h3>
        <p class="about-feature-card__desc">Deep recursion without stack overflow</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${effectIcon}</span>
        <h3 class="about-feature-card__title">Algebraic Effects</h3>
        <p class="about-feature-card__desc">Structured, resumable effects with handlers</p>
      </div>
      <div class="about-feature-card">
        <span class="about-feature-card__icon">${featureIcon}</span>
        <h3 class="about-feature-card__title">Suspend & Resume</h3>
        <p class="about-feature-card__desc">Serialize program state and resume later</p>
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

