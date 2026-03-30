import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = 'dvala.json'

export interface BuildConfig {
  /** Expand statically-defined macros at build time. Default: true */
  expandMacros: boolean
  /** Include source maps in the bundle. Default: true */
  sourceMap: boolean
}

export interface DvalaConfig {
  /** Glob pattern for test file discovery, relative to project root. Default: "**\/*.test.dvala" */
  tests: string
  /** Entry file for bundling. Default: "main.dvala" */
  entry: string
  /** Build pipeline options */
  build: BuildConfig
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
  sourceMap: true,
}

const defaults: DvalaConfig = {
  tests: '**/*.test.dvala',
  entry: 'main.dvala',
  build: buildDefaults,
}

/**
 * Find and load dvala.json by walking up from the given directory.
 * Returns null if no dvala.json is found.
 */
export function findConfig(startDir?: string): ResolvedConfig | null {
  const start = path.resolve(startDir ?? process.cwd())
  let dir = start

  while (true) {
    const configPath = path.join(dir, CONFIG_FILENAME)
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const config: DvalaConfig = {
        ...defaults,
        ...raw,
        build: { ...buildDefaults, ...raw.build },
      }
      return { config, configPath, rootDir: dir }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}
