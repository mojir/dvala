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
  }, { timeout: 10_000 })
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
  // The run button is the first <a> inside #dvala-links
  await page.locator('#dvala-links a').first().click()
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
    await page.goto('/')
    await expect(page).toHaveTitle('Playground')

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
    await page.goto('/')
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
    await page.goto('/')
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
    await page.goto('/')
    await waitForInit(page)

    // Click Examples link in sidebar
    await page.locator('#sidebar').getByText('Examples').click()

    // The example page should be active
    await expect(page.locator('#example-page')).toHaveClass(/active-content/)
  })

  test('navigating via hash shows correct page', async ({ page }) => {
    await page.goto('/#example-page')
    await waitForInit(page)
    await expect(page.locator('#example-page')).toHaveClass(/active-content/)
  })
})

test.describe('search', () => {
  test('opens search with Ctrl+K, types, and closes with Escape', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    // Navigate to examples page
    await page.locator('#sidebar').getByText('Examples').click()
    await expect(page.locator('#example-page')).toHaveClass(/active-content/)

    // Click the first "Load" button (setPlayground)
    const loadButton = page.locator('[onclick*="Playground.setPlayground"]').first()
    await loadButton.click()

    // Code should be populated
    const dvalaValue = await page.locator('#dvala-textarea').inputValue()
    expect(dvalaValue.length).toBeGreaterThan(0)

    // Output should show "Example loaded" message
    const output = await getOutputText(page)
    expect(output).toContain('Example loaded')
  })
})

test.describe('state persistence', () => {
  test('code persists across page reload', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
    await waitForInit(page)
    await page.evaluate(() => (window as any).Playground.resetPlayground())

    await setDvalaCode(page, '1 + 1')
    await page.evaluate(() => (window as any).Playground.share())

    const output = await getOutputText(page)
    expect(output).toContain('Sharable link')

    // A link with ?state= should be in the output
    const link = page.locator('#output-result a.share-link')
    const href = await link.getAttribute('href')
    expect(href).toContain('?state=')
  })
})
