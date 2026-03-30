/**
 * E2E tests for all CLI commands.
 * Runs the built CLI binary via execSync.
 */
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

describe('CLI commands', () => {
  const dvalaCliPath = path.join(__dirname, '../../dist/cli/cli.js')
  const exampleProjectDir = path.join(__dirname, '../../examples/project')
  const tmpDir = path.join(__dirname, '../../.tmp-cli-test')

  beforeAll(() => {
    if (!fs.existsSync(dvalaCliPath)) {
      execSync('npm run build-cli', {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      })
    }
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  function exec(args: string, cwd?: string): string {
    return execSync(`node '${dvalaCliPath}' ${args}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: cwd ?? path.join(__dirname, '../..'),
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    }).trim()
  }

  function execFails(args: string, cwd?: string): string {
    try {
      exec(args, cwd)
      return ''
    }
    catch (error: any) {
      return error.stderr?.toString() || error.stdout?.toString() || error.message
    }
  }

  // --- eval ---
  describe('eval', () => {
    it('evaluates a simple expression', () => {
      expect(exec('eval "1 + 2"')).toBe('3')
    })

    it('evaluates with context', () => {
      expect(exec('eval "x + 1" -c \'{"x": 10}\'')).toBe('11')
    })

    it('evaluates with --pure', () => {
      expect(exec('eval --pure "abs(-5)"')).toBe('5')
    })

    it('suppresses output with --silent', () => {
      expect(exec('eval -s "42"')).toBe('')
    })
  })

  // --- run ---
  describe('run', () => {
    it('runs a .dvala file', () => {
      // Use a simple file without file imports (run doesn't resolve imports)
      const result = exec(`run ${exampleProjectDir}/lib/constants.dvala`)
      expect(result).toContain('pi')
    })

    it('runs a .json bundle', () => {
      const bundlePath = path.join(tmpDir, 'test-bundle.json')
      exec(`build ${exampleProjectDir} -o ${bundlePath}`)
      const result = exec(`run ${bundlePath}`)
      expect(result).toContain('avg')
    })
  })

  // --- build ---
  describe('build', () => {
    it('builds from a project directory', () => {
      const outputPath = path.join(tmpDir, 'build-output.json')
      exec(`build ${exampleProjectDir} -o ${outputPath}`)
      expect(fs.existsSync(outputPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
      expect(content.version).toBe(1)
      expect(content.ast).toBeDefined()
    })

    it('builds from cwd with dvala.json', () => {
      const outputPath = path.join(tmpDir, 'cwd-build.json')
      exec(`build -o ${outputPath}`, exampleProjectDir)
      expect(fs.existsSync(outputPath)).toBe(true)
    })

    it('builds with --no-sourcemap', () => {
      const outputPath = path.join(tmpDir, 'no-sm.json')
      exec(`build ${exampleProjectDir} --no-sourcemap -o ${outputPath}`)
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
      expect(content.ast.sourceMap).toBeUndefined()
    })

    it('fails without dvala.json', () => {
      const result = execFails('build /tmp')
      expect(result).toContain('dvala.json')
    })
  })

  // --- test ---
  describe('test', () => {
    it('runs tests from a project directory', () => {
      const result = exec(`test ${exampleProjectDir}`)
      expect(result).toContain('passed')
      expect(result).toContain('3 test files')
    })

    it('runs a single test file', () => {
      const result = exec(`test ${exampleProjectDir}/tests/math.test.dvala`)
      expect(result).toContain('passed')
    })

    it('runs with --reporter verbose', () => {
      const result = exec(`test ${exampleProjectDir} --reporter verbose`)
      expect(result).toContain('clamp')
      expect(result).toContain('lerp')
    })

    it('runs with --reporter tap', () => {
      const result = exec(`test ${exampleProjectDir}/tests/constants.test.dvala --reporter tap`)
      expect(result).toContain('TAP version 13')
      expect(result).toContain('ok')
    })

    it('runs with --pattern filter', () => {
      const result = exec(`test ${exampleProjectDir}/tests/math.test.dvala --pattern "clamp" --reporter verbose`)
      expect(result).toContain('clamp')
      expect(result).toContain('skip')
    })
  })

  // --- doc ---
  describe('doc', () => {
    it('shows documentation for a function', () => {
      const result = exec('doc abs')
      expect(result).toContain('abs')
    })

    it('shows documentation for a module function', () => {
      const result = exec('doc assertEqual')
      expect(result).toContain('assertEqual')
    })

    it('fails for unknown name', () => {
      const result = execFails('doc nonexistent_function_xyz')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // --- list ---
  describe('list', () => {
    it('lists core expressions', () => {
      const result = exec('list')
      expect(result).toContain('abs')
      expect(result).toContain('map')
    })

    it('lists module functions', () => {
      const result = exec('list math')
      expect(result).toContain('sin')
      expect(result).toContain('cos')
    })

    it('lists all modules', () => {
      const result = exec('list --modules')
      expect(result).toContain('math')
      expect(result).toContain('vector')
      expect(result).toContain('assertion')
    })

    it('lists datatypes', () => {
      const result = exec('list --datatypes')
      expect(result).toContain('number')
      expect(result).toContain('string')
    })
  })

  // --- tokenize ---
  describe('tokenize', () => {
    it('tokenizes source code', () => {
      const result = exec('tokenize "1 + 2"')
      const parsed = JSON.parse(result)
      expect(parsed.tokens).toBeDefined()
      expect(Array.isArray(parsed.tokens)).toBe(true)
    })
  })

  // --- parse ---
  describe('parse', () => {
    it('parses source code to AST', () => {
      const result = exec('parse "1 + 2"')
      const parsed = JSON.parse(result)
      expect(parsed.body).toBeDefined()
    })
  })

  // --- examples ---
  describe('examples', () => {
    it('shows example programs', () => {
      const result = exec('examples')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // --- help ---
  describe('help', () => {
    it('shows help text', () => {
      const result = exec('help')
      expect(result).toContain('Usage')
      expect(result).toContain('eval')
      expect(result).toContain('build')
      expect(result).toContain('test')
    })
  })

  // --- version ---
  describe('version', () => {
    it('shows version', () => {
      const result = exec('--version')
      expect(result).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })
})
