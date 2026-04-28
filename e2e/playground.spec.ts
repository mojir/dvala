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

/** Set context JSON via localStorage state (the context textarea is not directly visible in the new UI). */
async function setContext(page: Page, json: string) {
  // The context textarea is a backing element and not shown directly in the new UI.
  // Set context state directly via localStorage and trigger an applyState cycle.
  await page.evaluate((contextJson: string) => {
    localStorage.setItem('playground-context', JSON.stringify(contextJson))
    localStorage.setItem('playground-scratch-context', JSON.stringify(contextJson))
    // Also set the textarea value and fire an input event so the app picks it up
    const textarea = document.getElementById('context-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      textarea.value = contextJson
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
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

/** Read the first saved file's id from its `data-file-id` attribute. */
async function firstSavedFileId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const item = document.querySelector<HTMLElement>('#explorer-file-list .explorer-item[data-file-id]')
    return item?.dataset['fileId'] ?? null
  })
}

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
    const contextValue = await page.locator('#context-textarea').inputValue()
    const outputHtml = await page.locator('#output-result').innerHTML()

    expect(dvalaValue).toBe('')
    expect(contextValue).toBe('')
    expect(outputHtml).toBe('')
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

    // The context textarea is a hidden backing element; read its value via evaluate
    const contextValue = await page.evaluate(() => {
      const textarea = document.getElementById('context-textarea') as HTMLTextAreaElement | null
      return textarea?.value ?? ''
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
  // The name input modal is inside #snapshot-panel-container (inside #snapshot-modal)
  const input = page.locator('#snapshot-modal .modal-panel input[type="text"]')
  await input.waitFor({ timeout: 2000 })
  await input.fill(name)
  await input.press('Enter')
}

test.describe('files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    // Clear all saved files to ensure a clean state
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
  })

  test('files side panel shows only scratch when no files saved', async ({ page }) => {
    await navigateToPlayground(page)
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const fileList = page.locator('#explorer-file-list')
    await expect(fileList).toBeVisible()
    // Only the Scratch item should be present, no saved file cards
    const cards = fileList.locator('.snapshot-card')
    await expect(cards).toHaveCount(0)
  })

  test('saving code creates a file entry in the files panel', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await saveAsFile(page, 'My Test File')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    // Wait for the saved file to appear as an explorer-item (scratch is always first)
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        // More than 1 item means scratch + at least one saved file
        return items.length > 1
      },
      { timeout: 5000 },
    )
    const fileList = page.locator('#explorer-file-list')
    await expect(fileList).toContainText('My Test File')
  })

  test('loading a saved file restores code into editor', async ({ page }) => {
    await setDvalaCode(page, '99 * 2')
    await saveAsFile(page, 'Restore Test')

    // Reset playground (scratch), then click the saved file item to load it
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        return items.length > 1
      },
      { timeout: 5000 },
    )
    // Click the second explorer item (first is scratch)
    await page.locator('#explorer-file-list .explorer-item').nth(1).click()

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

    // Delete via JS using the first saved file's data-file-id attribute
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>('#explorer-file-list .explorer-item[data-file-id]')
      const first = items[0]
      const id = first?.dataset['fileId']
      if (id) (window as any).Playground.deleteSavedFile(id)
    })

    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('#explorer-file-list .explorer-item')
        return items.length === 1 // only scratch remains
      },
      { timeout: 5000 },
    )
    // Only scratch remains
    await expect(page.locator('#explorer-file-list .explorer-item')).toHaveCount(1)
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
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
    await setDvalaCode(page, 'perform(@playground.files.load, "does-not-exist")')
    await clickRun(page)
    await waitForOutput(page)
    const output = await getOutputText(page)
    expect(output.toLowerCase()).toContain('not found')
  })

  // ── Files ──

  test('storage save, list, and load round-trip', async ({ page }) => {
    // Clear any existing saved files
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())

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
    await expect(pill).toContainText('<scratch>')
  })

  test('filename pill updates when a file is loaded', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
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
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
    await navigateToPlayground(page)
  })

  test('scratch item appears at top of file list with no context menu button', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const scratchItem = page.locator('#explorer-file-list .explorer-item').first()
    await expect(scratchItem).toBeVisible()
    await expect(scratchItem).toContainText('<scratch>')
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

  test('stats panel appears when a saved file is selected', async ({ page }) => {
    await setDvalaCode(page, '42')
    await saveAsFile(page, 'stats-test')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    // click the saved file (second item)
    await page.locator('#explorer-file-list .explorer-item').nth(1).click()

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
    await expect(pill).toContainText('<scratch>')
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
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
    await navigateToPlayground(page)
  })

  test('renaming a file updates its name in the list', async ({ page }) => {
    await setDvalaCode(page, '1')
    await saveAsFile(page, 'original-name')

    const fileId = await firstSavedFileId(page)
    expect(fileId).toBeTruthy()

    // Rename via JS API
    await page.evaluate((id: string) => {
      ;(window as any).Playground.renameFile(id)
    }, fileId!)

    // Fill in the rename input
    const input = page.locator('#snapshot-modal .modal-panel input[type="text"]')
    await input.waitFor({ timeout: 2000 })
    await input.fill('renamed-file')
    await input.press('Enter')

    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    await expect(page.locator('#explorer-file-list')).toContainText('renamed-file')
  })

  test('duplicating a file adds a second entry', async ({ page }) => {
    await setDvalaCode(page, '2 + 2')
    await saveAsFile(page, 'dup-source')

    const fileId = await firstSavedFileId(page)
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

  test('locking a file makes the editor read-only', async ({ page }) => {
    await setDvalaCode(page, 'locked')
    await saveAsFile(page, 'lock-me')

    const fileId = await firstSavedFileId(page)
    await page.evaluate((id: string) => (window as any).Playground.toggleFileLock(id), fileId!)

    // Load the locked file
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), fileId!)
    await navigateToPlayground(page)

    const isReadOnly = await page.evaluate(() => (window as any).Playground.isEditorReadOnly())
    expect(isReadOnly).toBe(true)
  })

  test('closing an open file returns to scratch', async ({ page }) => {
    await setDvalaCode(page, '7')
    await saveAsFile(page, 'close-me')

    // The close button is shown when the files side tab is active
    await page.evaluate(() => (window as any).Playground.showSideTab('files'))
    const closeBtn = page.locator('#file-close-btn')
    await expect(closeBtn).toBeVisible({ timeout: 3000 })
    await closeBtn.click()

    const pill = page.locator('#editor-toolbar .editor-toolbar__title')
    await expect(pill).toContainText('<scratch>')
  })

  test('files with `/` in the path render as a folder tree', async ({ page }) => {
    // Seed three files: one at the root + two sharing an `examples/` folder.
    // The folder is collapsed by default — its children only render after
    // a click on the folder row.
    await page.evaluate(() => {
      const w = window as any
      w.Playground.setSavedFilesForTesting([
        { id: 'a', path: 'root.dvala', code: '1', context: '', createdAt: 1, updatedAt: 1, locked: false },
        { id: 'b', path: 'examples/foo.dvala', code: '2', context: '', createdAt: 2, updatedAt: 2, locked: false },
        { id: 'c', path: 'examples/bar.dvala', code: '3', context: '', createdAt: 3, updatedAt: 3, locked: false },
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
      w.Playground.setSavedFilesForTesting([
        { id: 'a', path: 'examples/foo.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
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

  test('multi-file import: a saved file can `import` another saved file and run', async ({ page }) => {
    // Seed two files where `main.dvala` imports `./lib.dvala` from the same
    // folder. Loading `main` and clicking Run should execute end-to-end —
    // the playground's fileResolver consults the in-memory saved-files
    // cache the same way `dvala run` consults disk.
    const mainId = '11111111-1111-1111-1111-111111111111'
    const libId = '22222222-2222-2222-2222-222222222222'
    await page.evaluate(
      ({ mainId, libId }) => {
        const w = window as any
        w.Playground.setSavedFilesForTesting([
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
            locked: false,
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
            locked: false,
          },
        ])
      },
      { mainId, libId },
    )
    // Load main.dvala and run it.
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), mainId)
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
        w.Playground.setSavedFilesForTesting([
          {
            id: libId,
            path: 'lib/math.dvala',
            code: 'let double = (n) -> n * 2;\n{ double }',
            context: '',
            createdAt: 1,
            updatedAt: 1,
            locked: false,
          },
          {
            id: mainId,
            path: 'main.dvala',
            code: 'let { double } = import("./lib/math");\ndouble(21)',
            context: '',
            createdAt: 2,
            updatedAt: 2,
            locked: false,
          },
        ])
      },
      { mainId, libId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), mainId)
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
        w.Playground.setSavedFilesForTesting([
          {
            id: libId,
            path: 'lib/math.dvala',
            code: 'let triple = (n) -> n * 3;\n{ triple }',
            context: '',
            createdAt: 1,
            updatedAt: 1,
            locked: false,
          },
          {
            id: mainId,
            path: 'tests/main.dvala',
            code: 'let { triple } = import("../lib/math");\ntriple(14)',
            context: '',
            createdAt: 2,
            updatedAt: 2,
            locked: false,
          },
        ])
      },
      { mainId, libId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), mainId)
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
      w.Playground.setSavedFilesForTesting([
        {
          id,
          path: 'main.dvala',
          code: 'import("./does-not-exist")',
          context: '',
          createdAt: 1,
          updatedAt: 1,
          locked: false,
        },
      ])
    }, mainId)
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), mainId)
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
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
    await navigateToPlayground(page)
  })

  test('opening a saved file adds a tab; switching tabs swaps the editor content', async ({ page }) => {
    // Seed two files and open both. The strip should show scratch + 2 file
    // tabs; clicking a tab switches the active file.
    const aId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const bId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setSavedFilesForTesting([
          { id: aId, path: 'a.dvala', code: '111', context: '', createdAt: 1, updatedAt: 1, locked: false },
          { id: bId, path: 'b.dvala', code: '222', context: '', createdAt: 2, updatedAt: 2, locked: false },
        ])
      },
      { aId, bId },
    )
    // Open both files via the explorer (which routes through openOrFocusFile).
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), bId)

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
      w.Playground.setSavedFilesForTesting([
        { id, path: 'closeable.dvala', code: 'X', context: '', createdAt: 1, updatedAt: 1, locked: false },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), aId)

    // Click the close button on the active tab. The selector grabs the
    // close button inside the one and only file tab (scratch has no close).
    await page.locator('#editor-tab-strip .editor-tab--active .editor-tab__close').click()

    // After close, only the scratch tab remains.
    await expect(page.locator('#editor-tab-strip .editor-tab')).toHaveCount(1)
    await expect(page.locator('#editor-tab-strip .editor-tab--active')).toContainText('<scratch>')
  })

  test('the scratch tab cannot be closed (no × button)', async ({ page }) => {
    // No file ever opened — only the scratch tab exists.
    const closeButtons = page.locator('#editor-tab-strip .editor-tab__close')
    await expect(closeButtons).toHaveCount(0)
  })

  test('open tab list + active tab survives a reload', async ({ page }) => {
    const aId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const bId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setSavedFilesForTesting([
          { id: aId, path: 'persist-a.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1, locked: false },
          { id: bId, path: 'persist-b.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2, locked: false },
        ])
      },
      { aId, bId },
    )
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), aId)
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), bId)
    // Switch back to a.dvala so it's the active tab on reload.
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), aId)

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
      w.Playground.setSavedFilesForTesting([
        { id, path: 'dirty-test.dvala', code: 'baseline', context: '', createdAt: 1, updatedAt: 1, locked: false },
      ])
    }, aId)
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), aId)

    // Buffer matches file.code → no dot.
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(0)

    // Mutate the buffer — dot should appear.
    await page.evaluate(() => (window as any).Playground.setEditorValue('mutated'))
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(1)

    // Restore — dot should disappear.
    await page.evaluate(() => (window as any).Playground.setEditorValue('baseline'))
    await expect(page.locator('#editor-tab-strip .editor-tab--dirty')).toHaveCount(0)
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
    await page.evaluate(() => (window as any).Playground.clearAllSavedFiles())
    await navigateToPlayground(page)
  })

  test('opens a centered palette listing all saved files', async ({ page }) => {
    const aId = '11111111-1111-4111-8111-111111111111'
    const bId = '22222222-2222-4222-8222-222222222222'
    await page.evaluate(
      ({ aId, bId }) => {
        const w = window as any
        w.Playground.setSavedFilesForTesting([
          { id: aId, path: 'main.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
          { id: bId, path: 'lib/util.dvala', code: '', context: '', createdAt: 2, updatedAt: 2, locked: false },
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
      w.Playground.setSavedFilesForTesting([
        { id: 'a', path: 'main.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
        { id: 'b', path: 'lib/util.dvala', code: '', context: '', createdAt: 2, updatedAt: 2, locked: false },
        { id: 'c', path: 'examples/foo.dvala', code: '', context: '', createdAt: 3, updatedAt: 3, locked: false },
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
      w.Playground.setSavedFilesForTesting([
        { id, path: 'target.dvala', code: 'OPENED', context: '', createdAt: 1, updatedAt: 1, locked: false },
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
      w.Playground.setSavedFilesForTesting([
        { id: 'x', path: 'x.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
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
        w.Playground.setSavedFilesForTesting([
          { id: aId, path: 'first.dvala', code: 'A', context: '', createdAt: 1, updatedAt: 1, locked: false },
          { id: bId, path: 'second.dvala', code: 'B', context: '', createdAt: 2, updatedAt: 2, locked: false },
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

  test('does nothing when the workspace has no saved files', async ({ page }) => {
    // resetPlayground + clearAllSavedFiles in beforeEach already left zero
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

  test('right panel shows all four tool tabs (Tokens / AST / CST / Doc Tree) in pipeline order', async ({ page }) => {
    // Open the panel via parse(); all four tabs should be present in the
    // strip in pipeline order — the user switches between them by clicking,
    // no summon-on-demand mechanism.
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())

    const strip = page.locator('#right-panel .panel-shell__strip')
    const tabIds = await strip
      .locator('[data-panel-tab-id]')
      .evaluateAll(els => els.map(el => (el as HTMLElement).dataset['panelTabId']))
    expect(tabIds).toEqual(['tokens', 'ast', 'cst', 'doc'])
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
    // Seed a saved file with a Let-statement source. The active tab will
    // be scratch (with `1 + 2`), so initial AST shows a Call node.
    const fileId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    await page.evaluate(
      ({ id }: { id: string }) => {
        const w = window as any
        w.Playground.setSavedFilesForTesting([
          { id, path: 'letFile.dvala', code: 'let a = 1; a', context: '', createdAt: 1, updatedAt: 1, locked: false },
        ])
      },
      { id: fileId },
    )

    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    const astBody = page.locator('#right-panel .panel-shell__body[data-panel-tab-id="ast"]')
    await expect(astBody).toContainText('Call')

    // Open the saved file as a new tab; the afterSwap hook should re-run
    // the AST tool against the new active file's source (`let a = 1; a`).
    await page.evaluate((id: string) => (window as any).Playground.loadSavedFile(id), fileId)
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
  test('switching away from editor and back preserves side panel state in URL', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await navigateToPlayground(page)

    // Switch to context side panel
    await page.evaluate(() => (window as any).Playground.showSideTab('context'))
    await page.waitForFunction(() => window.location.search.includes('view=context'), { timeout: 3000 })
    expect(page.url()).toContain('view=context')

    // Navigate away to book tab
    await page.evaluate(() => (window as any).Playground.navigateToTab('book'))
    await page.waitForFunction(
      () => {
        const dynPage = document.getElementById('dynamic-page')
        return dynPage !== null && dynPage.innerHTML.length > 0
      },
      { timeout: 5000 },
    )

    // Navigate back to editor tab
    await page.evaluate(() => (window as any).Playground.navigateToTab('editor'))
    await page.locator('#tab-editor').waitFor({ state: 'visible', timeout: 3000 })

    // URL should reflect the context panel state
    expect(page.url()).toContain('view=context')
  })
  test('switching away from editor and back preserves snapshot side panel', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await navigateToPlayground(page)

    // Click the snapshots side panel icon
    await page.locator('#side-icon-snapshots').click()
    await page.waitForFunction(() => window.location.search.includes('view=snapshots'), { timeout: 3000 })

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

    // Snapshots icon should still be active and URL should reflect snapshots panel
    await expect(page.locator('#side-icon-snapshots')).toHaveClass(/side-panel__icon--active/)
    expect(page.url()).toContain('view=snapshots')
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
