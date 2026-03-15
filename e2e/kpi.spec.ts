/**
 * KPI baseline measurements for the playground rewrite.
 *
 * Run before and after the rewrite to compare:
 *   npx playwright test e2e/kpi.spec.ts --reporter=line
 *
 * Results are printed as a markdown table to stdout.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileSize(relPath: string): number {
  const abs = path.resolve(process.cwd(), relPath)
  try {
    return fs.statSync(abs).size
  }
  catch {
    return -1
  }
}

function dirSize(relPath: string): number {
  const abs = path.resolve(process.cwd(), relPath)
  let total = 0
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else total += fs.statSync(full).size
    }
  }
  walk(abs)
  return total
}

function kb(bytes: number): string {
  return bytes < 0 ? 'n/a' : `${(bytes / 1024).toFixed(1)} KB`
}

function ms(n: number): string {
  return n < 0 ? 'n/a' : `${n.toFixed(0)} ms`
}

function score(n: number): string {
  return n < 0 ? 'n/a' : n.toFixed(4)
}

async function waitForInit(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const wrapper = document.getElementById('wrapper')
    return wrapper && wrapper.style.display === 'block'
  }, { timeout: 8000 })
}

/** Inject PerformanceObservers before page load to capture Core Web Vitals. */
async function injectVitalsObservers(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as any).__kpi = { fcp: -1, lcp: -1, cls: 0, ttfb: -1 }

    // FCP — First Contentful Paint
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          (window as any).__kpi.fcp = entry.startTime
        }
      }
    }).observe({ type: 'paint', buffered: true })

    // LCP — Largest Contentful Paint (last entry wins)
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) (window as any).__kpi.lcp = last.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })

    // CLS — Cumulative Layout Shift (accumulate all shifts)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count unexpected layout shifts (no recent user input)
        if (!(entry as any).hadRecentInput) {
          (window as any).__kpi.cls += (entry as any).value
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

async function readVitals(page: import('@playwright/test').Page) {
  // Wait for networkidle so LCP has time to finalize
  await page.waitForLoadState('networkidle')
  // TTFB from Navigation Timing
  const ttfb = await page.evaluate((): number => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav ? nav.responseStart - nav.requestStart : -1
  })
  const vitals = await page.evaluate(() => (window as any).__kpi)
  return { ...vitals, ttfb } as { fcp: number, lcp: number, cls: number, ttfb: number }
}

// ---------------------------------------------------------------------------
// Measurements collected across tests — stored in module scope
// ---------------------------------------------------------------------------

const results: Record<string, string> = {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('file sizes', async () => {
  results['index.html'] = kb(fileSize('docs/index.html'))
  results['playground.js'] = kb(fileSize('docs/playground.js'))
  results['styles.css'] = kb(fileSize('docs/styles.css'))
  results['docs/ total'] = kb(dirSize('docs'))

  expect(fileSize('docs/index.html')).toBeGreaterThan(0)
  expect(fileSize('docs/playground.js')).toBeGreaterThan(0)
})

test('DOM node count at load', async ({ page }) => {
  await page.goto('')
  await waitForInit(page)

  const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length)
  results['DOM nodes at load'] = String(nodeCount)
  expect(nodeCount).toBeGreaterThan(0)
})

test('Core Web Vitals', async ({ page }) => {
  await injectVitalsObservers(page)
  await page.goto('')
  await waitForInit(page)

  const vitals = await readVitals(page)

  results['TTFB'] = ms(vitals.ttfb)
  results['FCP'] = ms(vitals.fcp)
  results['LCP'] = ms(vitals.lcp)
  results['CLS'] = score(vitals.cls)

  expect(vitals.fcp).not.toBeNaN()
  expect(vitals.lcp).not.toBeNaN()
})

test('time to playground ready', async ({ page }) => {
  const t0 = Date.now()
  await page.goto('')
  await waitForInit(page)
  const elapsed = Date.now() - t0

  results['time to playground ready'] = ms(elapsed)
  expect(elapsed).toBeLessThan(10000)
})

test('time to navigate to a doc page', async ({ page }) => {
  await page.goto('')
  await waitForInit(page)

  const t0 = Date.now()
  await page.evaluate(() => (window as any).Playground.showPage('collection-map', 'smooth'))
  await page.waitForFunction(() =>
    document.getElementById('collection-map')?.classList.contains('active-content'),
  { timeout: 5000 })
  const elapsed = Date.now() - t0

  results['time to navigate to doc page'] = ms(elapsed)
  expect(elapsed).toBeLessThan(5000)
})

// ---------------------------------------------------------------------------
// Print summary table
// ---------------------------------------------------------------------------

test.afterAll(async () => {
  const rows = Object.entries(results)
  if (rows.length === 0) return

  const col1 = Math.max(...rows.map(([k]) => k.length), 'Metric'.length)
  const col2 = Math.max(...rows.map(([, v]) => v.length), 'Value'.length)
  const sep = `| ${'-'.repeat(col1)} | ${'-'.repeat(col2)} |`
  const header = `| ${'Metric'.padEnd(col1)} | ${'Value'.padEnd(col2)} |`

  // eslint-disable-next-line no-console
  console.log('\n## Playground KPI Baseline\n')
  // eslint-disable-next-line no-console
  console.log([header, sep, ...rows.map(([k, v]) => `| ${k.padEnd(col1)} | ${v.padEnd(col2)} |`)].join('\n'))
  // eslint-disable-next-line no-console
  console.log()
})
