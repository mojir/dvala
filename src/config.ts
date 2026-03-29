import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = 'dvala.json'

export interface DvalaConfig {
  /** Glob pattern for test file discovery, relative to project root. Default: "**\/*.test.dvala" */
  tests: string
  /** Entry file for bundling. Default: "main.dvala" */
  entry: string
}

export interface ResolvedConfig {
  /** The parsed and defaulted configuration */
  config: DvalaConfig
  /** Absolute path to the dvala.json file */
  configPath: string
  /** Absolute path to the project root (directory containing dvala.json) */
  rootDir: string
}

const defaults: DvalaConfig = {
  tests: '**/*.test.dvala',
  entry: 'main.dvala',
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
      const config: DvalaConfig = { ...defaults, ...raw }
      return { config, configPath, rootDir: dir }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      // Reached filesystem root
      return null
    }
    dir = parent
  }
}
