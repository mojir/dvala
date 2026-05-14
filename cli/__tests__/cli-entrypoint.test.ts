import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CLI entrypoint', () => {
  it('delegates to the workspace package entrypoint', () => {
    const cliEntrypointPath = path.join(__dirname, '../src/cli.ts')
    const code = fs.readFileSync(cliEntrypointPath, 'utf8')

    expect(code).toContain('#!/usr/bin/env node')
    expect(code).toContain("import '../../packages/dvala-cli/src/index'")
  })
})
