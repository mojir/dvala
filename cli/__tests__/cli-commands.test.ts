/**
 * E2E tests for all CLI commands.
 * Runs the built CLI binary via execSync.
 */
import { execSync, spawn } from 'node:child_process'
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
    } catch (error: any) {
      return error.stderr?.toString() || error.stdout?.toString() || error.message
    }
  }

  // --- run ---
  describe('run', () => {
    it('runs inline code', () => {
      expect(exec('run "1 + 2"')).toBe('3')
    })

    it('runs inline code with context', () => {
      expect(exec('run "x + 1" -c \'{"x": 10}\'')).toBe('11')
    })

    it('runs inline code with --pure', () => {
      expect(exec('run --pure "abs(-5)"')).toBe('5')
    })

    it('suppresses output with --silent', () => {
      expect(exec('run -s "42"')).toBe('')
    })

    it('runs a .dvala file with -f', () => {
      // Use a simple file without file imports (run doesn't bundle imports)
      const result = exec(`run -f ${exampleProjectDir}/lib/math.dvala`)
      expect(result).toContain('clamp')
    })

    it('runs a .json bundle with -f', () => {
      const bundlePath = path.join(tmpDir, 'test-bundle.json')
      exec(`build ${exampleProjectDir} -o ${bundlePath}`)
      const result = exec(`run -f ${bundlePath}`)
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

    it('builds with --no-expand-macros keeps Macro nodes', () => {
      const withPath = path.join(tmpDir, 'with-macros.json')
      const withoutPath = path.join(tmpDir, 'without-macros.json')
      exec(`build ${exampleProjectDir} -o ${withPath}`)
      exec(`build ${exampleProjectDir} --no-expand-macros -o ${withoutPath}`)
      const withoutContent = fs.readFileSync(withoutPath, 'utf-8')
      // With expansion (default): no Macro nodes in calls
      // Without expansion: Macro nodes present
      expect(withoutContent).toContain('"Macro"')
      // Both should produce runnable bundles
      const withResult = exec(`run -f ${withPath}`)
      const withoutResult = exec(`run -f ${withoutPath}`)
      expect(withResult).toContain('doubled')
      expect(withoutResult).toContain('doubled')
    })

    it('builds with --no-tree-shake produces larger bundle', () => {
      // Use a dedicated fixture with a known unused binding so the test is
      // independent of changes to the example project files.
      const fixtureDir = path.join(__dirname, 'fixtures/treeshake-project')
      const shakenPath = path.join(tmpDir, 'shaken.json')
      const unshakenPath = path.join(tmpDir, 'unshaken.json')
      exec(`build ${fixtureDir} -o ${shakenPath}`)
      exec(`build ${fixtureDir} --no-tree-shake -o ${unshakenPath}`)
      const shakenSize = fs.statSync(shakenPath).size
      const unshakenSize = fs.statSync(unshakenPath).size
      expect(unshakenSize).toBeGreaterThan(shakenSize)
      // Both produce correct output
      expect(exec(`run -f ${shakenPath}`)).toContain('result')
      expect(exec(`run -f ${unshakenPath}`)).toContain('result')
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
      expect(result).toContain('5 test files')
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

    it('generates lcov coverage report with --coverage', () => {
      // Coverage is written to reportsDirectory relative to the project root (exampleProjectDir).
      const coverageDir = path.join(exampleProjectDir, 'coverage')
      if (fs.existsSync(coverageDir))
        fs.rmSync(coverageDir, { recursive: true })

      try {
        const result = exec(`test ${exampleProjectDir} --coverage`)
        expect(result).toContain('passed')
        expect(result).toContain('% Lines')

        const lcovPath = path.join(coverageDir, 'lcov.info')
        expect(fs.existsSync(lcovPath)).toBe(true)

        const lcov = fs.readFileSync(lcovPath, 'utf-8')
        expect(lcov).toContain('SF:')
        expect(lcov).toContain('DA:')
        expect(lcov).toContain('end_of_record')
      } finally {
        // Clean up — avoid leaving generated files in the examples directory
        if (fs.existsSync(coverageDir))
          fs.rmSync(coverageDir, { recursive: true })
      }
    })
  })

  // --- init ---
  describe('init', () => {
    /**
     * Spawn `dvala init` and feed answers line-by-line as prompts appear.
     * Returns stdout once the process exits.
     */
    function runInit(answers: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
      return new Promise(resolve => {
        const child = spawn('node', [dvalaCliPath, 'init'], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        })

        let stdout = ''
        let stderr = ''
        let answerIdx = 0

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
          // Feed next answer when a prompt appears
          if (answerIdx < answers.length) {
            child.stdin.write(`${answers[answerIdx]}\n`)
            answerIdx++
          }
        })
        child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
        child.on('close', (code: number) => resolve({ code, stdout, stderr }))
      })
    }

    it('creates dvala.json with entry file, no tests, no repl', async () => {
      const dir = path.join(tmpDir, 'init-defaults')
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })

      // Name (default), create entry file (yes), configure tests (no), configure repl (no), configure vscode (no)
      const { code, stdout } = await runInit(['', 'y', 'n', 'n', 'n'], dir)

      expect(code).toBe(0)
      expect(stdout).toContain('Created dvala.json')
      expect(stdout).toContain('Created main.dvala')

      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.name).toBe('init-defaults')
      expect(config.entry).toBe('main.dvala')
      expect(config.tests).toBeUndefined()
      expect(config.repl).toBeUndefined()

      expect(fs.existsSync(path.join(dir, 'main.dvala'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'tests', 'main.test.dvala'))).toBe(false)

      // Entry file should contain the template content
      const mainContent = fs.readFileSync(path.join(dir, 'main.dvala'), 'utf-8')
      expect(mainContent).toContain('greet')
      expect(mainContent).toContain('add')
    })

    it('uses custom project name when provided', async () => {
      const dir = path.join(tmpDir, 'init-custom-name')
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })

      const { code } = await runInit(['my-project', 'y', 'n', 'n', 'n'], dir)

      expect(code).toBe(0)
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.name).toBe('my-project')
    })

    it('creates dvala.json with no entry file', async () => {
      const dir = path.join(tmpDir, 'init-no-entry')
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })

      // Name (default), create entry file (no) — tests and repl questions are skipped
      const { code, stdout } = await runInit(['', 'n'], dir)

      expect(code).toBe(0)
      expect(stdout).toContain('Created dvala.json')

      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.name).toBe('init-no-entry')
      expect(config.entry).toBeUndefined()
      expect(config.tests).toBeUndefined()
      expect(config.repl).toBeUndefined()

      expect(fs.existsSync(path.join(dir, 'main.dvala'))).toBe(false)
    })

    it('creates entry file, tests, and repl when all confirmed', async () => {
      const dir = path.join(tmpDir, 'init-full')
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })

      // Name (default), create entry file (yes), configure tests (yes), configure repl (yes), configure vscode (yes)
      const { code, stdout } = await runInit(['', 'y', 'y', 'y', 'y'], dir)

      expect(code).toBe(0)
      expect(stdout).toContain('Created main.dvala')
      expect(stdout).toContain('Created tests/main.test.dvala')

      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.name).toBe('init-full')
      expect(config.entry).toBe('main.dvala')
      expect(config.tests).toBe('**/*.test.dvala')
      expect(config.repl).toBe('main.dvala')

      expect(fs.existsSync(path.join(dir, 'main.dvala'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'tests', 'main.test.dvala'))).toBe(true)
      expect(fs.existsSync(path.join(dir, '.vscode', 'launch.json'))).toBe(true)

      // launch.json should contain the dvala debug configuration
      const launchConfig = JSON.parse(fs.readFileSync(path.join(dir, '.vscode', 'launch.json'), 'utf-8'))
      expect(launchConfig.configurations[0].type).toBe('dvala')
      expect(launchConfig.configurations[0].request).toBe('launch')

      // Test file should import from main and test its functions
      const testContent = fs.readFileSync(path.join(dir, 'tests', 'main.test.dvala'), 'utf-8')
      expect(testContent).toContain('import("../main")')
      expect(testContent).toContain('greet')
      expect(testContent).toContain('add')
    })

    it('asks to overwrite when dvala.json exists and aborts on decline', async () => {
      const dir = path.join(tmpDir, 'init-exists-decline')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'dvala.json'), '{"entry":"old.dvala"}')

      const { code, stdout } = await runInit(['n'], dir)

      expect(code).toBe(0)
      expect(stdout).toContain('already exists')
      expect(stdout).toContain('Aborted')
      // Original file untouched
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.entry).toBe('old.dvala')
    })

    it('overwrites dvala.json when confirmed', async () => {
      const dir = path.join(tmpDir, 'init-exists-accept')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'dvala.json'), '{"entry":"old.dvala","tests":"old/**/*.test.dvala"}')

      // Accept overwrite, name (default), create entry file (yes), tests (yes), repl (yes), vscode (yes)
      const { code, stdout } = await runInit(['y', '', 'y', 'y', 'y', 'y'], dir)

      expect(code).toBe(0)
      expect(stdout).toContain('Created dvala.json')
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'dvala.json'), 'utf-8'))
      expect(config.name).toBe('init-exists-accept')
      expect(config.entry).toBe('main.dvala')
      expect(config.tests).toBe('**/*.test.dvala')
      expect(config.repl).toBe('main.dvala')
    })

    it('does not overwrite existing .vscode/launch.json', async () => {
      const dir = path.join(tmpDir, 'init-vscode-exists')
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.vscode', 'launch.json'), '{"custom":true}')

      // Name (default), create entry file (yes), tests (no), repl (no), vscode (yes)
      const { code } = await runInit(['', 'y', 'n', 'n', 'y'], dir)

      expect(code).toBe(0)
      // Existing launch.json should not be overwritten
      const launchContent = fs.readFileSync(path.join(dir, '.vscode', 'launch.json'), 'utf-8')
      expect(JSON.parse(launchContent)).toEqual({ custom: true })
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
      expect(result).toContain('run')
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
