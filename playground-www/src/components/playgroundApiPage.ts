/**
 * Renders the Playground API reference page (/playground-api).
 * Lists all playground.* effects with their signatures and descriptions.
 */

import { tokenizeToHtml } from '../SyntaxOverlay'
import { getPageHeader } from '../utils'

interface EffectEntry {
  name: string
  args: string
  returns: string
  description: string
}

interface EffectGroup {
  title: string
  prefix: string
  effects: EffectEntry[]
}

const groups: EffectGroup[] = [
  {
    title: 'UI',
    prefix: 'playground.ui',
    effects: [
      { name: 'playground.ui.showToast', args: 'message: string, level?: "info" | "success" | "warning" | "error"', returns: 'nil', description: 'Show a toast notification. Rate-limited to one per 200ms.' },
      { name: 'playground.ui.setTheme', args: 'theme: "light" | "dark"', returns: 'nil', description: 'Switch the playground theme.' },
      { name: 'playground.ui.highlight', args: 'id: string', returns: 'nil', description: 'Highlight a UI element by data-playground-id (pulse animation). Fails if not found.' },
      { name: 'playground.ui.click', args: 'id: string', returns: 'nil', description: 'Simulate a click on a UI element by data-playground-id. Fails if not found.' },
    ],
  },
  {
    title: 'Editor',
    prefix: 'playground.editor',
    effects: [
      { name: 'playground.editor.getContent', args: 'none', returns: 'string', description: 'Get the current editor text.' },
      { name: 'playground.editor.setContent', args: 'code: string', returns: 'nil', description: 'Replace the editor content.' },
      { name: 'playground.editor.insertText', args: 'text: string, position?: number', returns: 'nil', description: 'Insert text at a position (defaults to cursor).' },
      { name: 'playground.editor.typeText', args: 'text: string, delayMs?: number', returns: 'nil', description: 'Simulate typing into the editor character by character.' },
      { name: 'playground.editor.getSelection', args: 'none', returns: 'string', description: 'Get the currently selected text in the editor.' },
      { name: 'playground.editor.setSelection', args: 'start: number, end: number', returns: 'nil', description: 'Set the editor selection range.' },
      { name: 'playground.editor.getCursor', args: 'none', returns: 'number', description: 'Get the current cursor position.' },
      { name: 'playground.editor.setCursor', args: 'position: number', returns: 'nil', description: 'Move the cursor to a position.' },
    ],
  },
  {
    title: 'Context',
    prefix: 'playground.context',
    effects: [
      { name: 'playground.context.getContent', args: 'none', returns: 'string', description: 'Get the context panel JSON text.' },
      { name: 'playground.context.setContent', args: 'json: string', returns: 'nil', description: 'Replace the context panel content.' },
    ],
  },
  {
    title: 'Execution',
    prefix: 'playground.exec',
    effects: [
      { name: 'playground.exec.run', args: 'code: string', returns: 'any', description: 'Execute Dvala code and return the result. Times out after 10 seconds.' },
    ],
  },
  {
    title: 'Storage',
    prefix: 'playground.storage',
    effects: [
      { name: 'playground.storage.save', args: 'name: string, code?: string', returns: 'nil', description: 'Save a program. Defaults to current editor content.' },
      { name: 'playground.storage.load', args: 'name: string', returns: 'string', description: 'Load a saved program by name. Fails if not found.' },
      { name: 'playground.storage.list', args: 'none', returns: 'array<string>', description: 'List all saved program names.' },
    ],
  },
  {
    title: 'Router',
    prefix: 'playground.router',
    effects: [
      { name: 'playground.router.goto', args: 'route: string', returns: 'nil', description: 'Navigate to a page (e.g. "settings", "examples", "tutorials/effects").' },
      { name: 'playground.router.back', args: 'none', returns: 'nil', description: 'Navigate back in browser history.' },
    ],
  },
]

export function renderPlaygroundApiPage(): string {
  const sections = groups.map(group => {
    const rows = group.effects.map(e => `
      <tr>
        <td class="playground-api__name"><code>${escapeHtml(e.name)}</code></td>
        <td class="playground-api__args">${escapeHtml(e.args)}</td>
        <td class="playground-api__returns"><code>${escapeHtml(e.returns)}</code></td>
        <td class="playground-api__desc">${escapeHtml(e.description)}</td>
      </tr>`).join('\n')

    return `
<section class="content-page__group">
  <h2 class="content-page__group-title">${escapeHtml(group.title)} <small>(${escapeHtml(group.prefix)}.*)</small></h2>
  <table class="playground-api__table">
    <thead>
      <tr><th>Effect</th><th>Arguments</th><th>Returns</th><th>Description</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`
  }).join('\n')

  const exampleCode = `// Show a toast
perform(effect(playground.ui.showToast), "Hello!", "success");

// Read and modify the editor
let code = perform(effect(playground.editor.getContent));
perform(effect(playground.editor.setContent), "// Modified!\\n" ++ code);

// List saved programs
let programs = perform(effect(playground.storage.list));
perform(effect(dvala.io.println), programs)`

  return `
<div class="content-page">
  ${getPageHeader()}
  <h1 class="content-page__title">Playground API</h1>
  <div class="content-page__body">
    <p class="playground-api__intro">
      These effects let Dvala programs control the playground UI.
      They only work when running inside the playground — not in the CLI or embedded hosts.
      Use <code>perform(effect(name), ...args)</code> to invoke them.
    </p>
    <p class="playground-api__intro">
      Errors are routed through <code>dvala.error</code> and can be caught with effect handlers.
      You can disable these effects in <a href="#" onclick="event.preventDefault();Playground.navigate('/settings')">Settings</a>.
    </p>

    ${sections}

    <section class="content-page__group">
      <h2 class="content-page__group-title">Example</h2>
      <pre class="example-page__code"><code>${tokenizeToHtml(exampleCode)}</code></pre>
    </section>
  </div>
</div>`.trim()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
