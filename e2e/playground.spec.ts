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
  await page.waitForFunction(() => {
    const wrapper = document.getElementById('wrapper')
    return wrapper && wrapper.style.display === 'block'
  }, { timeout: 4_500 })
}

/** Clear the playground and type code into the Dvala textarea. */
async function setDvalaCode(page: Page, code: string) {
  const textarea = page.locator('#dvala-textarea')
  await textarea.click()
  await textarea.fill(code)
}

/** Clear the context textarea and type JSON into it. */
async function setContext(page: Page, json: string) {
  const textarea = page.locator('#context-textarea')
  await textarea.click()
  await textarea.fill(json)
}

/** Click the Run button (the play icon next to the Dvala Code title). */
async function clickRun(page: Page) {
  // The run button is the first <a> inside .panel-header__actions in #dvala-panel
  await page.locator('#dvala-panel .panel-header__actions a').first().click()
}

/** Wait for output to appear in the output panel. */
async function waitForOutput(page: Page, timeout = 5000) {
  await page.locator('#output-result').locator('span').first().waitFor({ timeout })
}

/** Get all text content of the output panel. */
async function getOutputText(page: Page): Promise<string> {
  return (await page.locator('#output-result').textContent()) ?? ''
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
    // Key panels exist
    await expect(page.locator('#sidebar')).toBeVisible()
    await expect(page.locator('#playground')).toBeVisible()
    await expect(page.locator('#context-textarea')).toBeVisible()
    await expect(page.locator('#dvala-textarea')).toBeVisible()
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

  test('runs code with context bindings', async ({ page }) => {
    await setContext(page, '{"bindings": {"x": 15, "y": 27}}')
    await setDvalaCode(page, 'x + y')
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
    await page.locator('#dvala-textarea').press('Control+r')
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
    await setDvalaCode(page, 'unknown-symbol')
    // Open more menu and click Analyze
    await page.evaluate(() => (window as any).Playground.analyze())
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('Unresolved symbols')
    expect(output).toContain('unknown-symbol')
  })

  test('tokenize produces output', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.tokenize())
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('Tokenize')
    expect(output).toContain('Number')
  })

  test('parse produces AST output', async ({ page }) => {
    await setDvalaCode(page, '1 + 2')
    await page.evaluate(() => (window as any).Playground.parse())
    await waitForOutput(page)

    const output = await getOutputText(page)
    expect(output).toContain('Parse')
    expect(output).toContain('body')
  })

  test('reset playground clears everything', async ({ page }) => {
    await setDvalaCode(page, 'some code')
    await setContext(page, '{"bindings":{}}')

    await page.evaluate(() => (window as any).Playground.resetPlayground())

    const dvalaValue = await page.locator('#dvala-textarea').inputValue()
    const contextValue = await page.locator('#context-textarea').inputValue()
    const outputHtml = await page.locator('#output-result').innerHTML()

    expect(dvalaValue).toBe('')
    expect(contextValue).toBe('')
    expect(outputHtml).toBe('')
  })
})

test.describe('navigation', () => {
  test('sidebar links navigate to content pages', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Click Examples link in sidebar
    await page.locator('#sidebar').getByText('Examples').click()

    // The examples page should be rendered into #dynamic-page
    await page.waitForFunction(() => {
      const dynPage = document.getElementById('dynamic-page')
      return dynPage !== null && dynPage.innerHTML.length > 0
    }, { timeout: 5000 })
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
    // Check that URL contains /examples
    expect(page.url()).toContain('/examples')
  })

  test('navigating via path shows correct page', async ({ page }) => {
    await page.goto('/examples')
    await waitForInit(page)
    // The examples page should be rendered into #dynamic-page
    await page.waitForFunction(() => {
      const dynPage = document.getElementById('dynamic-page')
      return dynPage !== null && dynPage.innerHTML.length > 0
    }, { timeout: 5000 })
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
  })
})

test.describe('search', () => {
  test('opens search with Ctrl+K, types, and closes with Escape', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)

    // Open search via keyboard
    await page.keyboard.press('Control+k')
    await expect(page.locator('#search-dialog')).toBeVisible()

    // Type a search query
    await page.locator('#search-input').fill('map')
    // Results or no-results should appear
    const hasResults = await page.locator('#search-result').isVisible()
    const hasNoResults = await page.locator('#no-search-result').isVisible()
    expect(hasResults || hasNoResults).toBe(true)

    // Close with Escape
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.locator('#search-dialog-overlay')).toBeHidden()
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
    await page.waitForFunction(() => {
      const dynPage = document.getElementById('dynamic-page')
      return dynPage !== null && dynPage.querySelector('.content-page') !== null
    }, { timeout: 5000 })

    // Click the first "Load in playground" button
    const loadButton = page.locator('#dynamic-page [onclick*="Playground.setPlayground"]').first()
    await loadButton.waitFor({ timeout: 3000 })
    await loadButton.click()

    // Code should be populated in the editor
    const dvalaValue = await page.locator('#dvala-textarea').inputValue()
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

    // Reload
    await page.reload()
    await waitForInit(page)

    const dvalaValue = await page.locator('#dvala-textarea').inputValue()
    expect(dvalaValue).toBe(code)
  })
})

test.describe('share', () => {
  test('share generates a link with encoded state', async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    await setDvalaCode(page, '1 + 1')

    // share() writes the URL to clipboard — intercept clipboard.writeText to capture it
    const shareUrl = await page.evaluate(async () => {
      let captured = ''
      navigator.clipboard.writeText = async (text: string) => { captured = text }
      ;(window as any).Playground.share()
      // Allow the async clipboard promise to resolve
      await new Promise(r => setTimeout(r, 50))
      return captured
    })

    expect(shareUrl).toContain('?state=')

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
    const encodedState = await page.evaluate(({ c, ctx }) => {
      return btoa(encodeURIComponent(JSON.stringify({ 'dvala-code': c, 'context': ctx })))
    }, { c: code, ctx: context })

    await page.goto(`?state=${encodedState}`)
    await waitForInit(page)

    const dvalaValue = await page.locator('#dvala-textarea').inputValue()
    const contextValue = await page.locator('#context-textarea').inputValue()
    expect(dvalaValue).toBe(code)
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

  test('running code creates a terminal snapshot', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await clickRun(page)
    await waitForOutput(page)

    await page.evaluate(() => (window as any).Playground.showSnapshotsPage())
    await expect(page.locator('#snapshots-page')).toHaveClass(/active-content/)

    // At least one snapshot card should exist
    await expect(page.locator('#snapshots-list .snapshot-card').first()).toBeVisible()
  })

  test('sidebar indicator appears after run and clears when snapshots page opens', async ({ page }) => {
    const indicator = page.locator('#snapshots-nav-indicator')

    // Indicator hidden initially
    await expect(indicator).toBeHidden()

    await setDvalaCode(page, '2 + 2')
    await clickRun(page)
    await waitForOutput(page)

    // Indicator should be visible now
    await expect(indicator).toBeVisible()

    // Navigate to snapshots page — indicator should clear
    await page.evaluate(() => (window as any).Playground.showSnapshotsPage())
    await expect(indicator).toBeHidden()
  })

  test('saving a terminal snapshot moves it to saved section', async ({ page }) => {
    await setDvalaCode(page, '3 + 3')
    await clickRun(page)
    await waitForOutput(page)

    await page.evaluate(() => (window as any).Playground.showSnapshotsPage())

    // Save the first terminal snapshot
    await page.evaluate(() => (window as any).Playground.saveTerminalSnapshotToSaved(0))

    // A saved snapshot card should now exist
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#snapshots-list .snapshot-card')
      return cards.length > 0
    })
    await expect(page.locator('#snapshots-list .snapshot-card').first()).toBeVisible()
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
    await page.evaluate(() => (window as any).Playground.showPage('settings-page', 'smooth'))
    await expect(page.locator('#settings-page')).toHaveClass(/active-content/)

    const toggle = page.locator('#settings-auto-checkpoint-toggle')
    await toggle.scrollIntoViewIfNeeded()
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

    await setDvalaCode(page, 'perform(effect(dvala.checkpoint), "test point")')
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
    await page.waitForFunction(() => {
      const spans = document.querySelectorAll('#output-result span.result')
      return spans.length >= 2
    }, { timeout: 5000 })

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

  test('clicking a sidebar API section expands it', async ({ page }) => {
    // Expand "Core functions" section
    await page.evaluate(() => (window as any).Playground.toggleApiSection('core-functions'))

    const content = page.locator('#api-content-core-functions')
    await expect(content).toHaveClass(/expanded/)
  })

  test('clicking an expanded section collapses it', async ({ page }) => {
    // First expand
    await page.evaluate(() => (window as any).Playground.toggleApiSection('special-expressions', false))
    await expect(page.locator('#api-content-special-expressions')).toHaveClass(/expanded/)

    // Then collapse
    await page.evaluate(() => (window as any).Playground.toggleApiSection('special-expressions', false))
    await expect(page.locator('#api-content-special-expressions')).not.toHaveClass(/expanded/)
  })

  test('search result navigates to correct doc page', async ({ page }) => {
    // Open search and type 'map'
    await page.keyboard.press('Control+k')
    await page.locator('#search-input').fill('map')

    // Click first result (search results are div.search-dialog__entry elements)
    const firstResult = page.locator('#search-result .search-dialog__entry').first()
    await firstResult.waitFor({ timeout: 3000 })
    const resultText = await firstResult.textContent()
    await firstResult.click()

    // A doc page should be rendered in #dynamic-page
    await page.waitForFunction(() => {
      const dynPage = document.getElementById('dynamic-page')
      return dynPage !== null && dynPage.innerHTML.length > 0
    }, { timeout: 5000 })
    const dynPage = page.locator('#dynamic-page')
    await expect(dynPage).toBeVisible()
    expect(resultText?.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/** Save current code as a named program via the saveAs modal. */
async function saveAsProgram(page: Page, name: string) {
  await page.evaluate(() => (window as any).Playground.saveAs())
  // The name input modal is dynamically created — browser normalizes rgba(0,0,0,0.5) with spaces
  const input = page.locator('[style*="rgba(0, 0, 0, 0.5)"] input[type="text"]')
  await input.waitFor({ timeout: 2000 })
  await input.fill(name)
  await input.press('Enter')
}

test.describe('programs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    // Clear all saved programs to ensure a clean state
    await page.evaluate(() => (window as any).Playground.clearAllSavedPrograms())
  })

  test('programs page shows empty state when no programs saved', async ({ page }) => {
    await page.evaluate(() => (window as any).Playground.showSavedProgramsPage())
    await expect(page.locator('#saved-programs-page')).toHaveClass(/active-content/)
    await expect(page.locator('#saved-programs-empty')).toBeVisible()
  })

  test('saving code creates a program card', async ({ page }) => {
    await setDvalaCode(page, '1 + 1')
    await saveAsProgram(page, 'My Test Program')

    await page.evaluate(() => (window as any).Playground.showSavedProgramsPage())
    // Wait for the page to become active before checking card visibility
    await expect(page.locator('#saved-programs-page')).toHaveClass(/active-content/)

    await page.waitForFunction(() =>
      document.querySelectorAll('#saved-programs-list .snapshot-card').length > 0,
    )
    const card = page.locator('#saved-programs-list .snapshot-card').first()
    await expect(card).toBeVisible()
    await expect(card).toContainText('My Test Program')
  })

  test('nav indicator appears after save and clears when programs page opens', async ({ page }) => {
    const indicator = page.locator('#programs-nav-indicator')
    await expect(indicator).toBeHidden()

    await setDvalaCode(page, '2 + 2')
    await saveAsProgram(page, 'Indicator Test')

    await expect(indicator).toBeVisible()

    await page.evaluate(() => (window as any).Playground.showSavedProgramsPage())
    await expect(indicator).toBeHidden()
  })

  test('loading a saved program restores code into editor', async ({ page }) => {
    await setDvalaCode(page, '99 * 2')
    await saveAsProgram(page, 'Restore Test')

    // Navigate to programs page so the card is rendered, get ID from DOM, then load
    await page.evaluate(() => (window as any).Playground.showSavedProgramsPage())
    await page.waitForFunction(() =>
      document.querySelectorAll('#saved-programs-list .snapshot-card').length > 0,
    )
    await page.evaluate(() => (window as any).Playground.resetPlayground())
    await page.evaluate(() => {
      const id = document.querySelector('#saved-programs-list .snapshot-card')?.getAttribute('data-program-id')
      if (id) (window as any).Playground.loadSavedProgram(id)
    })

    const value = await page.locator('#dvala-textarea').inputValue()
    expect(value).toBe('99 * 2')
  })

  test('deleting a program removes it from the list', async ({ page }) => {
    await setDvalaCode(page, '5 + 5')
    await saveAsProgram(page, 'Delete Me')

    await page.evaluate(() => (window as any).Playground.showSavedProgramsPage())
    // Wait for the page to become active before checking
    await expect(page.locator('#saved-programs-page')).toHaveClass(/active-content/)
    await page.waitForFunction(() =>
      document.querySelectorAll('#saved-programs-list .snapshot-card').length > 0,
    )

    // Delete via JS using the first program's id
    await page.evaluate(() => {
      const id = document.querySelector('#saved-programs-list .snapshot-card')?.getAttribute('data-program-id')
      if (id) (window as any).Playground.deleteSavedProgram(id)
    })

    await page.waitForFunction(() =>
      document.querySelectorAll('#saved-programs-list .snapshot-card').length === 0,
    )
    // Ensure page is still active before checking empty state visibility
    await expect(page.locator('#saved-programs-page')).toHaveClass(/active-content/)
    await expect(page.locator('#saved-programs-empty')).toBeVisible()
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
  test('playground.js contains sourceMappingURL comment', async ({ page }) => {
    const response = await page.goto('/playground.js')
    expect(response?.status()).toBe(200)
    const content = await response?.text()
    expect(content).toContain('//# sourceMappingURL=playground.js.map')
  })

  test('playground.js.map is accessible and valid', async ({ page }) => {
    const response = await page.goto('/playground.js.map')
    expect(response?.status()).toBe(200)
    const content = await response?.text()
    const map = JSON.parse(content!)
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

    // Navigate to about
    await page.evaluate(() => (window as any).Playground.navigate('/about'))
    await expect(page).toHaveTitle(/About.*Dvala/)

    // Navigate to tutorials
    await page.evaluate(() => (window as any).Playground.navigate('/tutorials'))
    await expect(page).toHaveTitle(/Tutorials.*Dvala/)

    // Navigate to examples
    await page.evaluate(() => (window as any).Playground.navigate('/examples'))
    await expect(page).toHaveTitle(/Examples.*Dvala/)
  })
})
