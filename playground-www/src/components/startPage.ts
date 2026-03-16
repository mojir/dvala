/**
 * Renders the home/start page (/).
 */

import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'
import { tokenizeToHtml } from '../SyntaxOverlay'
import { infoIcon, labIcon, lampIcon } from '../icons'

const penIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83l3.75 3.75z"/></svg>'
const copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/></svg>'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

const EXAMPLE = `\
// Your shopping cart
let prices = [12.99, 5.49, 8.00, 22.50, 3.99];

// Ask for a discount code via an effect (suspendable IO)
let code = perform(effect(dvala.io.read-line), "Enter discount code (SAVE10 / SAVE20):");

// Pattern match the code to a discount rate
let discount = match code
  case "SAVE10" then 0.10
  case "SAVE20" then 0.20
  case _ then 0
end;

// Apply discount, sum, and round — all in a pipeline
let total = prices
  |> map(_, -> $ * (1 - discount))
  |> sum
  |> _ round 2;

let saved-amount = sum(prices) - total |> _ round 2;
perform(effect(dvala.io.println),
  "Total: $" ++ str(total) ++
  cond
    case saved-amount > 0 then " (You saved $" ++ str(saved-amount) ++ ")"
    case true then " (No discount applied)"
  end
);`

export function renderStartPage(): string {
  const encoded = btoa(encodeURIComponent(EXAMPLE))

  return `
<div class="content-page start-page">
  <div class="content-page__header start-page__header">
    <img src="images/dvala-logo.png" alt="Dvala" class="start-page__logo">
    <p class="start-page__tagline">Run anywhere - Resume everywhere</p>
    <p class="start-page__subtitle">A suspendable, time-traveling functional language for JavaScript</p>
  </div>
  <div class="content-page__body start-page__body">
    <nav class="start-page__nav">
      <a class="start-page__nav-link" href="${href('/about')}" onclick="event.preventDefault();Playground.navigate('/about')">
        <span class="start-page__nav-icon">${infoIcon}</span>
        <span>About Dvala</span>
      </a>
      <a class="start-page__nav-link" href="${href('/tutorials')}" onclick="event.preventDefault();Playground.navigate('/tutorials')">
        <span class="start-page__nav-icon">${lampIcon}</span>
        <span>Tutorials</span>
      </a>
      <a class="start-page__nav-link" href="${href('/examples')}" onclick="event.preventDefault();Playground.navigate('/examples')">
        <span class="start-page__nav-icon">${labIcon}</span>
        <span>Examples</span>
      </a>
    </nav>

    <div class="start-page__example-section">
      <p class="start-page__example-label">Here is a taste of Dvala - <a class="start-page__example-try" onclick="Playground.loadEncodedCode('${encoded}')">Try it now</a></p>
      <div class="doc-page__example">
        <div class="doc-page__example-code-wrap">
          <pre class="doc-page__example-code"><code>${tokenizeToHtml(EXAMPLE)}</code></pre>
          <div class="doc-page__example-action-bar">
            <button class="doc-page__example-action-btn" title="Load in editor" onclick="Playground.loadEncodedCode('${encoded}')">${penIcon}</button>
            <button class="doc-page__example-action-btn" title="Copy" onclick="Playground.copyCode('${encoded}')">${copyIcon}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`.trim()
}

