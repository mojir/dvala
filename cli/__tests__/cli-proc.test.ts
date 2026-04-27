import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'

describe('proc Integration Tests', () => {
  const dvalaCliPath = path.join(__dirname, '../../dist/cli/cli.js') // Adjust path as needed

  beforeAll(() => {
    if (!fs.existsSync(dvalaCliPath)) {
      try {
        execSync('npm run build-cli', {
          cwd: path.join(__dirname, '../..'),
          stdio: 'pipe',
        })
      } catch (error: any) {
        throw new Error(`Failed to build CLI: ${error.message}`, { cause: error })
      }
    }
  })

  function runDvala(expression: string): string {
    try {
      const result = execSync(`node '${dvalaCliPath}' run '${expression}'`, {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: __dirname, // Ensure we run in the correct directory
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      })
      return result.trim()
    } catch (error: any) {
      throw new Error(`Dvala Proc failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`, {
        cause: error,
      })
    }
  }

  describe('process operations', () => {
    test('shuld return current working directory', () => {
      const result = runDvala('let p = import("cliProc"); p.getCwd()')
      expect(result).toBe(__dirname)
    })
  })
})
