import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The dev server's port appears in several places (docs, IDE configs, demo
// link generator) where templating isn't practical. Source of truth: the
// `port: <number>` setting in `playground-www/vite.config.mjs`. This test
// asserts every other reference matches — change the port once, the test
// fails until every dependant reference is updated.
describe('playground dev port consistency', () => {
  const viteConfig = readFileSync('playground-www/vite.config.mjs', 'utf-8')
  const match = /\bport:\s*(\d+)/.exec(viteConfig)
  if (match === null) throw new Error('playground-www/vite.config.mjs must specify a numeric `port:` setting')
  const expected = `localhost:${match[1]}`

  const dependants = ['scripts/demo-link.mjs', 'CLAUDE.md', '.vscode/launch.json', '.claude/skills/demo/SKILL.md']

  for (const file of dependants) {
    it(`${file} references the canonical dev port`, () => {
      const content = readFileSync(file, 'utf-8')
      const refs = content.match(/localhost:\d+/g) ?? []
      expect(refs.length, `${file} should reference localhost:<port>`).toBeGreaterThan(0)
      for (const ref of refs) expect(ref).toBe(expected)
    })
  }
})
