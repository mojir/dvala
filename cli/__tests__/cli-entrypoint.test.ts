import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CLI entrypoint', () => {
  it('delegates to the workspace package entrypoint', () => {
    const cliEntrypointPath = path.join(__dirname, '../src/cli.ts')
    const code = fs.readFileSync(cliEntrypointPath, 'utf8').trim()

    expect(code).toBe("#!/usr/bin/env node\nimport '../../packages/dvala-cli/src/index'")
  })
})
