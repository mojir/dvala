import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = 'dvala.json'

interface BuildConfig {
  /** Expand statically-defined macros at build time. Default: true */
  expandMacros: boolean
  /** Remove unused let bindings. Default: true */
  treeShake: boolean
  /** Include source maps in the bundle. Default: true */
  sourceMap: boolean
}

export type CoverageReporter = 'lcov' | 'html'

export interface CoverageConfig {
  /**
   * Which file-based reporters to emit. Default: ["lcov"].
   * "lcov" writes coverage/lcov.info; "html" writes an HTML report.
   * A text summary is always printed to stdout regardless of this setting.
   */
  reporter: CoverageReporter[]
  /** Directory for coverage output, relative to project root. Default: "coverage" */
  reportsDirectory: string
  /**
   * Glob patterns for source files to include in coverage, relative to project root.
   * Default: ["**\/*.dvala"]
   */
  include: string[]
  /**
   * Glob patterns to exclude from coverage, relative to project root.
   * Default: ["**\/*.test.dvala"]
   */
  exclude: string[]
  /**
   * When true, report all files matching include/exclude even if never imported
   * during tests — those files appear with 0% coverage. Default: false.
   */
  all: boolean
}

interface DvalaConfig {
  /** Project name */
  name: string
  /** Glob pattern for test file discovery, relative to project root. Default: "**\/*.test.dvala" */
  tests: string
  /** Entry file for bundling. Default: "main.dvala" */
  entry: string
  /** File to pre-load in the REPL. Omit for a clean REPL. */
  repl: string
  /** Build pipeline options */
  build: BuildConfig
  /** Coverage reporting options */
  coverage: CoverageConfig
}

export interface ResolvedConfig {
  /** The parsed and defaulted configuration */
  config: DvalaConfig
  /** Absolute path to the dvala.json file */
  configPath: string
  /** Absolute path to the project root (directory containing dvala.json) */
  rootDir: string
}

const buildDefaults: BuildConfig = {
  expandMacros: true,
  treeShake: true,
  sourceMap: true,
}

const coverageDefaults: CoverageConfig = {
  reporter: ['lcov'],
  reportsDirectory: 'coverage',
  include: ['**/*.dvala'],
  exclude: ['**/*.test.dvala'],
  all: true,
}

const defaults: DvalaConfig = {
  name: '',
  tests: '**/*.test.dvala',
  entry: 'main.dvala',
  repl: '',
  build: buildDefaults,
  coverage: coverageDefaults,
}

/**
 * Load dvala.json from the given directory (or cwd).
 * Does NOT walk up the folder tree — the config must be in the specified directory.
 * Returns null if no dvala.json is found.
 */
export function findConfig(dir?: string): ResolvedConfig | null {
  const rootDir = path.resolve(dir ?? process.cwd())
  const configPath = path.join(rootDir, CONFIG_FILENAME)

  if (!fs.existsSync(configPath)) {
    return null
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const config: DvalaConfig = {
    ...defaults,
    ...raw,
    build: { ...buildDefaults, ...raw.build },
    coverage: { ...coverageDefaults, ...raw.coverage },
  }
  return { config, configPath, rootDir }
}
