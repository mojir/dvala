
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
        execSync('npm run build-cli', {
          cwd: path.join(__dirname, '../..'),
          stdio: 'pipe',
        })
      } catch (error: any) {
        throw new Error(`Failed to build CLI: ${error.message}`, { cause: error })
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
  // run: options AFTER positional (existing behavior)
  // =============================================================
  describe('run - options after positional', () => {
    test('should run a simple expression', () => {
      expect(exec('run \'1 + 2\'')).toBe('3')
    })

    test('should accept --pure after expression', () => {
      expect(exec('run \'1 + 2\' --pure')).toBe('3')
    })

    test('--pure accepts all core builtins (none are impure)', () => {
      expect(exec('run \'map([1, 2], inc)\' --pure')).toBe('[ 2, 3 ]')
    })

    test('should accept --silent after expression', () => {
      expect(exec('run \'1 + 2\' --silent')).toBe('')
    })

    test('should accept -s after expression', () => {
      expect(exec('run \'1 + 2\' -s')).toBe('')
    })

    test('should accept -c after expression', () => {
      expect(exec('run \'x + 1\' -c \'{"x": 10}\'')).toBe('11')
    })

    test('should accept --context=JSON after expression', () => {
      expect(exec('run \'x + 1\' --context=\'{"x": 10}\'')).toBe('11')
    })
  })

  // =============================================================
  // run: options BEFORE positional
  // =============================================================
  describe('run - options before positional', () => {
    test('should accept --pure before expression', () => {
      expect(exec('run --pure \'1 + 2\'')).toBe('3')
    })

    test('--pure before expression accepts all core builtins', () => {
      expect(exec('run --pure \'map([1, 2], inc)\'')).toBe('[ 2, 3 ]')
    })

    test('should accept --silent before expression', () => {
      expect(exec('run --silent \'1 + 2\'')).toBe('')
    })

    test('should accept -s before expression', () => {
      expect(exec('run -s \'1 + 2\'')).toBe('')
    })

    test('should accept -c before expression', () => {
      expect(exec('run -c \'{"x": 10}\' \'x + 1\'')).toBe('11')
    })

    test('should accept --context=JSON before expression', () => {
      expect(exec('run --context=\'{"x": 10}\' \'x + 1\'')).toBe('11')
    })

    test('should accept mixed options before and after expression', () => {
      expect(exec('run --pure \'1 + 2\' --silent')).toBe('')
    })
  })

  // =============================================================
  // --context with space-separated value
  // =============================================================
  describe('--context with space-separated value', () => {
    test('should accept --context JSON (space-separated)', () => {
      expect(exec('run \'x + 1\' --context \'{"x": 10}\'')).toBe('11')
    })

    test('should accept --context-file FILE (space-separated)', () => {
      const ctxFile = path.join(fixturesDir, 'ctx.json')
      fs.writeFileSync(ctxFile, '{"x": 10}')
      expect(exec(`run 'x + 1' --context-file '${ctxFile}'`)).toBe('11')
    })
  })

  // =============================================================
  // run with -f flag for files
  // =============================================================
  describe('run - file with -f flag', () => {
    test('should accept -f with options after', () => {
      expect(exec('run -f simple.dvala --pure')).toBe('6')
    })

    test('should accept options before -f', () => {
      expect(exec('run --pure -f simple.dvala')).toBe('6')
    })

    test('should accept --silent before and --pure after -f', () => {
      expect(exec('run --silent -f simple.dvala --pure')).toBe('')
    })
  })
})
