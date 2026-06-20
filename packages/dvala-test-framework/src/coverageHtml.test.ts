import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileCoverageSummary } from './coverage'
import { generateCoverageHtmlFiles } from './coverageHtml'

function summary(filePath: string): FileCoverageSummary {
  return {
    path: filePath,
    linesHit: 1,
    linesFound: 1,
    exprsHit: 1,
    exprsFound: 1,
    uncoveredLines: [],
    uncoveredExprs: [],
    lineHits: new Map([[0, 1]]),
    source: 'x',
  }
}

describe('generateCoverageHtmlFiles', () => {
  it('never emits output paths that escape the report directory', () => {
    // A project whose covered files reach into a sibling directory above the
    // passed rootDir — the report must stay self-contained (no `../` paths that
    // would write outside the caller's output directory).
    const files = generateCoverageHtmlFiles(
      [summary('/repo/examples/project/lib/a.dvala'), summary('/repo/examples/packages/pkg/b.dvala')],
      '/repo/examples/project',
    )
    expect(files.size).toBeGreaterThan(0)
    for (const key of files.keys()) {
      expect(key.split('/')).not.toContain('..')
    }
    // Rooted at the common ancestor (examples/), both subtrees are present.
    expect([...files.keys()]).toEqual(expect.arrayContaining(['project/lib/a.dvala.html', 'packages/pkg/b.dvala.html']))
  })

  it('roots at rootDir when every file is inside it (no behavior change)', () => {
    const files = generateCoverageHtmlFiles([summary('/repo/packages/x.dvala')], '/repo')
    expect([...files.keys()]).toEqual(expect.arrayContaining(['index.html', 'packages/x.dvala.html']))
    for (const key of files.keys()) {
      expect(key.startsWith(`..${path.sep}`) || key.startsWith('../')).toBe(false)
    }
  })
})
