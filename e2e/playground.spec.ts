/**
 * Playwright E2E tests for the Dvala Playground.
 *
 * These tests run in a real headless browser against the built playground site.
 * They are intentionally slim and decoupled from specific styling/layout so they
 * stay resilient as the playground evolves.
 *
 * Run:  npx playwright test
 * Debug: npx playwright test --headed
 */
import { type Page, expect, test } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the playground to fully initialize (wrapper becomes display:block). */
async function waitForInit(page: Page) {
  await page.waitForFunction(
    () => {
      const wrapper = document.getElementById('wrapper')
      return wrapper && wrapper.style.display === 'block'
    },
    { timeout: 4_500 },
  )
}

/** Navigate to the playground (editor) tab so the editor is visible. */
async function navigateToPlayground(page: Page) {
  await page.evaluate(() => (window as any).Playground.navigateToTab('editor'))
  await page.locator('#dvala-editor-host').waitFor({ state: 'visible', timeout: 3000 })
}

/** Get the current editor contents. */
async function getDvalaCode(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).Playground.getEditorValue())
}

/** Replace the editor contents and trigger the playground's change handlers. */
async function setDvalaCode(page: Page, code: string) {
  await navigateToPlayground(page)
  await page.evaluate(c => (window as any).Playground.setEditorValue(c), code)
}

/** Move the editor cursor to the given absolute character offset. */
async function setEditorCursor(page: Page, position: number) {
  await page.evaluate(offset => (window as any).Playground.setEditorCursor(offset), position)
}

/**
 * Set the legacy `state['context']` JSON blob via the playground's test-only
 * setter. Phase 1.5 step 23f retired the Bindings UI; the `state['context']`
 * slot remains as a backing store for the `playground.context.*` effect API
 * and for transient example handler injection.
 */
async function setContext(page: Page, json: string) {
  await page.evaluate((contextJson: string) => {
    ;(window as any).Playground.setContextForTesting(contextJson)
  }, json)
}

/** Click the Run button in the editor toolbar. */
async function clickRun(page: Page) {
  await page.locator('#run-btn').click()
}

/** Wait for output to appear in the output panel. */
async function waitForOutput(page: Page, timeout = 5000) {
  await page.locator('#output-result').locator('span').first().waitFor({ timeout })
}

/** Get all text content of the output panel. */
async function getOutputText(page: Page): Promise<string> {
  return (await page.locator('#output-result').textContent()) ?? ''
}

/** Trigger Monaco suggestions and wait for the suggest widget to appear. */
async function openEditorSuggestions(page: Page) {
  await focusEditor(page)
  await page.keyboard.press('Control+Space')
  await waitForEditorSuggestions(page)
}

async function focusEditor(page: Page) {
  const editorInput = page.getByRole('textbox', { name: 'Editor content' })
  await page.locator('#dvala-editor-host').click({ position: { x: 40, y: 20 } })
  await page.evaluate(() => (window as any).Playground.focusDvalaCode())
  await expect(editorInput).toBeFocused()
}

/** Wait for Monaco suggestions to appear without manual invocation. */
async function waitForEditorSuggestions(page: Page) {
  await expect
    .poll(
      async () => {
        const widgets = page.locator('.suggest-widget')
        const count = await widgets.count()
        for (let i = 0; i < count; i++) {
          if (await widgets.nth(i).isVisible()) return true
        }
        return false
      },
      { timeout: 5000 },
    )
    .toBe(true)
}

function visibleSuggestionWidget(page: Page) {
  return page.locator('.suggest-widget:visible').last()
}

/** Wait for Monaco parameter hints to appear. */
async function waitForSignatureHelp(page: Page) {
  await page.locator('.parameter-hints-widget').waitFor({ state: 'visible', timeout: 3000 })
}

/** Wait for Monaco hover to appear. */
async function waitForHover(page: Page, position?: number) {
  if (position === undefined) {
    await page.locator('.monaco-hover').waitFor({ state: 'visible', timeout: 3000 })
    return
  }

  await expect
    .poll(
      async () => {
        await page.evaluate(offset => (window as any).Playground.triggerHoverForTesting(offset), position)
        const hover = page.locator('.monaco-hover')
        if (!(await hover.isVisible())) return ''
        return ((await hover.textContent()) ?? '').trim()
      },
      { timeout: 3000 },
    )
    .not.toBe('')
}

/** Read the first workspace file's id from its `data-file-id` attribute. */
async function firstWorkspaceFileId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const item = document.querySelector<HTMLElement>('#explorer-file-list .explorer-item[data-file-id]')
    return item?.dataset['fileId'] ?? null
  })
}

/**
 * Modifier name to drive Monaco's `KeyMod.CtrlCmd`-bound shortcuts via
 * Playwright. Monaco picks the modifier from `navigator.platform`, which
 * mirrors the host OS in headless Chromium — so the test process's OS
 * (`Meta` on Mac, `Control` elsewhere) is the right discriminator.
 */
const MONACO_CMD_MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('playground loads', () => {
  test('page title and main elements are visible', async ({ page }) => {
    await page.goto('')
    await expect(page).toHaveTitle(/Dvala/)

    // Wrapper becomes visible after JS init
    await waitForInit(page)
    // Tab bar navigation exists
    await expect(page.locator('#tab-bar')).toBeVisible()
    // Navigate to playground tab to verify editor elements
    await navigateToPlayground(page)
    await expect(page.locator('#tab-editor')).toBeVisible()
    await expect(page.locator('#dvala-editor-host')).toBeVisible()
    await expect(page.locator('#output-result')).toBeVisible()
  })
})

test.describe('code execution', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    // Reset playground to clean state
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('runs simple arithmetic and shows result', async ({ page }) => {
    await setDvalaCode(page, '10 + 20')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('30')
  })

  test('runs code with context effect handler', async ({ page }) => {
    await setContext(
      page,
      '{"effectHandlers": [{"pattern": "host.add", "handler": "async ({ arg: [a, b], resume }) => { resume(a + b) }"}]}',
    )
    await setDvalaCode(page, 'perform(@host.add, [15, 27])')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')
  })

  test('shows error for invalid code', async ({ page }) => {
    await setDvalaCode(page, '(+ 1')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output.toLowerCase()).toContain('error')
  })

  test('handlers buffer wraps user code as a boundary effect handler (Phase 1.5 step 23e)', async ({ page }) => {
    // Stage a `linear handler` in `.dvala-playground/handlers.dvala` and run
    // scratch code that performs the matching effect. The boundary wrap
    // should turn `perform(@x, 21)` into 42 without the user writing
    // `do with` themselves. `linear handler` is the recommended shape for
    // handlers buffers — host-style dispatch (single-shot resume,
    // barrier-free reach into parallel branches).
    await page.evaluate(() => {
      ;(window as any).Playground.setHandlersCodeForTesting('linear handler @x(v) -> v * 2 end')
    })
    await setDvalaCode(page, 'perform(@x, 21)')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')

    // Reset for downstream tests — empty handlers buffer means no wrap.
    await page.evaluate(() => (window as any).Playground.setHandlersCodeForTesting(''))
  })

  test('runs via Ctrl+R keyboard shortcut', async ({ page }) => {
    await setDvalaCode(page, '2 * 21')
    // Focus the Monaco editor, then dispatch the Ctrl+R global shortcut.
    await page.evaluate(() => (window as any).Playground.focusDvalaCode())
    await page.keyboard.press('Control+r')
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')
  })
})

test.describe('toolbar actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('analyze detects undefined symbols', async ({ page }) => {
    await setDvalaCode(page, 'unknownSymbol')
    // Open more menu and click Analyze
    await page.evaluate(() => (window as any).Playground.analyze())
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('Unresolved symbols')
    expect(output).toContain('unknownSymbol')
  })

  test('tokenize opens the right panel Tokens tab', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.tokenize())

    // Tokenize used to dump JSON into the Output channel. It now renders
    // into the right panel's Tokens tab — same treatment as parse().
    const tokensBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="tokens"]')
    await expect(tokensBody).toBeVisible({ timeout: 3000 })
    const text = await tokensBody.textContent()
    // Token type strings (e.g. "Number") are visible at the default
    // expand depth of 2 — tokens are arrays of [type, value, position].
    expect(text).toContain('Number')
  })

  test('parse opens the right panel AST tab', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())

    // The AST viewer renders into the right panel's `ast` tab body (used
    // to be a modal); the panel un-collapses when parse() runs.
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible({ timeout: 3000 })

    const text = await astBody.textContent()
    // AST nodes are 3-tuples; default expand depth of 2 surfaces the
    // type string ("Call") inline. "Num" lives one level deeper and is
    // only visible after the user expands a child node.
    expect(text).toContain('Call')
  })

  test('reset playground clears everything', async ({ page }) => {
    await setDvalaCode(page, 'some code')
    await setContext(page, '{"bindings":{}}')

    await page.evaluate(() => (window as any).Playground.resetPlayground())

    const dvalaValue = await getDvalaCode(page)
    const contextValue = await page.evaluate(() => localStorage.getItem('playground-context'))
    const outputHtml = await page.locator('#output-result').innerHTML()

    expect(dvalaValue).toBe('')
    // resetPlayground writes an empty string to state['context']; localStorage
    // stores the value JSON-stringified, so the persisted form is `'""'`.
    expect(contextValue).toBe('""')
    expect(outputHtml).toBe('')
  })
})

test.describe('editor completions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('shows completions for in-scope user-defined symbols', async ({ page }) => {
    const code = 'let localValue = 1;\nloc'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await openEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('localValue')
  })

  test('shows completions automatically while typing in code', async ({ page }) => {
    await setDvalaCode(page, 'let localValue = 1;\n')
    await setEditorCursor(page, 'let localValue = 1;\n'.length)

    await focusEditor(page)
    await page.keyboard.type('loc', { delay: 50 })

    await waitForEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('localValue')
  })

  test('shows workspace import path completions inside import strings', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'utils-file',
          path: 'utils.dvala',
          code: 'let value = 1; { value }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'main-file',
          path: 'main.dvala',
          code: '',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('main-file')
    })

    const code = 'let { value } = import("./ut'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await openEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('./utils')
  })

  test('shows import completions immediately after opening the import string', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'math-file',
          path: 'lib/math.dvala',
          code: 'let add = (a, b) => a + b; { add }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'main-file',
          path: 'main.dvala',
          code: '',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('main-file')
    })

    const code = 'let math = import("'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await openEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('functional')
    await expect(visibleSuggestionWidget(page)).toContainText('./lib/')
    await expect(visibleSuggestionWidget(page)).not.toContainText('!=')
  })

  test('shows folder completions for nested workspace imports', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'math-file',
          path: 'lib/math.dvala',
          code: 'let add = (a, b) => a + b; { add }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'main-file',
          path: 'main.dvala',
          code: '',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('main-file')
    })

    const code = 'let math = import("./l'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await openEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('./lib/')
  })

  test('shows import completions automatically while typing in strings', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'math-file',
          path: 'lib/math.dvala',
          code: 'let add = (a, b) => a + b; { add }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'main-file',
          path: 'main.dvala',
          code: '',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('main-file')
    })

    const code = 'let math = import("'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await focusEditor(page)
    await page.keyboard.type('./l', { delay: 50 })

    await waitForEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('./lib/')
  })

  test('shows exported symbols from already imported workspace files', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'utils-file',
          path: 'utils.dvala',
          code: 'let value = 1; { value }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'main-file',
          path: 'main.dvala',
          code: '',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('main-file')
    })

    const code = 'let utils = import("./utils");\nvalu'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    await openEditorSuggestions(page)

    await expect(visibleSuggestionWidget(page)).toContainText('value')
  })
})

test.describe('signature help', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('shows parameter hints for user-defined functions', async ({ page }) => {
    const code = 'let add = (a, b) => a + b;\nadd('
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    const triggered = await page.evaluate(() => (window as any).Playground.triggerSignatureHelpForTesting())
    expect(triggered).toBe(true)

    await waitForSignatureHelp(page)

    await expect(page.locator('.parameter-hints-widget')).toContainText('add(a, b)')
  })

  test('shows parameter hints for builtin functions', async ({ page }) => {
    const code = 'map('
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    const triggered = await page.evaluate(() => (window as any).Playground.triggerSignatureHelpForTesting())
    expect(triggered).toBe(true)

    await waitForSignatureHelp(page)

    await expect(page.locator('.parameter-hints-widget')).toContainText('map(colls: collection, fun: function)')
  })
})

test.describe('hover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('shows builtin docs in hover', async ({ page }) => {
    const code = 'map'
    await setDvalaCode(page, code)

    const position = 1
    const shown = await page.evaluate(offset => (window as any).Playground.triggerHoverForTesting(offset), position)
    expect(shown).toBe(true)

    await waitForHover(page, position)

    await expect(page.locator('.monaco-hover')).toContainText('map')
    await expect(page.locator('.monaco-hover')).toContainText('Creates a new collection populated')
  })

  test('shows inferred type for local symbols in hover', async ({ page }) => {
    const code = 'let localValue = 1;\nlocalValue'
    await setDvalaCode(page, code)
    await setEditorCursor(page, code.length)

    const position = 'let localValue = 1;\n'.length + 1
    const shown = await page.evaluate(offset => (window as any).Playground.triggerHoverForTesting(offset), position)
    expect(shown).toBe(true)

    await waitForHover(page, position)

    await expect(page.locator('.monaco-hover')).toContainText('1 : Number')
    await expect(page.locator('.monaco-hover')).toContainText('Defined at <scratch>:1:5')
  })

  test('hover uses the latest editor version after an immediate edit', async ({ page }) => {
    await setDvalaCode(page, 'let localValue = 1;\nlocalValue')
    await setDvalaCode(page, 'let localValue = "x";\nlocalValue')

    const position = 'let localValue = "x";\n'.length + 1
    const shown = await page.evaluate(offset => (window as any).Playground.triggerHoverForTesting(offset), position)
    expect(shown).toBe(true)

    await waitForHover(page, position)

    await expect(page.locator('.monaco-hover')).toContainText('"x" : String')
    await expect(page.locator('.monaco-hover')).not.toContainText('1 : Number')
  })
})

test.describe('language service navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('resolves go-to-definition for a local symbol', async ({ page }) => {
    await setDvalaCode(page, 'let value = 1; value + value')

    const defs = await page.evaluate(() =>
      (window as any).Playground.getDefinitionsAtCursorForTesting('let value = 1; '.length),
    )
    expect(defs).toHaveLength(1)
    expect(defs[0].uri).toContain('/.dvala-playground/scratch.dvala')
    expect(defs[0].range.startLineNumber).toBe(1)
    expect(defs[0].range.startColumn).toBe(5)
  })

  test('resolves go-to-definition for an import path string', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'data-file',
          path: 'data.dvala',
          code: 'let x = 99; { x }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
    })

    const code = 'let d = import("./data"); d.x'
    await setDvalaCode(page, code)

    const defs = await page.evaluate(() =>
      (window as any).Playground.getDefinitionsAtCursorForTesting('let d = import("./d'.length),
    )
    expect(defs).toHaveLength(1)
    expect(defs[0].uri).toContain('/data.dvala')
    expect(defs[0].range.startLineNumber).toBe(1)
    expect(defs[0].range.startColumn).toBe(1)
  })

  test('go-to-definition command on an import path opens the target file', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'data-file',
          path: 'data.dvala',
          code: 'let x = 99; { x }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
    })

    const code = 'let d = import("./data"); d.x'
    await setDvalaCode(page, code)
    await page.evaluate(
      offset => (window as any).Playground.goToDefinitionAtOffsetForTesting(offset),
      'let d = import("./d'.length,
    )

    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('data.dvala')
    await expect.poll(() => page.evaluate(() => (window as any).Playground.getEditorValue())).toBe('let x = 99; { x }')
  })

  test('browser-safe go-to-definition shortcut opens the target file', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'data-file',
          path: 'data.dvala',
          code: 'let x = 99; { x }',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
    })

    const code = 'let d = import("./data"); d.x'
    await setDvalaCode(page, code)
    await setEditorCursor(page, 'let d = import("./d'.length)
    await page.evaluate(() => (window as any).Playground.focusDvalaCode())

    const modifier = await page.evaluate(() => (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'))
    await page.keyboard.press(`${modifier}+Alt+D`)

    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('data.dvala')
    await expect.poll(() => page.evaluate(() => (window as any).Playground.getEditorValue())).toBe('let x = 99; { x }')
  })

  test('switching to a same-content file rebinds go-to-definition to the active file', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'a-file',
          path: 'a.dvala',
          code: 'let value = 1; value',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'b-file',
          path: 'b.dvala',
          code: 'let value = 1; value',
          context: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ])
      ;(window as any).Playground.loadWorkspaceFile('a-file')
      ;(window as any).Playground.loadWorkspaceFile('b-file')
    })

    const defs = await page.evaluate(() =>
      (window as any).Playground.getDefinitionsAtCursorForTesting('let value = 1; '.length),
    )
    expect(defs).toHaveLength(1)
    expect(defs[0].uri).toContain('/b.dvala')
    expect(defs[0].range.startLineNumber).toBe(1)
    expect(defs[0].range.startColumn).toBe(5)
  })

  test('finds references and rename edits for a local symbol', async ({ page }) => {
    await setDvalaCode(page, 'let value = 1; value + value')

    const position = 'let value = 1; '.length
    const refs = await page.evaluate(
      offset => (window as any).Playground.getReferencesAtCursorForTesting(offset),
      position,
    )
    expect(refs).toHaveLength(3)
    expect(refs.every((ref: { uri: string }) => ref.uri.endsWith('scratch.dvala'))).toBe(true)

    const edits = await page.evaluate(
      ({ offset }) => (window as any).Playground.getRenameEditsAtCursorForTesting(offset, 'renamedAnswer'),
      { offset: position },
    )
    expect(edits).toHaveLength(3)
    expect(edits.every((edit: { text: string }) => edit.text === 'renamedAnswer')).toBe(true)
    expect(edits.every((edit: { resource: string }) => edit.resource.endsWith('scratch.dvala'))).toBe(true)
  })

  test('formats the active editor through the document formatting provider', async ({ page }) => {
    await setDvalaCode(page, '1+2')

    const formatted = await page.evaluate(() => (window as any).Playground.getFormattedEditorValueForTesting())
    expect(formatted).toBe('1 + 2;\n')
  })
})

test.describe('navigation', () => {
  test('tab bar links navigate to content pages', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Click the Examples tab in the top tab bar
    await page.locator('#tab-bar').getByText('Examples').click()

    // The examples page should be rendered into #dynamic-page
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
    // Check that URL contains /examples
    expect(page.url()).toContain('/examples')
  })

  test('navigating via path shows correct page', async ({ page }) => {
    await page.goto('/examples')
    await waitForInit(page)
    // The examples page should be rendered into #dynamic-page
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
  })
})

test.describe('search', () => {
  test('opens search from header button, types, and closes with Escape', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Open search via header button
    await page.locator('#tab-btn-search').click()
    await expect(page.locator('#unified-search-dropdown')).toBeVisible()

    // Type a search query
    await page.locator('#unified-search-dropdown .chapter-search-input').fill('map')
    // Results should appear
    await expect(page.locator('#unified-search-dropdown .chapter-search-result').first()).toBeVisible()

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(page.locator('#unified-search-dropdown')).toBeHidden()
  })

  test('opens search with Ctrl+K shortcut', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    await page.keyboard.press('Control+k')
    await expect(page.locator('#unified-search-dropdown')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('#unified-search-dropdown')).toBeHidden()
  })
})

test.describe('examples', () => {
  test('loading an example populates code and context', async ({ page }) => {
    test.setTimeout(10_000)
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    // Navigate to examples page via router
    await page.evaluate(() => (window as any).Playground.navigate('/examples'))

    // Wait for the examples page to render in #dynamic-page
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.querySelector('.book-page') !== null
      },
      { timeout: 5000 },
    )

    // Click the first "Load in playground" button
    const loadButton = page.locator('#dynamic-page [onclick*="Playground.setPlayground"]').first()
    await loadButton.waitFor({ timeout: 3000 })
    await loadButton.click()

    // Code should be populated in the editor
    const dvalaValue = await getDvalaCode(page)
    expect(dvalaValue.length).toBeGreaterThan(0)
  })
})

test.describe('state persistence', () => {
  test('code persists across page reload', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    const code = 'let test-persist = 42; test-persist'
    await setDvalaCode(page, code)

    // Reload and navigate back to playground tab
    await page.reload()
    await waitForInit(page)
    await navigateToPlayground(page)

    const dvalaValue = await getDvalaCode(page)
    expect(dvalaValue).toBe(code)
  })
})

test.describe('share', () => {
  test('share generates a link with encoded state', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await navigateToPlayground(page)

    await setDvalaCode(page, '1 + 1')

    // share() writes the URL to clipboard — intercept clipboard.writeText to capture it
    const shareUrl = await page.evaluate(async () => {
      let captured = ''
      navigator.clipboard.writeText = async (text: string) => {
        captured = text
      }
      ;(window as any).Playground.share()
      // Allow the async clipboard promise to resolve
      await new Promise(r => setTimeout(r, 50))
      return captured
    })

    expect(shareUrl).toContain('/editor?')
    expect(shareUrl).toContain('state=')

    // Verify the encoded state round-trips back to the original code
    const stateParam = new URL(shareUrl).searchParams.get('state')
    expect(stateParam).toBeTruthy()
    const decoded = JSON.parse(decodeURIComponent(atob(stateParam!))) as { 'dvala-code': string }
    expect(decoded['dvala-code']).toBe('1 + 1')
  })

  test('opening a ?state= URL restores code and context', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    // Build an encoded state URL the same way the playground does
    const code = '99 + 1'
    const context = '{"bindings":{"z":7}}'
    const encodedState = await page.evaluate(
      ({ c, ctx }) => {
        return btoa(encodeURIComponent(JSON.stringify({ 'dvala-code': c, context: ctx })))
      },
      { c: code, ctx: context },
    )

    await page.goto(`?state=${encodedState}`)
    await waitForInit(page)
    await navigateToPlayground(page)

    const dvalaValue = await getDvalaCode(page)
    expect(dvalaValue).toBe(code)

    // The Bindings UI was retired in Phase 1.5 step 23f; read the context
    // backing slot directly via the playground's reactive state singleton
    // exposed for testing.
    const contextValue = await page.evaluate(() => {
      const stored = localStorage.getItem('playground-context')
      return stored ? (JSON.parse(stored) as string) : ''
    })
    expect(contextValue).toBe(context)
  })
})

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

test.describe('snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('importing a valid snapshot opens it in the snapshot view', async ({ page }) => {
    await setDvalaCode(page, 'perform(@dvala.checkpoint, "before"); 40 + 2')
    await clickRun(page)
    await waitForOutput(page)

    const snapshotJson = await page.evaluate(() => {
      const snapshots = (window as any).Playground.getTerminalSnapshotsForTesting()
      return JSON.stringify(snapshots[0].snapshot)
    })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.evaluate(() => (window as any).Playground.openImportSnapshotModal())
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'snapshot.json',
      mimeType: 'application/json',
      buffer: Buffer.from(snapshotJson),
    })

    await expect(page.locator('#toast-container')).toContainText('Snapshot imported', { timeout: 3000 })
    await expect(page.locator('#dvala-snapshot-view')).toBeVisible({ timeout: 3000 })
  })

  test('importing a snapshot with malformed embedded checkpoints shows the import error modal', async ({ page }) => {
    await setDvalaCode(page, 'perform(@dvala.checkpoint, "before"); 40 + 2')
    await clickRun(page)
    await waitForOutput(page)

    const invalidSnapshotJson = await page.evaluate(() => {
      const snapshots = (window as any).Playground.getTerminalSnapshotsForTesting()
      const imported = JSON.parse(JSON.stringify(snapshots[0].snapshot))
      if (imported.continuation?.snapshots?.[0]) {
        imported.continuation.snapshots[0].continuation = {}
      }
      return JSON.stringify(imported)
    })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.evaluate(() => (window as any).Playground.openImportSnapshotModal())
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'invalid-snapshot.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidSnapshotJson),
    })

    await expect(page.locator('#snapshot-modal')).toContainText('Import failed', { timeout: 3000 })
    await expect(page.locator('#snapshot-modal')).toContainText('Not a valid snapshot object.')
  })

  test('running code creates a terminal snapshot in the side panel', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await clickRun(page)
    await waitForOutput(page)

    // Switch to snapshots side tab to see the new terminal snapshot
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    const snapshotsList = page.locator('#side-snapshots-list')
    await expect(snapshotsList).toBeVisible()

    // At least one explorer item should exist
    await expect(snapshotsList.locator('.explorer-item').first()).toBeVisible({ timeout: 3000 })
  })

  test('saving a terminal snapshot adds it to the saved section', async ({ page }) => {
    await setDvalaCode(page, '3 + 3')
    await clickRun(page)
    await waitForOutput(page)

    // Save the first terminal snapshot
    await page.evaluate(() => (window as any).Playground.saveTerminalSnapshotToSaved(0))

    // Switch to snapshots side tab and verify a saved item exists
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    const snapshotsList = page.locator('#side-snapshots-list')
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#side-snapshots-list .explorer-item')
        return items.length > 0
      },
      { timeout: 5000 },
    )
    await expect(snapshotsList.locator('.explorer-item').first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('disable auto checkpoint toggle persists across reload', async ({ page }) => {
    // Toggle is now in the settings dropdown — open it via JS to access the checkbox
    await page.evaluate(() => {
      const btn = document.getElementById('tab-btn-settings') as HTMLElement | null
      if (btn) (window as any).Playground.toggleSettingsDropdown(btn)
    })
    await expect(page.locator('#settings-dropdown')).toBeVisible()

    const toggle = page.locator('#settings-auto-checkpoint-toggle')
    const wasChecked = await toggle.isChecked()

    // The checkbox is visually hidden — use the JS function to toggle
    await page.evaluate(() => (window as any).Playground.toggleAutoCheckpoint())
    expect(await toggle.isChecked()).toBe(!wasChecked)

    // Reload and verify it persisted
    await page.reload()
    await waitForInit(page)
    const toggleAfter = page.locator('#settings-auto-checkpoint-toggle')
    expect(await toggleAfter.isChecked()).toBe(!wasChecked)

    // Restore original state
    await page.evaluate(() => (window as any).Playground.toggleAutoCheckpoint())
  })

  test('debug toggle persists across reload', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.getElementById('tab-btn-settings') as HTMLElement | null
      if (btn) (window as any).Playground.toggleSettingsDropdown(btn)
    })
    await expect(page.locator('#settings-dropdown')).toBeVisible()

    const toggle = page.locator('#settings-debug-toggle')
    const wasChecked = await toggle.isChecked()

    await page.evaluate(() => (window as any).Playground.toggleDebug())
    expect(await toggle.isChecked()).toBe(!wasChecked)

    await page.reload()
    await waitForInit(page)

    const toggleAfter = page.locator('#settings-debug-toggle')
    expect(await toggleAfter.isChecked()).toBe(!wasChecked)

    await page.evaluate(() => (window as any).Playground.toggleDebug())
  })

  test('intercept checkpoint opens checkpoint modal when program performs checkpoint', async ({ page }) => {
    // Enable intercept effects (main toggle) and intercept checkpoint
    const wasInterceptEffectsEnabled = await page.evaluate(() => {
      const el = document.getElementById('settings-intercept-effects-toggle') as HTMLInputElement | null
      return el?.checked ?? false
    })
    const wasCheckpointEnabled = await page.evaluate(() => {
      const el = document.getElementById('settings-checkpoint-toggle') as HTMLInputElement | null
      return el?.checked ?? false
    })

    if (!wasInterceptEffectsEnabled) {
      await page.evaluate(() => (window as any).Playground.toggleInterceptEffects())
    }
    if (!wasCheckpointEnabled) {
      await page.evaluate(() => (window as any).Playground.toggleInterceptCheckpoint())
    }

    await setDvalaCode(page, 'perform(@dvala.checkpoint, "test point")')
    await clickRun(page)

    // Checkpoint panel should open (unified effect panel with "Checkpoint" title)
    await expect(page.locator('#snapshot-panel-container .modal-header')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#snapshot-panel-container')).toContainText('Checkpoint')

    // Clean up — close panel and restore settings
    await page.evaluate(() => (window as any).Playground.closeAllModals())
    if (!wasCheckpointEnabled) {
      await page.evaluate(() => (window as any).Playground.toggleInterceptCheckpoint())
    }
    if (!wasInterceptEffectsEnabled) {
      await page.evaluate(() => (window as any).Playground.toggleInterceptEffects())
    }
  })
})

// ---------------------------------------------------------------------------
// Output panel
// ---------------------------------------------------------------------------

test.describe('output panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('clearing output empties the panel', async ({ page }) => {
    await setDvalaCode(page, '42')
    await clickRun(page)
    await waitForOutput(page)

    expect((await getOutputText(page)).length).toBeGreaterThan(0)

    await page.evaluate(() => (window as any).Playground.resetOutput())
    const html = await page.locator('#output-result').innerHTML()
    expect(html).toBe('')
  })

  test('multiple runs append to output', async ({ page }) => {
    await setDvalaCode(page, '1')
    await clickRun(page)
    await waitForOutput(page)

    await setDvalaCode(page, '2')
    await clickRun(page)

    // Wait for two result spans
    await page.waitForFunction(
      () => {
        const spans = document.querySelectorAll('#output-result span.result')
        return spans.length >= 2
      },
      { timeout: 5000 },
    )

    const output = await getOutputText(page)
    expect(output).toContain('1')
    expect(output).toContain('2')
  })
})

// ---------------------------------------------------------------------------
// API reference navigation
// ---------------------------------------------------------------------------

test.describe('api reference navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
  })

  test('reference index page renders section cards', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.navigate('/ref'))
    await expect(page.locator('.ref-card').first()).toBeVisible()
    await expect(page.locator('.ref-card__title').first()).toContainText('Core API')
  })

  test('clicking a section card navigates to section page', async ({ page }) => {
    // Effects section uses grouped listing with group titles
    await page.evaluate(() => (window as any).Playground.navigate('/ref/effects'))
    await expect(page.locator('.ref-index__group-title').first()).toBeVisible()
  })

  test('search result navigates to correct doc page', async ({ page }) => {
    // Open header search and type 'map'
    await page.locator('#tab-btn-search').click()
    await page.locator('#unified-search-dropdown .chapter-search-input').fill('map')

    // Click first result
    const firstResult = page.locator('#unified-search-dropdown .chapter-search-result').first()
    await firstResult.waitFor({ timeout: 3000 })
    const resultText = await firstResult.textContent()
    await firstResult.click()

    // A doc page should be rendered in #dynamic-page
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
    expect(resultText?.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Files (formerly "Programs")
// ---------------------------------------------------------------------------

/** Save current code as a named file via the saveAs modal. */
async function saveAsFile(page: Page, name: string) {
  await page.evaluate(() => (window as any).Playground.saveAs())
  // The save-as modal has two text inputs (filename + optional folder name).
  // Target the first one (filename) to avoid strict-mode resolution errors.
  const input = page.locator('#snapshot-modal .modal-panel input[type="text"]').first()
  await input.waitFor({ timeout: 2000 })
  await input.fill(name)
  // Click the primary Confirm button (Enter won't submit when there are two inputs).
  await page.locator('#snapshot-modal .modal-panel .button--primary').click()
}

test.describe('files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    // Clear all workspace files to ensure a clean state
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
  })

  test('files side panel shows only scratch when no workspace files exist', async ({ page }) => {
    await navigateToPlayground(page)
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const fileList = page.locator('#explorer-file-list')
    await expect(fileList).toBeVisible()
    // Only the Scratch item should be present, no workspace file cards
    const cards = fileList.locator('.snapshot-card')
    await expect(cards).toHaveCount(0)
  })

  test('saving code creates a file entry in the files panel', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await saveAsFile(page, 'My Test File')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    // Wait for the workspace file to appear as an explorer-item (scratch is always first)
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        // More than 1 item means scratch + at least one workspace file
        return items.length > 1
      },
      { timeout: 5000 },
    )
    const fileList = page.locator('#explorer-file-list')
    await expect(fileList).toContainText('My Test File')
  })

  test('loading a workspace file restores code into editor', async ({ page }) => {
    await setDvalaCode(page, '99 * 2')
    await saveAsFile(page, 'Restore Test')

    // Reset playground (scratch), then click the workspace file item to load it
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        // Two pinned virtual entries ([scratch], [handlers]) plus at least
        // one user-authored file means the file we just saved has rendered.
        return items.length > 2
      },
      { timeout: 5000 },
    )
    // Click the third explorer item (after the pinned [scratch] and [handlers]).
    await page.locator('#explorer-file-list .explorer-item').nth(2).click()

    await navigateToPlayground(page)
    const fileValue = await getDvalaCode(page)
    expect(fileValue).toBe('99 * 2')
  })

  test('deleting a file removes it from the list', async ({ page }) => {
    await setDvalaCode(page, '5 + 5')
    await saveAsFile(page, 'Delete Me')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        return items.length > 1
      },
      { timeout: 5000 },
    )

    // Delete via JS using the first workspace file's data-file-id attribute
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>('#explorer-file-list .explorer-item[data-file-id]')
      const first = items[0]
      const id = first?.dataset['fileId']
      if (id) (window as any).Playground.deleteWorkspaceFile(id)
    })

    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        return items.length === 2 // only the pinned [scratch] + [handlers] entries remain
      },
      { timeout: 5000 },
    )
    // Only the two pinned virtual entries ([scratch], [handlers]) remain.
    await expect(page.locator('#explorer-file-list .explorer-item')).toHaveCount(2)
  })
})

test.describe('error interception', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('intercept-error opens effect modal without infinite loop', async ({ page }) => {
    // Enable intercept-effects and intercept-error via JS API
    // toggleInterceptEffects/Error toggle the boolean state
    await page.evaluate(() => {
      const P = (window as any).Playground
      // Toggle intercept-effects ON
      P.toggleInterceptEffects()
      // Toggle intercept-error ON
      P.toggleInterceptError()
    })

    // Run code that causes a dvala.error
    await setDvalaCode(page, 'sqrt(-1)')
    await clickRun(page)

    // The effect panel should open with dvala.error - if there's an infinite loop,
    // this will timeout
    await expect(page.locator('#snapshot-panel-container .effect-modal__name')).toBeVisible({ timeout: 3000 })

    // Verify it's a dvala.error effect
    const effectName = await page.locator('#snapshot-panel-container .effect-modal__name').textContent()
    expect(effectName).toContain('dvala.error')

    // Mock a response: click "Mock response...", fill value, then Confirm
    await page.getByRole('button', { name: 'Mock response…' }).click()
    await page.locator('.effect-modal__textarea').fill('0')
    await page.getByRole('button', { name: 'Confirm' }).click()

    // Panel should close and output should appear
    await expect(page.locator('#snapshot-panel-container .effect-modal__name')).toBeHidden({ timeout: 2000 })
    await waitForOutput(page)

    // Output should contain the mocked value
    const output = await getOutputText(page)
    expect(output).toContain('0')
  })
})

// ---------------------------------------------------------------------------
// Source maps
// ---------------------------------------------------------------------------

test.describe('source maps', () => {
  // playground.js + .map are large enough that Chromium evicts them from the
  // inspector cache before `response.text()` can read them. Use Playwright's
  // `request` fixture (an APIRequestContext) which fetches outside the page
  // and bypasses the inspector cache.
  test('playground.js contains sourceMappingURL comment', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL ?? ''}/playground.js`)
    expect(response.status()).toBe(200)
    const content = await response.text()
    expect(content).toContain('//# sourceMappingURL=playground.js.map')
  })

  test('playground.js.map is accessible and valid', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL ?? ''}/playground.js.map`)
    expect(response.status()).toBe(200)
    const content = await response.text()
    const map = JSON.parse(content)
    expect(map.version).toBe(3)
    expect(map.file).toBe('playground.js')
    expect(Array.isArray(map.sources)).toBe(true)
    expect(map.sources.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// SEO and Meta Tags
// ---------------------------------------------------------------------------

test.describe('SEO meta tags', () => {
  test('has correct meta description', async ({ page }) => {
    await page.goto('')
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description).toContain('Dvala')
    expect(description).toContain('suspendable')
  })

  test('has Open Graph tags', async ({ page }) => {
    await page.goto('')
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content')
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content')

    expect(ogTitle).toBeTruthy()
    expect(ogDescription).toContain('functional language')
    expect(ogImage).toContain('dvala-logo')
    expect(ogUrl).toContain('dvala')
  })

  test('has Twitter card tags', async ({ page }) => {
    await page.goto('')
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content')
    const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content')

    expect(twitterCard).toBe('summary_large_image')
    expect(twitterTitle).toBeTruthy()
  })

  test('has canonical URL', async ({ page }) => {
    await page.goto('')
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical).toContain('dvala')
  })

  test('has valid JSON-LD structured data', async ({ page }) => {
    await page.goto('')
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent()
    expect(jsonLd).toBeTruthy()

    const data = JSON.parse(jsonLd!)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('SoftwareApplication')
    expect(data.name).toBe('Dvala')
    expect(data.isAccessibleForFree).toBe(true)
  })

  test('page title updates on navigation', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Home page title
    await expect(page).toHaveTitle(/Dvala/)

    // Navigate to the book
    await page.evaluate(() => (window as any).Playground.navigate('/book'))
    await expect(page).toHaveTitle(/The Book.*Dvala/)

    // Navigate to examples
    await page.evaluate(() => (window as any).Playground.navigate('/examples'))
    await expect(page).toHaveTitle(/Examples.*Dvala/)
  })
})

// ---------------------------------------------------------------------------
// Playground effects
// ---------------------------------------------------------------------------

test.describe('playground effects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  // ── UI ──

  test('ui.showToast displays a toast message', async ({ page }) => {
    // Disable auto-checkpoint to avoid extra toasts
    await page.evaluate(() => (window as any).Playground.toggleAutoCheckpoint())
    await setDvalaCode(page, 'perform(@playground.ui.showToast, "Hello from test!")')
    await clickRun(page)
    const toast = page.locator('#toast-container .toast', { hasText: 'Hello from test!' })
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  test('ui.showToast with severity level', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.toggleAutoCheckpoint())
    await setDvalaCode(page, 'perform(@playground.ui.showToast, ["Oops", "error"])')
    await clickRun(page)
    const toast = page.locator('#toast-container .toast-error', { hasText: 'Oops' })
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  // ── Editor ──

  test('editor.getContent returns the actual editor content', async ({ page }) => {
    await setDvalaCode(page, 'do let code = perform(@playground.editor.getContent); slice(code, 0, 6) == "do let" end')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('true')
  })

  test('editor.setContent replaces editor text', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "replaced"); perform(@playground.editor.getContent) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('replaced')
  })

  test('editor.insertText inserts at explicit position', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "hello"); perform(@playground.editor.insertText, [" world", 5]); perform(@playground.editor.getContent) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('hello world')
  })

  test('editor.insertText inserts at cursor when no position given', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "ac"); perform(@playground.editor.setCursor, 1); perform(@playground.editor.insertText, "b"); perform(@playground.editor.getContent) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('abc')
  })

  test('editor.getCursor returns a number', async ({ page }) => {
    await setDvalaCode(page, 'isNumber(perform(@playground.editor.getCursor))')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('true')
  })

  test('editor.setCursor and getCursor round-trip', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "abcdef"); perform(@playground.editor.setCursor, 3); perform(@playground.editor.getCursor) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('3')
  })

  test('editor.setSelection and getSelection round-trip', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "hello world"); perform(@playground.editor.setSelection, [6, 11]); perform(@playground.editor.getSelection) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('world')
  })

  test('editor.getSelection returns empty string when nothing selected', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, "abc"); perform(@playground.editor.setCursor, 1); perform(@playground.editor.getSelection) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('""')
  })

  test('editor.typeText types characters into the editor', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, ""); perform(@playground.editor.typeText, "hi"); perform(@playground.editor.getContent) end',
    )
    await clickRun(page)
    // typeText is async with setTimeout delays — wait longer.
    // Look for the actual expected content, not just span count, since the
    // pre-run typecheck pass adds spans before the result span lands.
    await page.waitForFunction(
      () => {
        const output = document.getElementById('output-result')
        return !!output && (output.textContent ?? '').includes('hi')
      },
      { timeout: 8000 },
    )
    const output = await getOutputText(page)
    expect(output).toContain('hi')
  })

  test('editor.typeText respects custom delay', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.editor.setContent, ""); perform(@playground.editor.typeText, ["ab", 100]); perform(@playground.editor.getContent) end',
    )
    await clickRun(page)
    await page.waitForFunction(
      () => {
        const output = document.getElementById('output-result')
        return !!output && (output.textContent ?? '').includes('ab')
      },
      { timeout: 8000 },
    )
    const output = await getOutputText(page)
    expect(output).toContain('ab')
  })

  // ── Context ──

  test('context.getContent returns the actual context text', async ({ page }) => {
    await setContext(page, '{"bindings": {"x": 42}}')
    await setDvalaCode(page, 'do let ctx = perform(@playground.context.getContent); slice(ctx, 0, 1) == "{" end')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('true')
  })

  test('context.setContent and getContent round-trip', async ({ page }) => {
    await setDvalaCode(
      page,
      'do perform(@playground.context.setContent, "{}"); perform(@playground.context.getContent) end',
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('{}')
  })

  // ── Execution ──

  test('exec.run executes code and returns result', async ({ page }) => {
    await setDvalaCode(page, 'perform(@playground.exec.run, "10 + 32")')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('42')
  })

  test('exec.run returns strings', async ({ page }) => {
    await setDvalaCode(page, 'perform(@playground.exec.run, "\\"hello\\"")')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('hello')
  })

  test('storage.load fails for nonexistent file', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await setDvalaCode(page, 'perform(@playground.files.load, "does-not-exist")')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output.toLowerCase()).toContain('not found')
  })

  // ── Files ──

  test('storage save, list, and load round-trip', async ({ page }) => {
    // Clear any existing workspace files
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())

    // File names are normalized to add .dvala suffix on save, so load uses the full name
    await setDvalaCode(
      page,
      `do
  perform(@playground.files.save, ["test-prog", "1 + 2"]);
  let names = perform(@playground.files.list);
  let code = perform(@playground.files.load, "test-prog.dvala");
  [names, code]
end`,
    )
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output).toContain('test-prog')
    expect(output).toContain('1 + 2')
  })

  // ── Router ──

  test('router.goto navigates to a page', async ({ page }) => {
    await setDvalaCode(page, 'perform(@playground.router.goto, "examples")')
    await clickRun(page)
    // SPA routing uses pushState — check the dynamic page content
    await expect(page.locator('#dynamic-page')).toContainText('Examples', { timeout: 3000 })
  })

  test('router.back navigates back', async ({ page }) => {
    // Navigate to examples then the book via JS API
    await page.evaluate(() => (window as any).Playground.navigate('/examples'))
    await expect(page.locator('#dynamic-page')).toContainText('Examples', { timeout: 3000 })
    await page.evaluate(() => (window as any).Playground.navigate('/book'))
    await expect(page.locator('#dynamic-page')).toContainText('The Book', { timeout: 3000 })

    // Go back to home, then run router.back to go to the book
    await page.evaluate(() => (window as any).Playground.navigate('/'))
    await waitForInit(page)

    await setDvalaCode(page, 'perform(@playground.router.back)')
    await clickRun(page)
    await expect(page.locator('#dynamic-page')).toContainText('The Book', { timeout: 3000 })
  })
})

// ---------------------------------------------------------------------------
// Start page & feature cards
// ---------------------------------------------------------------------------

test.describe('start page', () => {
  test('shows feature cards for runtime and language', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    const cards = page.locator('.about-feature-card__title')
    await expect(cards.getByText('Suspend & Resume')).toBeVisible()
    await expect(cards.getByText('Algebraic Effects')).toBeVisible()
    await expect(cards.getByText('Safe Sandbox')).toBeVisible()
    await expect(cards.getByText('Pure Functional')).toBeVisible()
    await expect(cards.getByText('Hygienic Macros')).toBeVisible()
    await expect(cards.getByText('Embeddable in JS')).toBeVisible()
  })

  test('shows runtime branding subtitle', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await expect(page.locator('.start-page__subtitle')).toContainText('suspendable runtime')
  })

  test('clicking a feature card opens a modal', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    // Click the Algebraic Effects card
    await page.locator('.about-feature-card', { hasText: 'Algebraic Effects' }).click()
    // Modal should open with the title in the header
    const modal = page.locator('#snapshot-modal')
    await expect(modal).toBeVisible()
    await expect(modal.locator('.breadcrumb-item')).toContainText('Algebraic Effects')
  })

  test('feature card modal contains runnable code blocks', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.locator('.about-feature-card', { hasText: 'Pure Functional' }).click()
    const modal = page.locator('#snapshot-modal')
    await expect(modal).toBeVisible()
    // Should have code blocks with output
    await expect(modal.locator('.doc-page__example').first()).toBeVisible()
    await expect(modal.locator('.doc-page__example-output').first()).toBeVisible()
  })

  test('feature card modal closes on X click', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.locator('.about-feature-card', { hasText: 'Safe Sandbox' }).click()
    const modal = page.locator('#snapshot-modal')
    await expect(modal).toBeVisible()
    await modal.locator('.modal-header__close-btn').click()
    await expect(modal).not.toBeVisible()
  })

  test('no about link in sidebar', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    const sidebar = page.locator('#sidebar')
    await expect(sidebar.getByText('About')).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Chapter pages
// ---------------------------------------------------------------------------

test.describe('chapter pages', () => {
  test('chapter page has sticky header with title', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/book/getting-started-intro'))
    const header = page.locator('.chapter-header')
    await expect(header).toBeVisible()
    await expect(header.locator('.chapter-header__title')).toContainText('Intro')
  })

  test('prev/next navigation works', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/book/getting-started-intro'))
    // First chapter — prev (←) should link back to /book, not be disabled
    const navGroup = page.locator('.chapter-header__nav-group')
    await expect(navGroup).toBeVisible()
    // Click → (last nav button in the group) to go to next chapter
    await navGroup.locator('.chapter-header__nav-btn').last().click()
    // Should navigate to the second chapter
    await expect(page.locator('.chapter-header__title')).not.toContainText('Intro')
  })

  test('TOC button is visible in chapter header', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/book/getting-started-intro'))
    await expect(page.getByRole('button', { name: 'Table of contents' })).toBeVisible()
  })

  test('TOC dropdown navigates to selected chapter', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/book/getting-started-intro'))
    // Open the TOC dropdown and click a chapter
    await page.getByRole('button', { name: 'Table of contents' }).click()
    await page.locator('#chapter-toc-dropdown .chapter-toc-dropdown__item', { hasText: 'Macros' }).click()
    await expect(page.locator('.chapter-header__title')).toContainText('Macros')
  })
})

// ---------------------------------------------------------------------------
// Editor toolbar
// ---------------------------------------------------------------------------

test.describe('editor toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await navigateToPlayground(page)
  })

  test('filename pill displays scratch title', async ({ page }) => {
    const pill = page.locator('#editor-toolbar .editor-toolbar__title')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('[scratch]')
  })

  test('filename pill updates when a file is loaded', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await setDvalaCode(page, '1 + 1')
    await saveAsFile(page, 'pill-test')

    const pill = page.locator('#editor-toolbar .editor-toolbar__title')
    await expect(pill).toContainText('pill-test')
  })

  test('run button is visible and styled as a button', async ({ page }) => {
    const runBtn = page.locator('#run-btn')
    await expect(runBtn).toBeVisible()
    // verify it has a border (button treatment)
    const border = await runBtn.evaluate(el => getComputedStyle(el).border)
    expect(border).toMatch(/\dpx/)
  })

  test('more menu button is visible and styled as a button', async ({ page }) => {
    const moreBtn = page.locator('#more-btn')
    await expect(moreBtn).toBeVisible()
    const border = await moreBtn.evaluate(el => getComputedStyle(el).border)
    expect(border).toMatch(/\dpx/)
  })

  test('more menu opens on click and contains Run option', async ({ page }) => {
    await page.locator('#more-btn').click()
    const menu = page.locator('#more-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Run')
  })

  test('debug toggle is in the more menu', async ({ page }) => {
    await page.locator('#more-btn').click()
    await expect(page.locator('#more-menu')).toContainText('Toggle debug')
  })
})

// ---------------------------------------------------------------------------
// Scratch behaviour
// ---------------------------------------------------------------------------

test.describe('scratch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('scratch item appears at top of file list with no context menu button', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const scratchItem = page.locator('#explorer-file-list .explorer-item').first()
    await expect(scratchItem).toBeVisible()
    await expect(scratchItem).toContainText('[scratch]')
    // no context menu button inside scratch item
    await expect(scratchItem.locator('button')).toHaveCount(0)
  })

  test('stats panel is hidden when scratch is active', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    // scratch is active by default after resetPlayground
    const stats = page.locator('#explorer-file-stats')
    // hidden (display:none or not visible)
    await expect(stats).toBeHidden()
  })

  test('stats panel appears when a workspace file is selected', async ({ page }) => {
    await setDvalaCode(page, '42')
    await saveAsFile(page, 'stats-test')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    // Click the workspace file. The first two items are the pinned virtual
    // entries `[scratch]` (23c) and `[handlers]` (23d); the user-authored
    // file follows at index 2.
    await page.locator('#explorer-file-list .explorer-item').nth(2).click()

    const stats = page.locator('#explorer-file-stats')
    await expect(stats).toBeVisible({ timeout: 3000 })
    await expect(stats).toContainText('stats-test')
  })

  test('opening scratch after file switches back to scratch', async ({ page }) => {
    await setDvalaCode(page, '100')
    await saveAsFile(page, 'switch-test')
    // now switch back to scratch via the item
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await page.locator('#explorer-file-list .explorer-item').first().click()

    const pill = page.locator('#editor-toolbar .editor-toolbar__title')
    await expect(pill).toContainText('[scratch]')
  })
})

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

test.describe('file operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('renaming a file updates its name in the list', async ({ page }) => {
    await setDvalaCode(page, '1')
    await saveAsFile(page, 'original-name')

    const fileId = await firstWorkspaceFileId(page)
    expect(fileId).toBeTruthy()

    // Rename via JS API
    await page.evaluate((id: string) => {
      ;(window as any).Playground.renameFile(id)
    }, fileId!)

    // Fill in the rename input. The rename modal has a single text input, but
    // the save-as modal introduced a second input (folder name) — be explicit.
    const input = page.locator('#snapshot-modal .modal-panel input[type="text"]').first()
    await input.waitFor({ timeout: 2000 })
    await input.fill('renamed-file')
    await input.press('Enter')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await expect(page.locator('#explorer-file-list')).toContainText('renamed-file')
  })

  test('renaming a file inside a folder keeps it in that folder', async ({ page }) => {
    // The rename UI is intentionally scoped to basename-only — it preserves
    // the source's containing folder, treating the typed string as a
    // basename rather than a path. (Cross-folder moves are deferred to
    // Phase 1's drag-and-drop work; see comments in scripts/files.ts
    // renameFile.) This test pins down that contract so the deferred work
    // doesn't silently regress it.
    const fileId = '60606060-6060-6060-6060-606060606060'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'examples/foo.dvala', code: '1', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, fileId)

    await page.evaluate((id: string) => (window as any).Playground.renameFile(id), fileId)
    // The rename modal has a single text input. Be explicit with .first()
    // to avoid strict-mode violations if save-as adds more inputs.
    const input = page.locator('#snapshot-modal .modal-panel input[type="text"]').first()
    await input.waitFor({ timeout: 2000 })
    await input.fill('bar')
    await input.press('Enter')

    // Tree should still show the `examples` folder. Expand it before
    // probing for the file row — children only render on expand.
    const folderRow = page.locator('#explorer-file-list .explorer-folder')
    await expect(folderRow).toContainText('examples')
    await folderRow.click()
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("bar.dvala")')).toHaveCount(1)

    // The explorer renders each file row with `title="<path>"`, so the DOM
    // is authoritative without poking module internals.
    const fileRow = page.locator(`#explorer-file-list .explorer-item[data-file-id="${fileId}"]`)
    await expect(fileRow).toHaveAttribute('title', 'examples/bar.dvala')
  })

  test('duplicating a file adds a second entry', async ({ page }) => {
    await setDvalaCode(page, '2 + 2')
    await saveAsFile(page, 'dup-source')

    const fileId = await firstWorkspaceFileId(page)
    await page.evaluate((id: string) => (window as any).Playground.duplicateFile(id), fileId!)

    await page.waitForFunction(
      () => {
        // scratch + original + duplicate = 3 items
        return document.querySelectorAll('#explorer-file-list .explorer-item').length >= 3
      },
      { timeout: 3000 },
    )

    const count = await page.locator('#explorer-file-list .explorer-item').count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('closing an open file returns to scratch', async ({ page }) => {
    await setDvalaCode(page, '7')
    await saveAsFile(page, 'close-me')

    // Close via the tab strip's × button
    const closeBtn = page.locator('.editor-tab--active .editor-tab__close')
    await expect(closeBtn).toBeVisible({ timeout: 3000 })
    await closeBtn.click()

    const pill = page.locator('#editor-toolbar .editor-toolbar__title')
    await expect(pill).toContainText('[scratch]')
  })

  test('files with `/` in the path render as a folder tree', async ({ page }) => {
    // Seed three files: one at the root + two sharing an `examples/` folder.
    // The folder is collapsed by default — its children only render after
    // a click on the folder row.
    await page.evaluate(() => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id: 'a', path: 'root.dvala', code: '1', context: '', createdAt: 1, updatedAt: 1 },
        { id: 'b', path: 'examples/foo.dvala', code: '2', context: '', createdAt: 2, updatedAt: 2 },
        { id: 'c', path: 'examples/bar.dvala', code: '3', context: '', createdAt: 3, updatedAt: 3 },
      ])
    })

    const folderRow = page.locator('#explorer-file-list .explorer-folder')
    await expect(folderRow).toHaveCount(1)
    await expect(folderRow).toContainText('examples')
    // Collapsed: only the root file + the folder row are visible (no nested items).
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("foo.dvala")')).toHaveCount(0)
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("bar.dvala")')).toHaveCount(0)
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("root.dvala")')).toHaveCount(1)

    // Click to expand → both child files appear.
    await folderRow.click()
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("foo.dvala")')).toHaveCount(1)
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("bar.dvala")')).toHaveCount(1)

    // Click again to collapse.
    await folderRow.click()
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("foo.dvala")')).toHaveCount(0)
  })

  test('expand/collapse state survives reload', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id: 'a', path: 'examples/foo.dvala', code: '', context: '', createdAt: 1, updatedAt: 1 },
      ])
    })

    await page.locator('#explorer-file-list .explorer-folder').click()
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("foo.dvala")')).toHaveCount(1)

    await page.reload()
    await waitForInit(page)
    await navigateToPlayground(page)

    // Folder should still be expanded after reload because the state is
    // persisted in localStorage.
    await expect(page.locator('#explorer-file-list .explorer-item:has-text("foo.dvala")')).toHaveCount(1)
  })

  test('multi-file import: a workspace file can `import` another workspace file and run', async ({ page }) => {
    // Seed two files where `main.dvala` imports `./lib.dvala` from the same
    // folder. Loading `main` and clicking Run should execute end-to-end —
    // the playground's fileResolver consults the in-memory workspace-files
    // cache the same way `dvala run` consults disk.
    const mainId = '11111111-1111-1111-1111-111111111111'
    const libId = '22222222-2222-2222-2222-222222222222'
    await page.evaluate(
      ({ mainId, libId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          {
            id: libId,
            path: 'lib.dvala',
            // Dvala modules export by ending in an object literal — there's
            // no `export` keyword. The last expression of the file is what
            // `import(...)` returns. The semicolon after the let is required
            // — without it, the parser reads `let greet = ... { greet }` as
            // a single statement and the file's "last expression" never
            // resolves to the object literal.
            code: 'let greet = (name) -> `hello, ${name}!`;\n{ greet }',
            context: '',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: mainId,
            path: 'main.dvala',
            // Newlines don't terminate `let` statements — the trailing `;`
            // is required, otherwise the parser reads the next expression
            // as the let's value.
            code: 'let { greet } = import("./lib");\ngreet("world")',
            context: '',
            createdAt: 2,
            updatedAt: 2,
          },
        ])
      },
      { mainId, libId },
    )
    // Load main.dvala and run it.
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), mainId)
    await navigateToPlayground(page)
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('hello, world!')
  })

  test('multi-file import: resolves across folders relative to the importing file', async ({ page }) => {
    // main.dvala lives at the root and imports `./lib/math` — a file one
    // folder deep. Exercises both folder-anchoring and the .dvala-suffix
    // fallback (the import omits the extension).
    const mainId = '44444444-4444-4444-4444-444444444444'
    const libId = '55555555-5555-5555-5555-555555555555'
    await page.evaluate(
      ({ mainId, libId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          {
            id: libId,
            path: 'lib/math.dvala',
            code: 'let double = (n) -> n * 2;\n{ double }',
            context: '',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: mainId,
            path: 'main.dvala',
            code: 'let { double } = import("./lib/math");\ndouble(21)',
            context: '',
            createdAt: 2,
            updatedAt: 2,
          },
        ])
      },
      { mainId, libId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), mainId)
    await navigateToPlayground(page)
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')
  })

  test('multi-file import: nested file can `..` back up to a sibling folder', async ({ page }) => {
    // tests/main.dvala imports `../lib/math`. Verifies fileResolverBaseDir
    // is anchored at the importing file's folder, not the workspace root —
    // without that, the runtime's `..` would walk past root and throw.
    const mainId = '66666666-6666-6666-6666-666666666666'
    const libId = '77777777-7777-7777-7777-777777777777'
    await page.evaluate(
      ({ mainId, libId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          {
            id: libId,
            path: 'lib/math.dvala',
            code: 'let triple = (n) -> n * 3;\n{ triple }',
            context: '',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: mainId,
            path: 'tests/main.dvala',
            code: 'let { triple } = import("../lib/math");\ntriple(14)',
            context: '',
            createdAt: 2,
            updatedAt: 2,
          },
        ])
      },
      { mainId, libId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), mainId)
    await navigateToPlayground(page)
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')
  })

  test('multi-file import: missing target file produces a useful error', async ({ page }) => {
    const mainId = '33333333-3333-3333-3333-333333333333'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        {
          id,
          path: 'main.dvala',
          code: 'import("./does-not-exist")',
          context: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    }, mainId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), mainId)
    await navigateToPlayground(page)
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('File not found')
    expect(output).toContain('does-not-exist')
  })
})

// ---------------------------------------------------------------------------
// Editor tabs
// ---------------------------------------------------------------------------

test.describe('editor tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('opening a workspace file adds a tab; switching tabs swaps the editor content', async ({ page }) => {
    // Seed two files and open both. The strip should show scratch + 2 file
    // tabs; clicking a tab switches the active file.
    const aId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const bId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'a.dvala', code: '111', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'b.dvala', code: '222', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    // Open both files via the explorer (which routes through openOrFocusFile).
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), bId)

    const tabs = page.locator('#editor-tab-strip .editor-tab')
    await expect(tabs).toHaveCount(3) // scratch + 2 files

    // b.dvala is now active because it was the most recently opened.
    const editorValue1 = await getDvalaCode(page)
    expect(editorValue1).toBe('222')

    // Click the a.dvala tab to switch.
    await page.locator('#editor-tab-strip .editor-tab[data-tab-key]').nth(1).click()
    const editorValue2 = await getDvalaCode(page)
    expect(editorValue2).toBe('111')
  })

  test('closing a tab via × button switches to a neighbor', async ({ page }) => {
    const aId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'closeable.dvala', code: 'X', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    // Click the close button on the active tab. The selector grabs the
    // close button inside the one and only file tab (scratch has no close).
    await page.locator('#editor-tab-strip .editor-tab--active .editor-tab__close').click()

    // After close, only the scratch tab remains.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
  })

  test('the scratch tab has a × close button (Phase 1.5 step 23j stage 2)', async ({ page }) => {
    // Pre-23j scratch was sticky; 23j stage 2 made every tab closable.
    // Just opening the editor with no other tabs should still expose
    // the close button on the scratch tab.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' })).toBeVisible()
    // The close button is hidden by CSS until the tab is hovered or
    // active. Scratch is the only tab and is active by default, so the
    // button is visible without hover.
    const scratchClose = page
      .locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' })
      .locator('.editor-tab__close')
    await expect(scratchClose).toBeVisible()
  })

  test('clicking the scratch tab × empties the strip and shows the empty state', async ({ page }) => {
    // Close the scratch tab. With nothing else open, the strip empties
    // and the editor area renders the "No tab open" empty state with
    // an "Open scratch" affordance.
    const scratchTab = page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' })
    await scratchTab.locator('.editor-tab__close').click()
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(0)
    // Empty view appears in the editor area.
    await expect(page.locator('#dvala-empty-view')).toBeVisible()
    // The pinned `[scratch]` entry stays in the file tree as the
    // re-open affordance.
    await expect(page.locator('#explorer-file-list .explorer-item', { hasText: '[scratch]' })).toBeVisible()
  })

  test('after closing scratch, the pinned [scratch] tree entry re-opens it', async ({ page }) => {
    const scratchTab = page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' })
    await scratchTab.locator('.editor-tab__close').click()
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(0)

    // Click the pinned `[scratch]` entry in the explorer file list.
    await page.locator('#explorer-file-list .explorer-item', { hasText: '[scratch]' }).click()
    // Strip is back with scratch as the only tab.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
    // Editor view is visible again, empty state hidden.
    await expect(page.locator('#dvala-editor-view')).toBeVisible()
    await expect(page.locator('#dvala-empty-view')).toBeHidden()
  })

  test('closing scratch when other tabs are open falls back to a neighbor', async ({ page }) => {
    // Seed a workspace file and open it as a tab alongside scratch.
    const aId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
    await page.evaluate(
      ({ aId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'neighbor-a.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1 },
        ])
      },
      { aId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    // Switch back to scratch so it's the active tab; file 'a' is the
    // only neighbor.
    await page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' }).click()
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')

    // Close scratch via its × button.
    const scratchTab = page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' })
    await scratchTab.locator('.editor-tab__close').click()

    // Strip drops to one tab (the neighbor); active becomes 'neighbor-a.dvala'.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('neighbor-a.dvala')
  })

  test('open tab list + active tab survives a reload', async ({ page }) => {
    const aId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const bId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'persist-a.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'persist-b.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), bId)
    // Switch back to a.dvala so it's the active tab on reload.
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    await page.reload()
    await waitForInit(page)
    await navigateToPlayground(page)

    // Both file tabs + scratch should still be present.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(3)
    // a.dvala should still be the active one.
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('persist-a.dvala')
    expect(await getDvalaCode(page)).toBe('A')
  })

  test('typing in a file tab toggles the modified-dot indicator', async ({ page }) => {
    const aId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'dirty-test.dvala', code: 'baseline', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    // Buffer matches file.code → no dot.
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(0)

    // Mutate the buffer — dot should appear.
    await page.evaluate(() => (window as any).Playground.setEditorValue('mutated'))
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(1)

    // Restore — dot should disappear.
    await page.evaluate(() => (window as any).Playground.setEditorValue('baseline'))
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(0)
  })

  test('Cmd/Ctrl-W closes the active tab (Monaco-bound shortcut)', async ({ page }) => {
    // Open one file so a closeable tab exists in addition to <scratch>.
    const aId = '10101010-1010-1010-1010-101010101010'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'closable-via-keybind.dvala', code: 'X', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(2)
    // Monaco's `editor.addCommand` only fires while the editor has focus.
    await page.evaluate(() => (window as any).Playground.focusDvalaCode())
    await page.keyboard.press(`${MONACO_CMD_MOD}+w`)

    // After close, only the scratch tab remains and is active.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
  })

  test('Cmd/Ctrl-PageDown / -PageUp cycle through open tabs (wrapping)', async ({ page }) => {
    // Strip ends up as: [scratch, A, B] with B active (last opened).
    const aId = '20202020-2020-2020-2020-202020202020'
    const bId = '21212121-2121-2121-2121-212121212121'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'cycle-a.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'cycle-b.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), bId)

    await page.evaluate(() => (window as any).Playground.focusDvalaCode())
    // From B, PageDown wraps to scratch (next-with-wrap on a 3-tab strip).
    await page.keyboard.press(`${MONACO_CMD_MOD}+PageDown`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
    // PageDown again → A.
    await page.keyboard.press(`${MONACO_CMD_MOD}+PageDown`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('cycle-a.dvala')
    // PageUp → back to scratch.
    await page.keyboard.press(`${MONACO_CMD_MOD}+PageUp`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
  })

  test('Cmd/Ctrl-1..9 jumps to the Nth open tab', async ({ page }) => {
    // Strip: <scratch> (1), A (2), B (3) with B active.
    const aId = '30303030-3030-3030-3030-303030303030'
    const bId = '31313131-3131-3131-3131-313131313131'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'idx-a.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'idx-b.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), bId)

    await page.evaluate(() => (window as any).Playground.focusDvalaCode())
    // Cmd-1 → scratch.
    await page.keyboard.press(`${MONACO_CMD_MOD}+1`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
    // Cmd-2 → A.
    await page.keyboard.press(`${MONACO_CMD_MOD}+2`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('idx-a.dvala')
    // Cmd-3 → B.
    await page.keyboard.press(`${MONACO_CMD_MOD}+3`)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('idx-b.dvala')
  })

  test('middle-click on a tab closes it (auxclick button === 1)', async ({ page }) => {
    const aId = '40404040-4040-4040-4040-404040404040'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'aux-close.dvala', code: 'X', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(2)
    // Middle-click anywhere on the file tab — handler reads the closest
    // `[data-tab-key]` ancestor, so we don't need to aim at the close button.
    await page
      .locator('#editor-tab-strip .editor-tab[data-tab-key]')
      .filter({ hasText: 'aux-close.dvala' })
      .click({ button: 'middle' })

    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
  })

  test('switching tabs and back preserves cursor position (per-tab viewState)', async ({ page }) => {
    // Each tab owns a saved Monaco viewState — cursor / scroll / folds — so
    // returning to a tab restores where the user was. Verify by setting a
    // distinctive cursor offset on tab A, switching to B, and confirming the
    // offset is restored when we return to A.
    const aId = '50505050-5050-5050-5050-505050505050'
    const bId = '51515151-5151-5151-5151-515151515151'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          {
            id: aId,
            path: 'view-a.dvala',
            // Multi-line so cursor offsets exercise both column and row.
            code: 'line one\nline two\nline three',
            context: '',
            createdAt: 1,
            updatedAt: 1,
          },
          { id: bId, path: 'view-b.dvala', code: 'B-only', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)
    // Pick an offset that lands inside line two (past the first newline) so
    // a "back to start" regression on tab swap is unambiguous.
    await page.evaluate(() => (window as any).Playground.setEditorCursor(13))
    expect(await page.evaluate(() => (window as any).Playground.getEditorCursor())).toBe(13)

    // Switch away (B), then back to A.
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), bId)
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), aId)

    // Cursor offset should still be 13. Without saved viewState, Monaco
    // would default to (1,1) i.e. offset 0.
    expect(await page.evaluate(() => (window as any).Playground.getEditorCursor())).toBe(13)
  })
})

// ---------------------------------------------------------------------------
// Quick Open (Cmd/Ctrl-P)
// ---------------------------------------------------------------------------

test.describe('quick open', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('opens a centered palette listing all workspace files', async ({ page }) => {
    const aId = '11111111-1111-4111-8111-111111111111'
    const bId = '22222222-2222-4222-8222-222222222222'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'main.dvala', code: '', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'lib/util.dvala', code: '', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )

    await page.evaluate(() => (window as any).Playground.openQuickOpen())
    await expect(page.locator('#quick-open-palette')).toBeVisible()
    // Both files should appear with empty query.
    await expect(page.locator('.quick-open__row')).toHaveCount(2)
  })

  test('typing filters by fuzzy match on the path', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id: 'a', path: 'main.dvala', code: '', context: '', createdAt: 1, updatedAt: 1 },
        { id: 'b', path: 'lib/util.dvala', code: '', context: '', createdAt: 2, updatedAt: 2 },
        { id: 'c', path: 'examples/foo.dvala', code: '', context: '', createdAt: 3, updatedAt: 3 },
      ])
    })
    await page.evaluate(() => (window as any).Playground.openQuickOpen())

    const input = page.locator('.quick-open__input')
    await input.fill('util')
    await expect(page.locator('.quick-open__row')).toHaveCount(1)
    await expect(page.locator('.quick-open__row .quick-open__label')).toContainText('util.dvala')
  })

  test('Enter on a result opens the selected file as a tab', async ({ page }) => {
    const targetId = '33333333-3333-4333-8333-333333333333'
    await page.evaluate((id: string) => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id, path: 'target.dvala', code: 'OPENED', context: '', createdAt: 1, updatedAt: 1 },
      ])
    }, targetId)

    await page.evaluate(() => (window as any).Playground.openQuickOpen())
    await page.locator('.quick-open__input').press('Enter')

    // Picker dismissed.
    await expect(page.locator('#quick-open-palette')).toHaveCount(0)
    // The selected file is now the active tab.
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('target.dvala')
    expect(await getDvalaCode(page)).toBe('OPENED')
  })

  test('Escape dismisses the picker', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.Playground.setWorkspaceFilesForTesting([
        { id: 'x', path: 'x.dvala', code: '', context: '', createdAt: 1, updatedAt: 1 },
      ])
    })
    await page.evaluate(() => (window as any).Playground.openQuickOpen())
    await expect(page.locator('#quick-open-palette')).toBeVisible()
    await page.locator('.quick-open__input').press('Escape')
    await expect(page.locator('#quick-open-palette')).toHaveCount(0)
  })

  test('arrow keys move the selection; Enter opens the highlighted row', async ({ page }) => {
    const aId = '44444444-4444-4444-8444-444444444444'
    const bId = '55555555-5555-4555-8555-555555555555'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        // Same insertion order so empty-query ranking preserves it.
        w.Playground.setWorkspaceFilesForTesting([
          { id: aId, path: 'first.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1 },
          { id: bId, path: 'second.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2 },
        ])
      },
      { aId, bId },
    )
    await page.evaluate(() => (window as any).Playground.openQuickOpen())

    // Arrow-down moves selection from row 0 → row 1; Enter opens row 1.
    await page.locator('.quick-open__input').press('ArrowDown')
    await page.locator('.quick-open__input').press('Enter')

    expect(await getDvalaCode(page)).toBe('B')
  })

  test('does nothing when the workspace has no workspace files', async ({ page }) => {
    // resetPlayground + clearAllWorkspaceFiles in beforeEach already left zero
    // files. Trying to open the picker should be a no-op (avoids a popup
    // with no rows).
    await page.evaluate(() => (window as any).Playground.openQuickOpen())
    await expect(page.locator('#quick-open-palette')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Layout panels (right + bottom)
// ---------------------------------------------------------------------------

test.describe('layout panels', () => {
  test.beforeEach(async ({ page }) => {
    // Reset panel state slots before each test so the assertions don't
    // depend on residue from earlier runs (the e2e suite shares a
    // browser context per worker).
    await page.goto('')
    await page.evaluate(() => {
      localStorage.removeItem('playground-right-panel-collapsed')
      localStorage.removeItem('playground-bottom-panel-collapsed')
    })
    await page.reload()
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await navigateToPlayground(page)
  })

  test('right panel shows all tool tabs (REPL / Tokens / AST / CST / Doc Tree) in pipeline order', async ({ page }) => {
    // Open the panel via parse(); all four tabs should be present in the
    // strip in pipeline order — the user switches between them by clicking,
    // no summon-on-demand mechanism.
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())

    const strip = page.locator('#right-panel .panel-shell__strip')
    const tabIds = await strip
      .locator('[data-panel-tab-id]')
      .evaluateAll(els => els.map(el => (el as HTMLElement).dataset['panelTabId']))
    expect(tabIds).toEqual(['repl', 'tokens', 'ast', 'cst', 'doc'])
    // No close-X buttons on right-panel tabs (the panel is toggled as a
    // whole via the editor-bar icon / Cmd+Shift+J).
    await expect(strip.locator('.panel-shell__tab-close')).toHaveCount(0)
  })

  test('docTree opens the right panel Doc Tree tab', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.docTree())
    const docBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="doc"]')
    await expect(docBody).toBeVisible({ timeout: 3000 })
    // Wadler-Lindig Doc tree is JSON; just verify the body is non-empty.
    const text = (await docBody.textContent()) ?? ''
    expect(text.trim().length).toBeGreaterThan(0)
  })

  test('clicking an AST node row shows pretty-printed Dvala source in the detail pane', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()

    // Find the depth-1 row — the root array's only child, the Call AST
    // node. With initialExpandDepth=2 it's visible without further
    // clicks. Identify it by its [0] label.
    const callNodeRow = astBody.locator('.json-tree__node').filter({ hasText: '[0]' }).first()
    await expect(callNodeRow).toBeVisible()
    await callNodeRow.click()

    const detail = astBody.locator('.json-tree__detail-code')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('1 + 2')
  })

  test('clicking an inner AST tuple element walks up to the enclosing AST node', async ({ page }) => {
    // The 3-tuple shape `[type, payload, id]` exposes the leading type
    // string ("Call") as a separate tree row. Clicking that row should
    // still show the parent Call node's pretty-printed source — the
    // user's mental model is "every row is a node" and the resolver in
    // rightPanelTools.ts walks up to the deepest enclosing AST tuple.
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()

    // Find the type-string row — the first depth-2 row labelled `[0]:`
    // that contains the literal "Call" value.
    const callTypeRow = astBody.locator('.json-tree__node').filter({ hasText: '"Call"' }).first()
    await expect(callTypeRow).toBeVisible()
    await callTypeRow.click()

    const detail = astBody.locator('.json-tree__detail-code')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('1 + 2')
  })

  test('detail pane is closed by default; opens on node click; closes via X', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()

    const detail = astBody.locator('.json-tree__detail').first()
    await expect(detail).toBeHidden()

    const callRow = astBody.locator('.json-tree__node').filter({ hasText: '"Call"' }).first()
    await callRow.click()
    await expect(detail).toBeVisible()

    await detail.locator('.json-tree__detail-close').click()
    await expect(detail).toBeHidden()
  })

  test('right panel: clicking an inactive tab refreshes its content', async ({ page }) => {
    // Auto-refresh is per-active-tab. Switching from AST to Tokens should
    // populate the Tokens body (it had no content before).
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    await page.locator('#right-panel .panel-shell__tab[data-panel-tab-id="tokens"]').click()
    const tokensBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="tokens"]')
    await expect(tokensBody).toBeVisible()
    await expect(tokensBody).toContainText('Number')
  })

  test('right-panel toggle button on the editor tab bar collapses + expands the panel', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()
    // Toggle button lives on the editor tab bar (not inside the right
    // panel), so it stays clickable while the panel is collapsed.
    const toggleBtn = page.locator('#right-panel-toggle-btn')
    await toggleBtn.click()
    await expect(astBody).not.toBeVisible()
    // Click again to re-open.
    await toggleBtn.click()
    await expect(astBody).toBeVisible()
  })

  test('Cmd/Ctrl+Shift+J toggles the right panel (both keymods)', async ({ page }) => {
    // Open via parse so we have something to toggle off.
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()
    // Ctrl path (Linux / Windows)
    await page.keyboard.press('Control+Shift+j')
    await expect(astBody).not.toBeVisible()
    await page.keyboard.press('Control+Shift+j')
    await expect(astBody).toBeVisible()
    // Meta path (Mac Cmd) — handler checks `evt.ctrlKey || evt.metaKey`,
    // so both modifiers should toggle. Without this assertion CI (Linux)
    // silently leaves the metaKey branch uncovered.
    await page.keyboard.press('Meta+Shift+j')
    await expect(astBody).not.toBeVisible()
    await page.keyboard.press('Meta+Shift+j')
    await expect(astBody).toBeVisible()
  })

  test('right panel auto-refreshes the active tool when the editor tab swaps', async ({ page }) => {
    // Seed a workspace file with a Let-statement source. The active tab will
    // be scratch (with `1 + 2`), so initial AST shows a Call node.
    const fileId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    await page.evaluate(
      ({ id }: { id: string }) => {
        const w = window as any
        w.Playground.setWorkspaceFilesForTesting([
          { id, path: 'letFile.dvala', code: 'let a = 1; a', context: '', createdAt: 1, updatedAt: 1 },
        ])
      },
      { id: fileId },
    )

    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toContainText('Call')

    // Open the workspace file as a new tab; the afterSwap hook should re-run
    // the AST tool against the new active file's source (`let a = 1; a`).
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), fileId)
    // The Let type tag is visible at the default expand depth.
    await expect(astBody).toContainText('Let')
  })

  test('right panel is collapsed by default; parse() opens it with the AST tab', async ({ page }) => {
    // The right panel host is in the DOM but its body is hidden until
    // un-collapsed. Confirm the body isn't visible initially.
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).not.toBeVisible()

    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())

    await expect(astBody).toBeVisible()
    await expect(astBody).toContainText('Call')
  })

  test('clicking the active tab on the bottom panel toggles its collapse', async ({ page }) => {
    // Bottom panel keeps its tab strip visible when collapsed — the
    // entire panel shrinks to strip height, so clicking the active tab
    // is a discoverable toggle. Right panel collapses to nothing (cleaner
    // default) so it has no equivalent strip-click; that asymmetry is
    // intentional MVP. Cmd-J is the keyboard alternative for either.
    const outputTab = page.locator('#bottom-panel .panel-shell__tab[data-panel-tab-id="output"]')
    const outputBody = page.locator('#bottom-panel .panel-shell__body[data-panel-tab-id="output"]')
    await expect(outputBody).toBeVisible()

    await outputTab.click()
    await expect(outputBody).not.toBeVisible()

    await outputTab.click()
    await expect(outputBody).toBeVisible()
  })

  test('Cmd/Ctrl-J toggles the bottom panel (both keymods)', async ({ page }) => {
    const outputBody = page.locator('#bottom-panel .panel-shell__body[data-panel-tab-id="output"]')
    await expect(outputBody).toBeVisible()

    // Cmd-J on Mac, Ctrl-J elsewhere — handler checks `evt.ctrlKey ||
    // evt.metaKey`, so both modifiers should toggle. Cover both paths
    // explicitly so CI (Linux) doesn't silently skip the metaKey branch.
    await page.keyboard.press('Control+j')
    await expect(outputBody).not.toBeVisible()
    await page.keyboard.press('Control+j')
    await expect(outputBody).toBeVisible()
    await page.keyboard.press('Meta+j')
    await expect(outputBody).not.toBeVisible()
    await page.keyboard.press('Meta+j')
    await expect(outputBody).toBeVisible()
  })

  test('bottom panel collapsed state survives reload', async ({ page }) => {
    const outputBody = page.locator('#bottom-panel .panel-shell__body[data-panel-tab-id="output"]')
    await expect(outputBody).toBeVisible()

    await page.keyboard.press('Control+j')
    await expect(outputBody).not.toBeVisible()

    await page.reload()
    await waitForInit(page)
    await navigateToPlayground(page)

    await expect(outputBody).not.toBeVisible()
  })

  test('right panel collapsed state survives reload', async ({ page }) => {
    // Open the right panel first (parse() un-collapses it onto the AST tab).
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toBeVisible()

    // Collapse via the editor-bar toggle button (matches the user's primary
    // gesture; the keyboard path is covered by an adjacent test).
    await page.locator('#right-panel-toggle-btn').click()
    await expect(astBody).not.toBeVisible()

    await page.reload()
    await waitForInit(page)
    await navigateToPlayground(page)

    // The persisted `playground-right-panel-collapsed` flag should keep the
    // panel collapsed across boot, mirroring the bottom panel's behavior.
    await expect(astBody).not.toBeVisible()
  })

  test('Output appears in the bottom panel tab', async ({ page }) => {
    // Run produces output; confirm it lands inside the panel's Output tab body.
    await setDvalaCode(page, '6 * 7')
    await clickRun(page)
    await waitForOutput(page)
    const outputBody = page.locator('#bottom-panel .panel-shell__body[data-panel-tab-id="output"]')
    await expect(outputBody).toContainText('42')
  })
})

// ---------------------------------------------------------------------------
// Tab state persistence
// ---------------------------------------------------------------------------

test.describe('tab state persistence', () => {
  // The Context-tab variant of this test was removed in Phase 1.5 step 23f
  // when the Context left-panel tab was retired. The snapshot variant below
  // exercises the same persistence path against the surviving tabs.
  test('switching away from editor and back preserves snapshot side panel', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await navigateToPlayground(page)

    // Click the snapshots side panel icon
    await page.locator('#side-icon-snapshots').click()
    await expect(page.locator('#side-icon-snapshots')).toHaveClass(/side-panel__icon--active/)

    // Click the Reference tab
    await page.evaluate(() => (window as any).Playground.navigateToTab('ref'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )

    // Click the Editor tab
    await page.locator('#tab-btn-editor').click()
    await page.locator('#tab-editor').waitFor({ state: 'visible', timeout: 3000 })

    // Snapshots icon should still be active and the snapshots side tab should be visible.
    await expect(page.locator('#side-icon-snapshots')).toHaveClass(/side-panel__icon--active/)
    await expect(page.locator('#side-tab-snapshots')).toBeVisible()
  })

  test('switching tabs preserves position in reference tab', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Navigate deep into a ref page
    await page.evaluate(() => (window as any).Playground.navigate('/ref/core/math'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )

    // Switch to editor tab
    await navigateToPlayground(page)

    // Switch back to ref tab — should restore to /ref/core/math, not /ref root
    await page.evaluate(() => (window as any).Playground.navigateToTab('ref'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )

    expect(page.url()).toContain('/ref/core/math')
  })

  test('switching tabs preserves position in examples tab', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Navigate to the examples index then into one example
    await page.evaluate(() => (window as any).Playground.navigate('/examples'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.querySelector('.book-page') !== null
      },
      { timeout: 5000 },
    )

    // Click the first example link
    const firstLink = page.locator('#dynamic-page a[onclick*="navigate"]').first()
    const href = await firstLink.getAttribute('onclick')
    await firstLink.click()
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )
    const urlAfterExample = page.url()

    // Switch to editor tab
    await navigateToPlayground(page)

    // Switch back to examples — should be on the same example page
    await page.evaluate(() => (window as any).Playground.navigateToTab('examples'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )

    expect(page.url()).toBe(urlAfterExample)
  })
})

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

test.describe('breadcrumbs', () => {
  test('examples detail page shows breadcrumb with "Examples" link', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    await page.evaluate(() => (window as any).Playground.navigate('/examples'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.querySelector('.book-page') !== null
      },
      { timeout: 5000 },
    )

    // Click the first example
    await page.locator('#dynamic-page a[onclick*="navigate"]').first().click()
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.querySelector('.chapter-header__breadcrumbs') !== null
      },
      { timeout: 5000 },
    )

    const breadcrumb = page.locator('#dynamic-page .chapter-header__breadcrumbs')
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText('Examples')
  })

  test('book chapter shows breadcrumb with chapter title but not section folder', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/book/getting-started-intro'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.querySelector('.chapter-header__breadcrumbs') !== null
      },
      { timeout: 5000 },
    )

    const breadcrumb = page.locator('#dynamic-page .chapter-header__breadcrumbs')
    await expect(breadcrumb).toContainText('The Book')
    await expect(breadcrumb).toContainText('Intro')
    // section folder ("Getting Started") should NOT appear — breadcrumb is The Book › Intro
    await expect(breadcrumb).not.toContainText('Getting Started')
  })
})

// ---------------------------------------------------------------------------
// About route removal
// ---------------------------------------------------------------------------

test.describe('about route removed', () => {
  test('/about falls through to start page', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.navigate('/about'))
    // Should show start page content (feature cards), not a 404
    await expect(page.locator('#dynamic-page').getByText('Suspend & Resume')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Phase 1.5 step 23m — boundary-handler integration e2e coverage
// ---------------------------------------------------------------------------

test.describe('handlers buffer persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('handlers buffer code survives a page reload', async ({ page }) => {
    // Stage a handler in the handlers buffer
    await page.evaluate(() => {
      ;(window as any).Playground.setHandlersCodeForTesting('linear handler @reload.eff(x) -> x * 3 end')
    })
    // Give IndexedDB time to flush the write before reload
    await page.waitForTimeout(200)

    // Reload and verify the handlers buffer code persisted
    await page.reload()
    await waitForInit(page)

    // After reload the buffer should still be active — run code that triggers the handler
    await navigateToPlayground(page)
    await setDvalaCode(page, 'perform(@reload.eff, 10)')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('30')
  })

  test('empty handlers buffer produces no extra wrapping on reload', async ({ page }) => {
    // Clear the handlers buffer
    await page.evaluate(() => (window as any).Playground.setHandlersCodeForTesting(''))
    // Give IndexedDB time to flush the write before reload
    await page.waitForTimeout(200)

    await page.reload()
    await waitForInit(page)

    // Simple arithmetic should still work without a boundary handler
    await navigateToPlayground(page)
    await setDvalaCode(page, '40 + 2')
    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('42')
  })
})

test.describe('save-copy-to-workspace (Save As)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('can Save As scratch to a workspace file', async ({ page }) => {
    await setDvalaCode(page, 'scratch content here')

    // Trigger Save As — opens the name input modal
    await page.evaluate(() => (window as any).Playground.saveAs())

    // Fill in the file name and confirm. The modal is created by showNameInputModal
    // which renders two inputs (filename + optional folder name) inside a
    // .modal-overlay. Target the first one (filename) to avoid strict-mode
    // resolution errors.
    const input = page.locator('.modal-overlay input[type="text"]').first()
    await input.waitFor({ timeout: 2000 })
    await input.fill('my-copy')

    // Click the primary confirm button (shows as .button--primary)
    await page.locator('.modal-overlay .button--primary').click()
    // Modal should close and a toast confirm appears
    await expect(page.locator('#toast-container')).toContainText('Saved', { timeout: 3000 })

    // The workspace file list should now have the new file (with scratch pinned)
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const fileItems = page.locator('#explorer-file-list .explorer-item')
    await expect(fileItems.filter({ hasText: 'my-copy' })).toBeVisible()
  })
})

test.describe('scratch imports workspace files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('scratch can import a workspace file at ./', async ({ page }) => {
    // Seed a workspace file called `data.dvala`
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'seed-data',
          path: 'data.dvala',
          code: 'let x = 99; x',
          context: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    })

    // Write scratch code that imports the workspace file. Scratch resolves
    // imports relative to the workspace root, so `./data.dvala` finds the
    // workspace-level file. `../` would escape the workspace root and fail.
    await setDvalaCode(page, 'let d = import("./data.dvala"); d.x')

    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('99')
  })
})

test.describe('importing .dvala-playground is rejected', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.clearAllWorkspaceFiles())
    await navigateToPlayground(page)
  })

  test('workspace file importing .dvala-playground/ produces a clear error', async ({ page }) => {
    // Seed a workspace file
    await page.evaluate(() => {
      ;(window as any).Playground.setWorkspaceFilesForTesting([
        {
          id: 'bad-import',
          path: 'main.dvala',
          code: 'let h = import(".dvala-playground/handlers.dvala"); h',
          context: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    })

    // Load and run the workspace file
    const fileId = await firstWorkspaceFileId(page)
    expect(fileId).toBeTruthy()
    await page.evaluate((id: string) => (window as any).Playground.loadWorkspaceFile(id), fileId!)

    await clickRun(page)
    await waitForOutput(page)

    // The output should contain an error about importing from .dvala-playground
    const output = await getOutputText(page)
    // The import resolver rejects .dvala-playground paths with a clear message
    expect(output.toLowerCase()).toMatch(/rejected|not allowed|cannot import|playground/)
  })
})

test.describe('boundary handler precedence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
  })

  test('user-level handler takes precedence over boundary handler', async ({ page }) => {
    // Stage a boundary handler in the handlers buffer
    await page.evaluate(() => {
      ;(window as any).Playground.setHandlersCodeForTesting('linear handler @prec.eff(x) -> x * 2 end')
    })

    // User code installs its own handler for the same effect — should take precedence
    await navigateToPlayground(page)
    await setDvalaCode(page, 'let h = handler @prec.eff(x) -> x * 10 end; do with h; perform(@prec.eff, 5) end')

    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    // The inner (user) handler should apply: 5 * 10 = 50, not 5 * 2 = 10
    expect(output).toContain('50')
  })

  test('boundary handler handles effects not covered by user-level handlers', async ({ page }) => {
    // Stage a boundary handler for an effect not covered by user code
    await page.evaluate(() => {
      ;(window as any).Playground.setHandlersCodeForTesting('linear handler @fallback.eff(x) -> x + 1 end')
    })

    // User code does NOT handle @fallback.eff — the boundary handler should catch it
    await navigateToPlayground(page)
    await setDvalaCode(page, 'perform(@fallback.eff, 41)')

    await clickRun(page)
    await waitForOutput(page)

    const output = await getOutputText(page)
    // Boundary handler applies: 41 + 1 = 42
    expect(output).toContain('42')
  })
})

test.describe('snapshot lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await navigateToPlayground(page)
  })

  test('deleting a saved snapshot closes its open tab', async ({ page }) => {
    // Create and save a terminal snapshot
    await setDvalaCode(page, '7 * 7')
    await clickRun(page)
    await waitForOutput(page)

    // Save the terminal snapshot. saveTerminalSnapshotToSaved opens a name-prompt
    // modal; fill in the name and click Save to actually complete the save.
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    await page.evaluate(() => (window as any).Playground.saveTerminalSnapshotToSaved(0))
    // Wait for the name-prompt modal to appear
    await page.waitForSelector('.modal-panel input[aria-label="Snapshot name"]', { timeout: 3000 })
    await page.fill('.modal-panel input[aria-label="Snapshot name"]', 'test-snapshot')
    await page.click('.modal-panel__footer .button--primary')
    // Wait for the save to complete and the modal to dismiss
    await page.waitForFunction(() => document.querySelector('.modal-panel') === null, { timeout: 3000 })
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))

    // Open the saved snapshot as a tab
    const snapshotsList = page.locator('#side-snapshots-list')
    await snapshotsList.locator('.explorer-item').first().click()
    // Wait for snapshot to open in a tab
    await page.waitForFunction(() => document.querySelector('#editor-tab-strip .editor-tab[data-tab-key]') !== null, {
      timeout: 3000,
    })

    // Delete the saved snapshot
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    await page.evaluate(() => (window as any).Playground.deleteSavedSnapshot(0))

    // The snapshot view should be hidden (the snapshot tab was closed)
    await page.waitForFunction(
      () => {
        const sv = document.getElementById('dvala-snapshot-view')
        return sv === null || sv.style.display === 'none' || sv.classList.contains('hidden')
      },
      {
        timeout: 3000,
      },
    )
  })

  test('opening a snapshot tab defaults to the UI (tree) view', async ({ page }) => {
    // Create and save a terminal snapshot
    await setDvalaCode(page, 'let a = 1; a')
    await clickRun(page)
    await waitForOutput(page)

    // Save the terminal snapshot and dismiss the modal it opens
    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    await page.evaluate(() => (window as any).Playground.saveTerminalSnapshotToSaved(0))
    await page.evaluate(() => (window as any).Playground.popModal())

    // Open the saved snapshot
    const snapshotsList = page.locator('#side-snapshots-list')
    await snapshotsList.locator('.explorer-item').first().click()

    // The snapshot content should be visible (rendered inside #dvala-snapshot-view)
    await page.waitForFunction(
      () => {
        return (
          document.querySelector('.snapshot-panel__columns') !== null ||
          document.querySelector('.snapshot-panel__section') !== null
        )
      },
      { timeout: 4000 },
    )
  })

  test('pressing Enter in Monaco after switching back from a snapshot tab inserts a newline', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await clickRun(page)
    await waitForOutput(page)

    await page.evaluate(() => (window as any).Playground.showSideTab('snapshots'))
    await page.locator('#side-snapshots-list .explorer-item').first().click()
    await page.waitForFunction(() => document.querySelector('.snapshot-panel__section') !== null, { timeout: 4000 })

    await page.locator('#editor-tab-strip .editor-tab', { hasText: '<scratch>' }).click()
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')

    await page.evaluate(() =>
      (window as any).Playground.setEditorCursor((window as any).Playground.getEditorValue().length),
    )
    await page.evaluate(() => (window as any).Playground.focusDvalaCode())
    await page.keyboard.press('Enter')

    await expect.poll(async () => await getDvalaCode(page)).toBe('1 + 1\n')
    await expect.poll(async () => await getOutputText(page)).not.toContain('Resume snapshot')
  })
})
