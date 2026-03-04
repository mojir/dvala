/* eslint-disable ts/no-unsafe-member-access */
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'

describe('cLI argument parsing', () => {
  const dvalaCliPath = path.join(__dirname, '../../dist/cli/cli.js')
  const fixturesDir = path.join(__dirname, 'arg-test-fixtures')

  beforeAll(() => {
    if (!fs.existsSync(dvalaCliPath)) {
      try {
        execSync('npm run build', {
          cwd: path.join(__dirname, '../..'),
          stdio: 'pipe',
        })
      }
      catch (error: any) {
        throw new Error(`Failed to build CLI: ${error.message}`)
      }
    }

    // Create fixtures dir and a simple .dvala file for run tests
    fs.mkdirSync(fixturesDir, { recursive: true })
    fs.writeFileSync(path.join(fixturesDir, 'simple.dvala'), '1 + 2 + 3')
  })

  function exec(args: string): string {
    const result = execSync(`node '${dvalaCliPath}' ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: fixturesDir,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    })
    return result.trim()
  }

  // =============================================================
  // eval: options AFTER positional (existing behavior, should pass)
  // =============================================================
  describe('eval - options after positional (existing)', () => {
    test('should evaluate a simple expression', () => {
      expect(exec('eval \'1 + 2\'')).toBe('3')
    })

    test('should accept --pure after expression', () => {
      expect(exec('eval \'1 + 2\' --pure')).toBe('3')
    })

    test('--pure accepts all core builtins (none are impure)', () => {
      expect(exec('eval \'map([1, 2], inc)\' --pure')).toBe('[ 2, 3 ]')
    })

    test('should accept --silent after expression', () => {
      expect(exec('eval \'1 + 2\' --silent')).toBe('')
    })

    test('should accept -s after expression', () => {
      expect(exec('eval \'1 + 2\' -s')).toBe('')
    })

    test('should accept -c after expression', () => {
      expect(exec('eval \'x + 1\' -c \'{"x": 10}\'')).toBe('11')
    })

    test('should accept --context=JSON after expression', () => {
      expect(exec('eval \'x + 1\' --context=\'{"x": 10}\'')).toBe('11')
    })
  })

  // =============================================================
  // eval: options BEFORE positional (new behavior, expected to fail)
  // =============================================================
  describe('eval - options before positional (new)', () => {
    test('should accept --pure before expression', () => {
      expect(exec('eval --pure \'1 + 2\'')).toBe('3')
    })

    test('--pure before expression accepts all core builtins', () => {
      expect(exec('eval --pure \'map([1, 2], inc)\'')).toBe('[ 2, 3 ]')
    })

    test('should accept --silent before expression', () => {
      expect(exec('eval --silent \'1 + 2\'')).toBe('')
    })

    test('should accept -s before expression', () => {
      expect(exec('eval -s \'1 + 2\'')).toBe('')
    })

    test('should accept -c before expression', () => {
      expect(exec('eval -c \'{"x": 10}\' \'x + 1\'')).toBe('11')
    })

    test('should accept --context=JSON before expression', () => {
      expect(exec('eval --context=\'{"x": 10}\' \'x + 1\'')).toBe('11')
    })

    test('should accept mixed options before and after expression', () => {
      expect(exec('eval --pure \'1 + 2\' --silent')).toBe('')
    })
  })

  // =============================================================
  // --context with space-separated value (bug fix, expected to fail)
  // =============================================================
  describe('--context with space-separated value', () => {
    test('should accept --context JSON (space-separated) with eval', () => {
      expect(exec('eval \'x + 1\' --context \'{"x": 10}\'')).toBe('11')
    })

    test('should accept --context-file FILE (space-separated) with eval', () => {
      const ctxFile = path.join(fixturesDir, 'ctx.json')
      fs.writeFileSync(ctxFile, '{"x": 10}')
      expect(exec(`eval 'x + 1' --context-file '${ctxFile}'`)).toBe('11')
    })
  })

  // =============================================================
  // run: options before and after positional
  // =============================================================
  describe('run - option ordering', () => {
    test('should accept options after filename (existing)', () => {
      expect(exec('run simple.dvala --pure')).toBe('6')
    })

    test('should accept options before filename (new)', () => {
      expect(exec('run --pure simple.dvala')).toBe('6')
    })

    test('should accept --pure before filename', () => {
      expect(exec('run --pure simple.dvala')).toBe('6')
    })

    test('should accept --silent before and --pure after expression', () => {
      expect(exec('eval --silent \'1 + 2\' --pure')).toBe('')
    })
  })
})
