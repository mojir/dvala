/**
 * Renders the About page (/about).
 */

import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'
import { getPageHeader } from '../utils'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderAboutPage(): string {
  const data = window.referenceData
  const coreCount = data ? Object.keys(data.api).length : 0
  const moduleCount = data ? Object.keys(data.modules).length : 0

  return `
<div class="content-page about-page">
  ${getPageHeader()}
  <h1 class="content-page__title">About</h1>
  <div class="content-page__body">
    <section class="about-page__section">
      <h2 class="about-page__section-title">What is Dvala?</h2>
      <p class="about-page__text">
        Dvala is a pure functional expression language that runs in the browser and in Node.js.
        It is designed to be embedded in applications as a safe, sandboxed scripting layer.
      </p>
    </section>

    <section class="about-page__section">
      <h2 class="about-page__section-title">Key Properties</h2>
      <ul class="about-page__list">
        <li>Pure by default — no side effects without explicit effect handlers</li>
        <li>Expression-oriented — every construct returns a value</li>
        <li>Immutable data — all values are immutable</li>
        <li>Tail-call optimised — deep recursion without stack overflow</li>
        <li>Algebraic effects — structured, resumable effects</li>
        <li>Lexically scoped — predictable variable resolution</li>
      </ul>
    </section>

    <section class="about-page__section">
      <h2 class="about-page__section-title">Reference</h2>
      <ul class="about-page__list">
        ${coreCount ? `<li>${coreCount} core built-in functions and special forms</li>` : ''}
        ${moduleCount ? `<li>${moduleCount} standard library modules</li>` : ''}
      </ul>
    </section>

    <section class="about-page__section">
      <h2 class="about-page__section-title">Explore</h2>
      <nav class="start-page__nav">
        <a class="start-page__nav-link" href="${href('/tutorials')}" onclick="event.preventDefault();Playground.navigate('/tutorials')">Tutorials</a>
        <a class="start-page__nav-link" href="${href('/core')}" onclick="event.preventDefault();Playground.navigate('/core')">Core API</a>
        <a class="start-page__nav-link" href="${href('/modules')}" onclick="event.preventDefault();Playground.navigate('/modules')">Modules</a>
        <a class="start-page__nav-link" href="${href('/examples')}" onclick="event.preventDefault();Playground.navigate('/examples')">Examples</a>
      </nav>
    </section>
  </div>
</div>`.trim()
}

