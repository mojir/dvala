/**
 * Renders the home/start page (/).
 */

import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderStartPage(): string {
  const version = window.referenceData?.version ?? ''

  return `
<div class="content-page start-page">
  <div class="content-page__header">
    <img src="images/dvala-logo.png" alt="Dvala" class="start-page__logo">
    <h1 class="start-page__title">Dvala Playground</h1>
    ${version ? `<div class="start-page__version">v${escapeHtml(version)}</div>` : ''}
    <p class="start-page__tagline">A pure functional language that runs in the browser.</p>
  </div>
  <div class="content-page__body start-page__body">
    <nav class="start-page__nav">
      <a class="start-page__nav-link" href="${href('/tutorials')}">Tutorials</a>
      <a class="start-page__nav-link" href="${href('/core')}">Core API</a>
      <a class="start-page__nav-link" href="${href('/modules')}">Modules</a>
      <a class="start-page__nav-link" href="${href('/examples')}">Examples</a>
    </nav>
  </div>
</div>`.trim()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
