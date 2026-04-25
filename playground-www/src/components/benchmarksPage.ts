/**
 * Benchmarks page (Settings → Developer → Benchmarks tab).
 *
 * Renders the perf-history JSON as Chart.js line charts inside the
 * playground. Mirrors `benchmarks/visualize.ts` (the standalone HTML
 * generator) but uses playground CSS variables for theming and lazy-
 * loads Chart.js from CDN on first render — keeps the playground
 * bundle slim for the 99% of users who never open this tab.
 *
 * Source of truth: `benchmarks/pipeline-history.json` (imported at
 * build time so the chart works offline once the page has loaded).
 */

// Build-time JSON import — rolldown bundles the file contents as a
// constant. No runtime fetch, works offline.
import history from '../../../benchmarks/pipeline-history.json'

interface MeasurementValue {
  median: number
  min: number
  max: number
  unit: 'ms' | 'us'
}

interface MachineInfo {
  fingerprint: string
  cpu: string
  cores: number
  memoryGB: number
  os: string
  node: string
  onBattery: boolean | null
  loadAvg1m: number
}

interface RunEntry {
  timestamp: string
  commit: string
  commitMessage: string
  machine?: MachineInfo
  scenarios: Record<string, Record<string, MeasurementValue | null>>
}

interface ScenarioMeta {
  id: string
  title: string
  description: string
}

interface History {
  scenarios: ScenarioMeta[]
  runs: RunEntry[]
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js'

let chartJsLoadPromise: Promise<void> | null = null

/**
 * Lazy-load Chart.js from CDN. Idempotent — repeat calls return the
 * same promise so we never inject the script twice.
 */
function loadChartJs(): Promise<void> {
  if ((window as unknown as { Chart?: unknown }).Chart) return Promise.resolve()
  if (chartJsLoadPromise) return chartJsLoadPromise
  chartJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHART_JS_CDN
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Chart.js from CDN'))
    document.head.appendChild(script)
  })
  return chartJsLoadPromise
}

/**
 * Read a CSS custom property from the document root. Used so the
 * chart picks up live theme colors (responds to dark/light toggles).
 */
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/**
 * Repeatable colour palette — same `idx` always picks the same colour
 * across charts so a measurement keeps its visual identity.
 */
function pickColor(idx: number, alpha = 1): string {
  const palette: [number, number, number][] = [
    [54, 162, 235], [255, 99, 132], [75, 192, 192], [255, 159, 64],
    [153, 102, 255], [255, 205, 86], [99, 200, 99], [201, 76, 76],
    [148, 84, 199], [80, 145, 195],
  ]
  const [r, g, b] = palette[idx % palette.length]!
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Track the chart instances we've created so re-rendering doesn't leak. */
const liveCharts: { destroy: () => void }[] = []

/**
 * Render the benchmarks panel. Called every time the tab is shown —
 * idempotent: existing charts are destroyed first to avoid leaks
 * across re-renders.
 */
export async function renderBenchmarksCharts(): Promise<void> {
  const container = document.getElementById('settings-benchmarks-charts')
  if (!container) return

  // Tear down any existing charts before re-rendering. Chart.js leaks
  // canvas listeners if we just blow away the DOM without calling destroy.
  while (liveCharts.length > 0) {
    try { liveCharts.pop()!.destroy() } catch { /* ignore */ }
  }

  // Cast through `unknown`: rolldown infers a narrow literal-typed shape
  // for the imported JSON (specific scenario IDs as keys), which doesn't
  // satisfy the abstract `Record<string, ...>` interface even though
  // it's structurally compatible at runtime.
  const h = history as unknown as History
  // Newest-first stored, but charts read left-to-right chronologically.
  const runs = [...h.runs].reverse()

  if (runs.length === 0) {
    container.innerHTML = '<p>No benchmark runs yet. Run <code>npm run benchmarks:run</code> to generate data.</p>'
    return
  }

  // Multiple machine fingerprints in the visible window means the
  // chart compares apples-to-oranges — surface as a banner.
  const fingerprints = new Set(runs.map(r => r.machine?.fingerprint).filter(Boolean) as string[])
  const mixedHardware = fingerprints.size > 1

  // Build the panel skeleton: warning banner (if mixed) + run table + per-scenario chart slots.
  container.innerHTML = `
    ${mixedHardware
      ? `<div class="benchmarks-warning">⚠ Runs span ${fingerprints.size} different hardware fingerprints — perf differences may reflect machine, not code. Hover a point for its fingerprint.</div>`
      : ''}
    <details class="benchmarks-runs">
      <summary>Run history (${runs.length})</summary>
      <table>
        <tr><th>Commit</th><th>Date</th><th>Message</th><th>Machine</th></tr>
        ${runs.map(r => {
          const machineCell = r.machine
            ? `<code>${escapeHtml(r.machine.fingerprint)}</code> ${escapeHtml(r.machine.cpu)}${r.machine.onBattery === true ? ' 🔋' : ''}`
            : '—'
          return `<tr><td><code>${escapeHtml(r.commit)}</code></td><td>${escapeHtml(r.timestamp.slice(0, 19).replace('T', ' '))}</td><td>${escapeHtml(r.commitMessage)}</td><td>${machineCell}</td></tr>`
        }).join('')}
      </table>
    </details>
    ${h.scenarios.map((_sc, i) => `
      <div class="benchmarks-chart">
        <canvas id="benchmarks-canvas-${i}"></canvas>
      </div>
    `).join('')}
  `

  // Lazy-load Chart.js, then create one chart per scenario.
  try {
    await loadChartJs()
  } catch (e) {
    container.innerHTML += `<p class="benchmarks-error">Failed to load Chart.js: ${escapeHtml(String(e))}</p>`
    return
  }

  type ChartCtor = new (canvas: HTMLCanvasElement, config: unknown) => { destroy: () => void }
  const Chart = (window as unknown as { Chart: ChartCtor }).Chart

  // Resolve theme colors at render time so dark/light toggles take effect on next render.
  const textColor = cssVar('--color-text', '#d4d4d4')
  const gridColor = cssVar('--color-border-subtle', '#323232')

  const xLabels = runs.map(r => r.commit)
  const xTooltips = runs.map(r => {
    const base = `${r.commit}\n${r.timestamp.slice(0, 19).replace('T', ' ')}\n${r.commitMessage}`
    if (!r.machine) return base
    const battery = r.machine.onBattery === null ? '' : r.machine.onBattery ? ' [on battery]' : ' [plugged in]'
    return `${base}\nmachine: ${r.machine.fingerprint} (${r.machine.cpu})${battery}\nload: ${r.machine.loadAvg1m}`
  })

  h.scenarios.forEach((sc, i) => {
    const canvas = document.getElementById(`benchmarks-canvas-${i}`) as HTMLCanvasElement | null
    if (!canvas) return

    // Union of measurement names across all runs, preserving first-seen order.
    const seen = new Set<string>()
    const names: string[] = []
    for (const run of runs) {
      const buckets = run.scenarios[sc.id] ?? {}
      for (const name of Object.keys(buckets)) {
        if (!seen.has(name)) { seen.add(name); names.push(name) }
      }
    }
    if (names.length === 0) return

    const datasets = names.map((name, idx) => ({
      label: name,
      data: runs.map(run => {
        const v = run.scenarios[sc.id]?.[name]
        return v ? v.median : null
      }),
      borderColor: pickColor(idx),
      backgroundColor: pickColor(idx, 0.2),
      tension: 0.1,
      spanGaps: true,
    }))

    // Pick the dominant unit for axis labelling.
    let unit: 'ms' | 'us' = 'ms'
    for (const run of runs) {
      const buckets = run.scenarios[sc.id] ?? {}
      for (const v of Object.values(buckets)) {
        if (v) { unit = v.unit; break }
      }
      if (unit !== 'ms') break
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: xLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: true, text: sc.title, font: { size: 14 }, color: textColor },
          subtitle: { display: true, text: sc.description, font: { size: 11, style: 'italic' }, padding: { bottom: 12 }, color: textColor },
          legend: { labels: { color: textColor } },
          tooltip: {
            callbacks: {
              title: (items: { dataIndex: number }[]) => items.length > 0 ? xTooltips[items[0]!.dataIndex] : '',
              label: (ctx: { parsed: { y: number | null }; dataset: { label: string } }) => {
                const v = ctx.parsed.y
                if (v === null || v === undefined) return `${ctx.dataset.label}: —`
                return `${ctx.dataset.label}: ${unit === 'us' ? `${v.toFixed(2)} μs` : `${v.toFixed(3)} ms`}`
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            title: { display: true, text: unit === 'us' ? 'μs (median)' : 'ms (median)', color: textColor },
            ticks: { color: textColor },
            grid: { color: gridColor },
          },
          x: {
            title: { display: true, text: 'commit (oldest → newest)', color: textColor },
            ticks: { color: textColor },
            grid: { color: gridColor },
          },
        },
      },
    })
    liveCharts.push(chart)
  })
}
