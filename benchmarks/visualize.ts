/**
 * Refinement-types performance — HTML visualisation generator.
 *
 * Reads `benchmarks/refinement-history.json` and writes a self-contained
 * HTML file with one Chart.js line chart per scenario. Each chart shows
 * one line per measurement, with x-axis running oldest-to-newest by run.
 *
 * Usage:
 *   npm run show:benchmarks
 *
 * Generated file (gitignored):
 *   benchmarks/visualization.html
 *
 * The HTML pulls Chart.js from a CDN, so the file works offline only
 * after the CDN script has been cached by the browser. For an air-
 * gapped workflow, embed the Chart.js bundle directly — see the
 * `CHART_JS_SRC` constant below.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const HISTORY_FILE = 'benchmarks/refinement-history.json'
const OUTPUT_FILE = 'benchmarks/visualization.html'
const CHART_JS_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js'

interface MeasurementValue {
  median: number
  min: number
  max: number
  unit: 'ms' | 'us'
}

interface RunEntry {
  timestamp: string
  commit: string
  commitMessage: string
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

if (!existsSync(HISTORY_FILE)) {
  console.error(`No history found at ${HISTORY_FILE}.`)
  console.error('Run `npm run benchmark:refinement` at least once to generate the baseline.')
  process.exit(1)
}

const history: History = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) as History

// Runs are stored newest-first; for charting we want left-to-right
// chronological so a regression appears as a rightward jump.
const runs = [...history.runs].reverse()

if (runs.length === 0) {
  console.error('History contains no runs. Run `npm run benchmark:refinement` first.')
  process.exit(1)
}

writeFileSync(OUTPUT_FILE, renderHtml(history.scenarios, runs))
console.log(`Wrote ${OUTPUT_FILE}`)

function renderHtml(scenarios: ScenarioMeta[], rs: RunEntry[]): string {
  // X-axis labels: use the short SHA. The full timestamp + commit
  // message live in the tooltip so the chart doesn't get cluttered.
  const xLabels = rs.map(r => r.commit)
  const xTooltips = rs.map(r => `${r.commit}\n${r.timestamp.slice(0, 19).replace('T', ' ')}\n${r.commitMessage}`)

  // For each scenario, build the Chart.js dataset payload. Each measurement
  // gets one dataset; values across runs come from `runs[i].scenarios[id][name]`.
  // Missing values render as null (Chart.js draws a gap).
  const charts = scenarios.map((sc) => {
    // Union of measurement names across all runs, in first-seen order.
    const seen = new Set<string>()
    const names: string[] = []
    for (const run of rs) {
      const buckets = run.scenarios[sc.id] ?? {}
      for (const name of Object.keys(buckets)) {
        if (!seen.has(name)) { seen.add(name); names.push(name) }
      }
    }
    const datasets = names.map((name, idx) => ({
      label: name,
      // null entries become Chart.js gaps — meaning "this run didn't
      // measure this row", which is the right visual signal.
      data: rs.map((run) => {
        const v = run.scenarios[sc.id]?.[name]
        return v ? v.median : null
      }),
      borderColor: pickColor(idx),
      backgroundColor: pickColor(idx, 0.2),
      tension: 0.1,
      spanGaps: true, // draw a line across `null` so a measurement renamed mid-history still tells a story
    }))

    // Pick the unit from the first non-null measurement. If a scenario
    // mixes μs and ms across measurements (it shouldn't, but defensive),
    // the y-axis label notes the dominant unit.
    const firstUnit = (() => {
      for (const run of rs) {
        const buckets = run.scenarios[sc.id] ?? {}
        for (const v of Object.values(buckets)) {
          if (v) return v.unit
        }
      }
      return 'ms'
    })()

    return { id: sc.id, title: sc.title, description: sc.description, datasets, unit: firstUnit }
  })

  const chartConfigs = charts.map((c, idx) => `
  // ${c.title}
  new Chart(document.getElementById('chart-${idx}'), {
    type: 'line',
    data: {
      labels: ${JSON.stringify(xLabels)},
      datasets: ${JSON.stringify(c.datasets)}
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: { display: true, text: ${JSON.stringify(c.title)}, font: { size: 16 } },
        subtitle: { display: true, text: ${JSON.stringify(c.description)}, font: { size: 12, style: 'italic' }, padding: { bottom: 12 } },
        tooltip: {
          callbacks: {
            title: function(items) {
              const tooltips = ${JSON.stringify(xTooltips)};
              return items.length > 0 ? tooltips[items[0].dataIndex] : '';
            },
            label: function(ctx) {
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return ctx.dataset.label + ': —';
              return ctx.dataset.label + ': ' + (${JSON.stringify(c.unit)} === 'us' ? v.toFixed(2) + ' μs' : v.toFixed(3) + ' ms');
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          title: { display: true, text: ${JSON.stringify(c.unit === 'us' ? 'μs (median)' : 'ms (median)')} }
        },
        x: {
          title: { display: true, text: 'commit (oldest → newest)' }
        }
      }
    }
  });
`).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Refinement-types performance</title>
<script src="${CHART_JS_SRC}"></script>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; max-width: 1200px; color: #222; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .chart-wrap { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
  .chart-wrap canvas { max-height: 360px; }
  .toggle-log { font-size: 12px; color: #666; margin-bottom: 4px; }
  .toggle-log input { vertical-align: middle; }
  details { background: #f5f5f5; border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 13px; }
  details summary { cursor: pointer; font-weight: 500; }
  details table { border-collapse: collapse; margin-top: 8px; }
  details td, details th { padding: 4px 8px; border: 1px solid #ddd; text-align: left; font-size: 12px; }
</style>
</head>
<body>
<h1>Refinement-types performance</h1>
<div class="meta">
  ${rs.length} run${rs.length === 1 ? '' : 's'} from
  <code>${rs[0]!.commit}</code> (${rs[0]!.timestamp.slice(0, 10)})
  to <code>${rs[rs.length - 1]!.commit}</code> (${rs[rs.length - 1]!.timestamp.slice(0, 10)}).
  Source: <code>benchmarks/refinement-history.json</code>.
</div>

<details>
<summary>Run history (${rs.length})</summary>
<table>
<tr><th>Commit</th><th>Date</th><th>Message</th></tr>
${rs.map(r => `<tr><td><code>${escapeHtml(r.commit)}</code></td><td>${escapeHtml(r.timestamp.slice(0, 19).replace('T', ' '))}</td><td>${escapeHtml(r.commitMessage)}</td></tr>`).join('\n')}
</table>
</details>

${charts.map((_, idx) => `
<div class="chart-wrap">
  <canvas id="chart-${idx}"></canvas>
</div>`).join('\n')}

<script>
${chartConfigs}
</script>
</body>
</html>
`
}

/**
 * Repeatable colour palette — same `idx` always picks the same colour
 * across charts and across runs, so a measurement keeps its visual
 * identity even if we add or remove rows around it.
 */
function pickColor(idx: number, alpha = 1): string {
  const palette = [
    [54, 162, 235], // blue
    [255, 99, 132], // red
    [75, 192, 192], // teal
    [255, 159, 64], // orange
    [153, 102, 255], // purple
    [255, 205, 86], // yellow
    [99, 200, 99], // green
    [201, 76, 76], // crimson
    [148, 84, 199], // violet
    [80, 145, 195], // steel
  ]
  const [r, g, b] = palette[idx % palette.length]!
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
