#!/usr/bin/env node
/* eslint-disable no-console */

import type { Reference } from '../../reference'
import type { DvalaBundle } from '../../src/bundler/interface'
import { deserializeBundle, serializeBundle } from '../../src/bundler/serialize'
import type { UnknownRecord } from '../../src/interface'
import fs from 'node:fs'
import path from 'node:path'
import { stringifyValue } from '../../common/utils'
import { version } from '../../package.json'
import { apiReference, isFunctionReference } from '../../reference'
import { formatDoc, formatExamples, getModuleNames, listCoreExpressions, listDatatypes, listModuleExpressions, listModules, lookupDoc } from '../../reference/format'
import { allBuiltinModules } from '../../src/allModules'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { expandMacros } from '../../src/ast/expandMacros'
import { treeShake } from '../../src/ast/treeShake'
import { bundle } from '../../src/bundler'
import { createDvala } from '../../src/createDvala'
import { hostHandler } from '../../src/evaluator/effectTypes'
import { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from '../../src/symbolPatterns'
import type { CoverageConfig, CoverageReporter, ResolvedConfig } from '../../src/config'
import { findConfig } from '../../src/config'
import { runTestFile, runTestSuite } from '../../src/testFramework'
import { globSync } from 'glob'
import type { CoverageFilter } from '../../src/testFramework/coverage'
import { computeCoverageSummary, generateSuiteLcov } from '../../src/testFramework/coverage'
import { generateCoverageHtmlFiles } from '../../src/testFramework/coverageHtml'
import type { TestRunResult } from '../../src/testFramework/result'
import { formatTap } from '../../src/testFramework/formatTap'
import { formatConsole } from '../../src/testFramework/formatConsole'
import { formatHtml } from '../../src/testFramework/formatHtml'
import { formatJunit } from '../../src/testFramework/formatJunit'
import { parseTokenStream, tokenizeSource } from '../../src/tooling'
import { getCliDocumentation } from './cliDocumentation/getCliDocumentation'
import { getCliFunctionSignature } from './cliDocumentation/getCliFunctionSignature'
import { getInlineCodeFormatter } from './cliFormatterRules'
import { Colors, createColorizer } from './colorizer'
import { createReadlineInterface } from './createReadlineInterface'
import initScript from './init.dvala'
import mainTemplate from './templates/main.dvala'
import mainTestTemplate from './templates/main.test.dvala'
import { getCliModules } from './js-interop/Cli'
import '../../src/initReferenceData'

const useColor = !process.env.NO_COLOR
const fmt = createColorizer(useColor)

const HIST_SIZE = 1000
const PROMPT = fmt.bright.gray('> ')

type Maybe<T> = T | null

// --- Option types shared across subcommands ---

interface ContextOptions {
  context: Record<string, unknown>
}

interface PrintOptions {
  printResult: boolean
}

// --- Subcommand configs ---

interface ReplConfig {
  subcommand: 'repl'
  loadFilename: Maybe<string>
  projectName: Maybe<string>
  context: Record<string, unknown>
}

interface RunConfig {
  subcommand: 'run'
  program: string | DvalaBundle
  context: Record<string, unknown>
  printResult: boolean
  pure: boolean
}

type TestReporter = 'default' | 'verbose' | 'tap' | 'junit' | 'html'

interface TestConfig {
  subcommand: 'test'
  filename: Maybe<string>
  testPattern: Maybe<string>
  reporter: TestReporter
  outputFile: Maybe<string>
  coverage: boolean
  /** CLI overrides — null means "use dvala.json value" */
  coverageReporter: Maybe<CoverageReporter[]>
  coverageDir: Maybe<string>
}

interface BuildConfig {
  subcommand: 'build'
  directory: Maybe<string>
  output: Maybe<string>
  /** CLI overrides — null means "use dvala.json value" */
  noSourceMap: boolean
  noExpandMacros: boolean
  noTreeShake: boolean
}

interface DocConfig {
  subcommand: 'doc'
  name: string
}

interface ListConfig {
  subcommand: 'list'
  moduleName: Maybe<string>
  showModules: boolean
  showDatatypes: boolean
}

interface TokenizeConfig {
  subcommand: 'tokenize'
  code: string
  debug: boolean
}

interface ParseConfig {
  subcommand: 'parse'
  code: string
  debug: boolean
}

interface InitConfig {
  subcommand: 'init'
}

interface ExamplesConfig {
  subcommand: 'examples'
}

interface HelpConfig {
  subcommand: 'help'
}

interface VersionConfig {
  subcommand: 'version'
}

type Config = ReplConfig | RunConfig | TestConfig | BuildConfig | DocConfig | ListConfig | TokenizeConfig | ParseConfig | InitConfig | ExamplesConfig | HelpConfig | VersionConfig

const historyResults: unknown[] = []
const formatValue = getInlineCodeFormatter(fmt)
const booleanFlags = new Set(['-s', '--silent', '--pure', '--debug', '--modules', '--datatypes', '--no-sourcemap', '--no-expand-macros', '--no-tree-shake', '--coverage'])

const commands = [':help', ':quit', ':builtins', ':context', ':reload']
const expressionRegExp = new RegExp(`^(.*\\(\\s*)(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}*)$`)
const nameRegExp = new RegExp(`^(.*?)(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}*)$`)
const helpRegExp = new RegExp(`^:help\\s+(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}+)\\s*$`)
const expressions = [...normalExpressionKeys, ...specialExpressionKeys]

const config = processArguments(process.argv.slice(2))

const cliModules = getCliModules()

// Create a file resolver that resolves paths relative to the importing file's directory.
// Tries the exact path first, then appends .dvala if not found.
function createFileResolver(): (importPath: string, fromDir: string) => string {
  return (importPath: string, fromDir: string) => {
    const resolved = path.resolve(fromDir, importPath)
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf-8')
    }
    const withExtension = `${resolved}.dvala`
    if (fs.existsSync(withExtension)) {
      return fs.readFileSync(withExtension, 'utf-8')
    }
    throw new Error(`File not found: ${importPath} (tried ${resolved} and ${withExtension})`)
  }
}

function makeDvala(context: Record<string, unknown>, pure: boolean) {
  const runner = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules], fileResolver: createFileResolver(), fileResolverBaseDir: process.cwd() })
  return {
    run: (program: string | DvalaBundle) => runner.run(program, pure
      ? { pure: true }
      : { effectHandlers: [hostHandler(context)] }),
  }
}

// Evaluate a file and merge its result (if object) into the context bindings
function loadFileIntoContext(filename: string, context: Record<string, unknown>) {
  const dvala = makeDvala(context, false)
  const content = fs.readFileSync(filename, { encoding: 'utf-8' })
  const result = dvala.run(content)
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      context[key] = value
    }
  }
}

switch (config.subcommand) {
  case 'run': {
    const dvala = makeDvala(config.context, config.pure)
    try {
      const result = dvala.run(config.program)
      if (config.printResult) {
        console.log(result)
      }
      process.exit(0)
    } catch (error) {
      printErrorMessage(`${error}`)
      process.exit(1)
    }
    break
  }
  case 'build': {
    try {
      const resolved = resolveProjectConfig(config.directory)
      if (!resolved) {
        printErrorMessage('No dvala.json found. Specify a project directory or create a dvala.json in the project root.')
        process.exit(1)
      }
      // Merge dvala.json build config with CLI overrides
      const buildConfig = resolved.config.build
      const sourceMap = config.noSourceMap ? false : buildConfig.sourceMap
      const doExpandMacros = config.noExpandMacros ? false : buildConfig.expandMacros
      const doTreeShake = config.noTreeShake ? false : buildConfig.treeShake

      const absolutePath = path.resolve(resolved.rootDir, resolved.config.entry)
      let result = bundle(absolutePath, { sourceMap })
      if (doExpandMacros) {
        result = { ...result, ast: expandMacros(result.ast) }
      }
      if (doTreeShake) {
        result = { ...result, ast: treeShake(result.ast) }
      }
      const json = serializeBundle(result)
      if (config.output) {
        fs.writeFileSync(config.output, json, { encoding: 'utf-8' })
      } else {
        console.log(json)
      }
      process.exit(0)
    } catch (error) {
      printErrorMessage(`${error}`)
      process.exit(1)
    }
    break
  }
  case 'test': {
    runDvalaTest(config.filename, config.testPattern, config.reporter, config.outputFile, config.coverage, config.coverageReporter, config.coverageDir)
      .then(() => process.exit(0))
      .catch(error => {
        printErrorMessage(`${error}`)
        process.exit(1)
      })
    break
  }
  case 'init': {
    runInit()
      .then(() => process.exit(0))
      .catch(error => {
        printErrorMessage(`${error}`)
        process.exit(1)
      })
    break
  }
  case 'repl': {
    if (config.loadFilename) {
      loadFileIntoContext(config.loadFilename, config.context)
    }
    runREPL(config.context, config.projectName, config.loadFilename)
    break
  }
  case 'doc': {
    const result = lookupDoc(config.name)
    if ('error' in result) {
      printErrorMessage(result.error)
      process.exit(1)
    }
    if ('ambiguous' in result) {
      console.log(`Multiple matches for "${config.name}":\n${result.ambiguous.map(m => `  ${m}`).join('\n')}\n\nPlease be more specific.`)
      process.exit(1)
    }
    console.log(formatDoc(result.ref))
    process.exit(0)
    break
  }
  case 'list': {
    if (config.showModules) {
      console.log(listModules())
    } else if (config.showDatatypes) {
      console.log(listDatatypes())
    } else if (config.moduleName) {
      const result = listModuleExpressions(config.moduleName)
      if (result === null) {
        printErrorMessage(`Unknown module "${config.moduleName}". Available: ${getModuleNames().join(', ')}`)
        process.exit(1)
      }
      console.log(result)
    } else {
      console.log(listCoreExpressions())
    }
    process.exit(0)
    break
  }
  case 'tokenize': {
    try {
      const tokenStream = tokenizeSource(config.code, config.debug)
      console.log(JSON.stringify(tokenStream, null, 2))
      process.exit(0)
    } catch (error) {
      printErrorMessage(`${error}`)
      process.exit(1)
    }
    break
  }
  case 'parse': {
    try {
      const tokenStream = tokenizeSource(config.code, config.debug)
      const ast = parseTokenStream(tokenStream)
      console.log(JSON.stringify(ast, null, 2))
      process.exit(0)
    } catch (error) {
      printErrorMessage(`${error}`)
      process.exit(1)
    }
    break
  }
  case 'examples': {
    console.log(formatExamples())
    process.exit(0)
    break
  }
  case 'help': {
    printUsage()
    process.exit(0)
    break
  }
  case 'version': {
    console.log(version)
    process.exit(0)
    break
  }
}

/**
 * Resolve a dvala.json config from an argument that could be:
 * - null: look for dvala.json in cwd
 * - a directory path: look for dvala.json there
 * - a file path: return null (caller handles the file directly)
 */
function resolveProjectConfig(arg: Maybe<string>): ResolvedConfig | null {
  if (arg && fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
    return findConfig(arg)
  }
  if (!arg) {
    return findConfig()
  }
  // It's a file path — no config needed
  return null
}

/**
 * Read code from a file path, or resolve the entry file from dvala.json in cwd.
 * Used by -f flag handling and no-arg fallback.
 */
function resolveEntryCode(subcommand: string): string {
  const resolved = findConfig()
  if (!resolved) {
    printErrorMessage(`No dvala.json found. Pass code, use -f <file>, or run in a project directory. ("${subcommand}")`)
    process.exit(1)
  }
  if (!resolved.config.entry) {
    printErrorMessage(`No entry file configured in dvala.json. Pass code or use -f <file>. ("${subcommand}")`)
    process.exit(1)
  }
  const entryPath = path.join(resolved.rootDir, resolved.config.entry)
  if (!fs.existsSync(entryPath)) {
    printErrorMessage(`Entry file not found: ${entryPath}`)
    process.exit(1)
  }
  return fs.readFileSync(entryPath, 'utf-8')
}

/**
 * When no -l flag is given, check dvala.json for a `repl` field to auto-load.
 * Also picks up the project name for the prompt.
 */
function resolveReplConfig(loadFilename: Maybe<string>, context: Record<string, unknown>): ReplConfig {
  if (loadFilename) {
    return { subcommand: 'repl', loadFilename, projectName: null, context }
  }
  const resolved = findConfig()
  if (!resolved || !resolved.config.repl) {
    return { subcommand: 'repl', loadFilename: null, projectName: resolved?.config.name || null, context }
  }
  const replPath = path.join(resolved.rootDir, resolved.config.repl)
  if (!fs.existsSync(replPath)) {
    printErrorMessage(`REPL file not found: ${replPath} (configured in dvala.json "repl" field)`)
    process.exit(1)
  }
  return {
    subcommand: 'repl',
    loadFilename: replPath,
    projectName: resolved.config.name || null,
    context,
  }
}

function readFileContent(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    printErrorMessage(`File not found: ${filePath}`)
    process.exit(1)
  }
  return fs.readFileSync(filePath, 'utf-8')
}

function readProgram(filePath: string): string | DvalaBundle {
  const content = readFileContent(filePath)
  if (filePath.endsWith('.json')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      printErrorMessage(`Invalid JSON: ${filePath}`)
      process.exit(1)
    }
    const dvalaBundle = deserializeBundle(parsed)
    if (!dvalaBundle) {
      printErrorMessage(`Invalid bundle: ${filePath} is not a valid Dvala bundle`)
      process.exit(1)
    }
    return dvalaBundle
  }
  return content
}

/**
 * Check if an argument looks like a specific file (not a directory, not null).
 */
function isFilePath(arg: Maybe<string>): arg is string {
  if (!arg) return false
  if (!fs.existsSync(arg)) return true // doesn't exist yet — treat as file
  return !fs.statSync(arg).isDirectory()
}

async function runDvalaTest(testPath: Maybe<string>, testNamePattern: Maybe<string>, reporter: TestReporter, outputFile: Maybe<string>, coverage: boolean, coverageReporterOverride: Maybe<CoverageReporter[]>, coverageDirOverride: Maybe<string>) {
  const pattern = testNamePattern !== null ? new RegExp(testNamePattern) : undefined

  if (isFilePath(testPath)) {
    // Single file mode — no dvala.json, use coverage defaults
    if (!/\.test\.dvala/.test(testPath)) {
      printErrorMessage('Test file must end with .test.dvala')
      process.exit(1)
    }
    const result = await runTestFile({ testPath, testNamePattern: pattern, coverage })
    reportSingleFile(result, reporter, outputFile)
    if (coverage) {
      // Single file: use defaults then apply any CLI overrides; base dir is cwd
      const coverageConfig: CoverageConfig = {
        reporter: coverageReporterOverride ?? ['lcov'],
        reportsDirectory: coverageDirOverride ?? 'coverage',
        include: ['**/*.dvala'],
        exclude: ['**/*.test.dvala'],
        all: true,
      }
      writeCoverage([result], coverageConfig, process.cwd())
    }
  } else {
    // Project mode — discover tests via dvala.json
    const resolved = resolveProjectConfig(testPath)
    if (!resolved) {
      printErrorMessage('No dvala.json found. Either specify a test file, a project directory, or create a dvala.json in the project root.')
      process.exit(1)
    }
    const suiteResult = await runTestSuite(resolved.rootDir, resolved.config.tests, pattern, coverage)

    if (suiteResult.files.length === 0) {
      printErrorMessage(`No test files found matching "${resolved.config.tests}" in ${resolved.rootDir}`)
      process.exit(1)
    }

    // Console output for each file
    let success = true
    for (const fileResult of suiteResult.files) {
      const consoleResult = reporter === 'tap'
        ? formatTap(fileResult)
        : formatConsole(fileResult, { verbose: reporter === 'verbose', color: useColor })
      const consoleOutput = 'tap' in consoleResult ? consoleResult.tap : consoleResult.text
      console.log(`\n${consoleOutput}`)
      if (!consoleResult.success)
        success = false
    }

    // Suite summary
    const totalTests = suiteResult.files.reduce((sum, f) => sum + f.results.length, 0)
    const totalPassed = suiteResult.files.reduce((sum, f) => sum + f.results.filter(r => r.status === 'passed').length, 0)
    const totalFailed = suiteResult.files.reduce((sum, f) => sum + f.results.filter(r => r.status === 'failed').length, 0)
    const totalSkipped = suiteResult.files.reduce((sum, f) => sum + f.results.filter(r => r.status === 'skipped').length, 0)
    const duration = (suiteResult.durationMs / 1000).toFixed(3)

    console.log(`\n${suiteResult.files.length} test files | ${totalTests} tests | ${totalPassed} passed | ${totalFailed} failed | ${totalSkipped} skipped (${duration}s)`)

    // File output — concatenate results for all files
    if (outputFile) {
      const fileFormat = reporter !== 'default' && reporter !== 'verbose' ? reporter : inferFormat(outputFile)
      // For multi-file output, concatenate individual file results
      const fileContent = suiteResult.files.map(r => formatToFile(r, fileFormat)).join('\n')
      fs.writeFileSync(outputFile, fileContent, 'utf-8')
      console.log(`Test results written to ${outputFile}`)
    }

    if (coverage) {
      // Apply CLI overrides on top of dvala.json coverage config
      const coverageConfig: CoverageConfig = {
        ...resolved.config.coverage,
        ...(coverageReporterOverride !== null ? { reporter: coverageReporterOverride } : {}),
        ...(coverageDirOverride !== null ? { reportsDirectory: coverageDirOverride } : {}),
      }
      writeCoverage(suiteResult.files, coverageConfig, resolved.rootDir)
    }

    if (!success)
      process.exit(1)
  }
}

/**
 * Write coverage data according to the resolved coverage config.
 * Currently supports the "lcov" reporter (writes lcov.info).
 * The reportsDirectory is resolved relative to baseDir (the project root or cwd).
 */
function writeCoverage(results: TestRunResult[], coverageConfig: CoverageConfig, baseDir: string): void {
  // When all:true, glob for every matching source file so unvisited files appear at 0%
  let allFiles: string[] | undefined
  if (coverageConfig.all) {
    const matched = coverageConfig.include.flatMap(pattern =>
      globSync(pattern, { cwd: baseDir, ignore: coverageConfig.exclude, absolute: true }),
    )
    allFiles = [...new Set(matched)]
  }

  const filter: CoverageFilter = { include: coverageConfig.include, exclude: coverageConfig.exclude, rootDir: baseDir, allFiles }
  // Text summary always goes to stdout regardless of reporter config
  printCoverageText(results, filter)

  const outDir = path.resolve(baseDir, coverageConfig.reportsDirectory)
  fs.mkdirSync(outDir, { recursive: true })

  for (const reporter of coverageConfig.reporter) {
    if (reporter === 'lcov') {
      const lcov = generateSuiteLcov(results)
      const outFile = path.join(outDir, 'lcov.info')
      fs.writeFileSync(outFile, lcov, 'utf-8')
    } else if (reporter === 'html') {
      const summaries = computeCoverageSummary(results, filter)
      const htmlFiles = generateCoverageHtmlFiles(summaries, baseDir)
      for (const [relPath, content] of htmlFiles) {
        const outFile = path.join(outDir, relPath)
        fs.mkdirSync(path.dirname(outFile), { recursive: true })
        fs.writeFileSync(outFile, content, 'utf-8')
      }
    }
  }
}

const MAX_UNCOVERED_WIDTH = 20

/**
 * Print a vitest-style per-source-file coverage table to stdout.
 * Files are grouped by directory; an "All files" summary row is shown at the top.
 */
function printCoverageText(results: TestRunResult[], filter?: CoverageFilter): void {
  const summaries = computeCoverageSummary(results, filter)
  if (summaries.length === 0) return

  const cwd = process.cwd()

  // Build flat list of rows grouped by directory
  type Row = { dir: string; file: string; linePct: number; exprPct: number; uncovered: string; s: typeof summaries[0] }
  const rows: Row[] = summaries.map(s => {
    const rel = path.relative(cwd, s.path)
    const dir = path.dirname(rel)
    const file = path.basename(rel)
    const linePct = s.linesFound > 0 ? (s.linesHit / s.linesFound) * 100 : 100
    const exprPct = s.exprsFound > 0 ? (s.exprsHit / s.exprsFound) * 100 : 100
    let uncovered = s.uncoveredLines.join(',')
    if (uncovered.length > MAX_UNCOVERED_WIDTH)
      uncovered = `${uncovered.slice(0, MAX_UNCOVERED_WIDTH - 1)}…`
    return { dir, file, linePct, exprPct, uncovered, s }
  })

  // All-files aggregate
  const totalLinesHit = summaries.reduce((n, s) => n + s.linesHit, 0)
  const totalLinesFound = summaries.reduce((n, s) => n + s.linesFound, 0)
  const totalExprsHit = summaries.reduce((n, s) => n + s.exprsHit, 0)
  const totalExprsFound = summaries.reduce((n, s) => n + s.exprsFound, 0)
  const totalLinePct = totalLinesFound > 0 ? (totalLinesHit / totalLinesFound) * 100 : 100
  const totalExprPct = totalExprsFound > 0 ? (totalExprsHit / totalExprsFound) * 100 : 100

  // Column widths
  const FILE_COL = 'File'
  const LINE_COL = '% Lines'
  const EXPR_COL = '% Exprs'
  const UNCOV_COL = 'Uncovered Line #s'

  const dirHeaders = [...new Set(rows.map(r => r.dir))].map(d => ` ${d}`)
  const fileEntries = rows.map(r => `  ${r.file}`)
  const fileColWidth = Math.max(FILE_COL.length, 'All files'.length, ...dirHeaders.map(s => s.length), ...fileEntries.map(s => s.length))
  const pctColWidth = Math.max(LINE_COL.length, EXPR_COL.length, 6) // "100.00"
  const uncovColWidth = Math.max(UNCOV_COL.length, MAX_UNCOVERED_WIDTH)

  const sep = `${'-'.repeat(fileColWidth + 1)}|${'-'.repeat(pctColWidth + 2)}|${'-'.repeat(pctColWidth + 2)}|${'-'.repeat(uncovColWidth + 2)}`

  function fmtPct(pct: number): string {
    return (Number.isInteger(pct) ? `${pct}` : pct.toFixed(2)).padStart(pctColWidth)
  }

  function row(label: string, linePct: number, exprPct: number, uncovered: string): string {
    return `${label.padEnd(fileColWidth)} | ${fmtPct(linePct)} | ${fmtPct(exprPct)} | ${uncovered.padEnd(uncovColWidth)}`
  }

  console.log(`\n${sep}`)
  console.log(`${FILE_COL.padEnd(fileColWidth)} | ${LINE_COL.padStart(pctColWidth)} | ${EXPR_COL.padStart(pctColWidth)} | ${UNCOV_COL.padEnd(uncovColWidth)}`)
  console.log(sep)
  console.log(row('All files', totalLinePct, totalExprPct, ''))

  // Group rows by directory
  const byDir = new Map<string, Row[]>()
  for (const r of rows) {
    let group = byDir.get(r.dir)
    if (!group) { group = []; byDir.set(r.dir, group) }
    group.push(r)
  }

  // Root-level files first, then subdirectories
  const sortedDirs = [...byDir.keys()].sort((a, b) => a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b))
  for (const dir of sortedDirs) {
    const files = byDir.get(dir)!
    if (dir === '.') {
      // Root-level files: same indent as directory headers, no directory row
      for (const f of files)
        console.log(row(` ${f.file}`, f.linePct, f.exprPct, f.uncovered))
    } else {
      const dirLinePct = files.reduce((s, f) => s + f.linePct, 0) / files.length
      const dirExprPct = files.reduce((s, f) => s + f.exprPct, 0) / files.length
      console.log(row(` ${dir}`, dirLinePct, dirExprPct, ''))
      for (const f of files)
        console.log(row(`  ${f.file}`, f.linePct, f.exprPct, f.uncovered))
    }
  }

  console.log(sep)
}

function reportSingleFile(result: TestRunResult, reporter: TestReporter, outputFile: Maybe<string>) {
  // Console output — always human-readable
  const consoleResult = reporter === 'tap'
    ? formatTap(result)
    : formatConsole(result, { verbose: reporter === 'verbose', color: useColor })
  const consoleOutput = 'tap' in consoleResult ? consoleResult.tap : consoleResult.text
  console.log(`\n${consoleOutput}`)

  // File output
  if (outputFile) {
    const fileFormat = reporter !== 'default' && reporter !== 'verbose' ? reporter : inferFormat(outputFile)
    const fileContent = formatToFile(result, fileFormat)
    fs.writeFileSync(outputFile, fileContent, 'utf-8')
    console.log(`Test results written to ${outputFile}`)
  }

  if (!consoleResult.success)
    process.exit(1)
}

function inferFormat(filename: string): TestReporter {
  if (filename.endsWith('.xml'))
    return 'junit'
  if (filename.endsWith('.html'))
    return 'html'
  return 'tap'
}

function formatToFile(result: TestRunResult, format: TestReporter): string {
  switch (format) {
    case 'junit':
      return formatJunit(result).xml
    case 'html':
      return formatHtml(result).html
    default:
      return formatTap(result).tap
  }
}

/**
 * CLI effect handlers for dvala.io.* effects that require terminal interaction.
 * Takes a readLine function (readline.question wrapper) and returns handler registrations.
 */
function getCliIoEffectHandlers(readLine: (msg: string) => Promise<string>) {
  return [
    { pattern: 'dvala.io.read', handler: async ({ arg, resume }: { arg: unknown; resume: (v: unknown) => void }) => {
      const message = typeof arg === 'string' ? arg : ''
      const answer = await readLine(message)
      resume(answer)
    } },
    { pattern: 'dvala.io.pick', handler: async ({ arg, resume }: { arg: unknown; resume: (v: unknown) => void }) => {
      // Support both plain array and { items, options } format
      const items: string[] = Array.isArray(arg) ? arg as string[] : (arg as { items: string[] }).items
      const options = Array.isArray(arg) ? undefined : (arg as { options?: { prompt?: string; default?: number } }).options
      const header = options?.prompt ?? 'Pick one:'
      const defaultIndex = options?.default
      for (let i = 0; i < items.length; i++) {
        console.log(`  ${i}) ${items[i]}`)
      }
      const defaultHint = defaultIndex !== undefined ? ` [default: ${defaultIndex}]` : ''
      const answer = await readLine(`${header}${defaultHint} `)
      const trimmed = answer.trim()
      if (trimmed === '') {
        resume(defaultIndex !== undefined ? defaultIndex : null)
      } else {
        resume(Number(trimmed))
      }
    } },
    { pattern: 'dvala.io.confirm', handler: async ({ arg, resume }: { arg: unknown; resume: (v: unknown) => void }) => {
      // arg is either a string or { question, options: { default } }
      const question = typeof arg === 'string' ? arg : (arg as { question: string }).question ?? 'Confirm?'
      const defaultValue = typeof arg === 'string' ? undefined : (arg as { options?: { default?: boolean } }).options?.default
      const hint = defaultValue === true ? '(Y/n)' : defaultValue === false ? '(y/N)' : '(y/n)'
      const answer = await readLine(`${question} ${hint}: `)
      const trimmed = answer.trim()
      if (trimmed === '' && defaultValue !== undefined) {
        resume(defaultValue)
      } else {
        resume(trimmed.toLowerCase().startsWith('y'))
      }
    } },
  ]
}

async function execute(expression: string, scope: Record<string, unknown>, readLine: (msg: string) => Promise<string>): Promise<Record<string, unknown>> {
  const _dvala = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules] })
  try {
    const runResult = await _dvala.runAsync(expression, {
      scope,
      effectHandlers: getCliIoEffectHandlers(readLine),
    })
    if (runResult.type === 'error')
      throw runResult.error
    const result = runResult.type === 'completed' ? runResult.value : null
    historyResults.unshift(result)
    if (historyResults.length > 9) {
      historyResults.length = 9
    }
    const newScope = { ...scope, ...(runResult.type === 'completed' ? runResult.scope : {}) }
    setReplHistoryVariables(newScope)
    console.log(stringifyValue(result, false))
    return newScope
  } catch (error) {
    printErrorMessage(`${error}`)
    return { ...scope, '*e*': getErrorMessage(error) }
  }
}

/**
 * Interactive project initialization — prompts the user for project settings
 * via Dvala IO effects and writes dvala.json + starter files.
 */
async function runInit(): Promise<void> {
  const configPath = path.join(process.cwd(), 'dvala.json')
  const configExists = fs.existsSync(configPath)

  const dirName = path.basename(process.cwd())

  const readline = await import('node:readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  function readLine(message: string): Promise<string> {
    return new Promise<string>(resolve => rl.question(message, answer => resolve(answer)))
  }

  // The init script is written in Dvala (init.dvala) — it handles all interactive
  // prompting and returns { name, entryFile, tests }. The TS host provides
  // host values and IO effect handlers.

  const _dvala = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules] })
  const runResult = await _dvala.runAsync(initScript, {
    effectHandlers: [
      hostHandler({ configExists, dirName }),
      ...getCliIoEffectHandlers(readLine),
    ],
  })

  rl.close()

  if (runResult.type === 'error') {
    // Clean exit for user-initiated abort (declined overwrite)
    const msg = runResult.error instanceof Error ? runResult.error.message : `${runResult.error}`
    if (msg.includes('Aborted')) {
      console.log('\nAborted.')
      return
    }
    throw runResult.error
  }
  if (runResult.type !== 'completed')
    throw new Error('Init script did not complete')

  const result = runResult.value as { name: string; entryFile: boolean; tests: boolean; repl: boolean; vscode: boolean }
  const projectName = result.name || dirName

  // Build dvala.json config
  const projectConfig: Record<string, string> = { name: projectName }
  const entryFileName = 'main.dvala'
  const testsGlob = '**/*.test.dvala'

  if (result.entryFile) {
    projectConfig.entry = entryFileName
  }
  if (result.tests) {
    projectConfig.tests = testsGlob
  }
  if (result.repl) {
    projectConfig.repl = entryFileName
  }

  // Write dvala.json
  fs.writeFileSync(configPath, `${JSON.stringify(projectConfig, null, 2)}\n`)
  console.log(`\nCreated ${fmt.bright.white('dvala.json')}`)

  // Write entry file from template if requested
  if (result.entryFile) {
    const entryPath = path.join(process.cwd(), entryFileName)
    if (!fs.existsSync(entryPath)) {
      fs.writeFileSync(entryPath, mainTemplate)
      console.log(`Created ${fmt.bright.white(entryFileName)}`)
    }
  }

  // Write test file from template if requested
  if (result.tests) {
    const testsDir = path.join(process.cwd(), 'tests')
    const sampleTestPath = path.join(testsDir, 'main.test.dvala')
    if (!fs.existsSync(sampleTestPath)) {
      fs.mkdirSync(testsDir, { recursive: true })
      fs.writeFileSync(sampleTestPath, mainTestTemplate)
      console.log(`Created ${fmt.bright.white('tests/main.test.dvala')}`)
    }
  }

  // Write .vscode/launch.json if requested
  if (result.vscode) {
    const vscodeDir = path.join(process.cwd(), '.vscode')
    const launchJsonPath = path.join(vscodeDir, 'launch.json')
    if (!fs.existsSync(launchJsonPath)) {
      fs.mkdirSync(vscodeDir, { recursive: true })
      const launchJson = {
        version: '0.2.0',
        configurations: [
          {
            type: 'dvala',
            request: 'launch',
            name: 'Debug Dvala',
            program: '${file}',
          },
        ],
      }
      fs.writeFileSync(launchJsonPath, `${JSON.stringify(launchJson, null, 2)}\n`)
      console.log(`Created ${fmt.bright.white('.vscode/launch.json')}`)
    }
  }

  console.log(`\nDone! Run ${fmt.bright.white('dvala')} to get started.`)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message

  return 'Unknown error'
}

function setReplHistoryVariables(bindings: Record<string, unknown>): void {
  for (let i = 1; i <= 9; i++)
    delete bindings[`*${i}*`]
  historyResults.forEach((value, i) => {
    bindings[`*${i + 1}*`] = value
  })
}

function parseOption(args: string[], i: number): { option: string; argument: Maybe<string>; count: number } | null {
  const option = args[i]!

  // Short option: -x
  if (/^-[a-z]$/i.test(option)) {
    if (booleanFlags.has(option)) {
      return { option, argument: null, count: 1 }
    }
    return { option, argument: args[i + 1] ?? null, count: 2 }
  }

  // Long option: --foo or --foo=value
  const match = /^(--[a-z-]+)(?:=(.*))?$/i.exec(option)
  if (match) {
    const name = match[1]!
    const inlineArg = match[2]
    if (inlineArg !== undefined) {
      return { option: name, argument: inlineArg, count: 1 }
    }
    if (booleanFlags.has(name)) {
      return { option: name, argument: null, count: 1 }
    }
    return { option: name, argument: args[i + 1] ?? null, count: 2 }
  }

  return null
}

function parseContextOptions(args: string[], startIndex: number): { options: ContextOptions; nextIndex: number } {
  const options: ContextOptions = { context: {} }
  let i = startIndex
  while (i < args.length) {
    const parsed = parseOption(args, i)
    if (!parsed)
      break

    switch (parsed.option) {
      case '-c':
      case '--context':
        if (!parsed.argument) {
          printErrorMessage(`Missing context JSON after ${parsed.option}`)
          process.exit(1)
        }
        try {
          Object.entries(JSON.parse(parsed.argument) as UnknownRecord).forEach(([key, value]) => {
            options.context[key] = value
          })
        } catch (e) {
          printErrorMessage(`Couldn\`t parse context: ${getErrorMessage(e)}`)
          process.exit(1)
        }
        i += parsed.count
        break
      case '-C':
      case '--context-file':
        if (!parsed.argument) {
          printErrorMessage(`Missing context filename after ${parsed.option}`)
          process.exit(1)
        }
        try {
          const contextString = fs.readFileSync(parsed.argument, { encoding: 'utf-8' })
          Object.entries(JSON.parse(contextString) as UnknownRecord).forEach(([key, value]) => {
            options.context[key] = value
          })
        } catch (e) {
          printErrorMessage(`Couldn\`t parse context: ${getErrorMessage(e)}`)
          process.exit(1)
        }
        i += parsed.count
        break
      default:
        return { options, nextIndex: i }
    }
  }
  return { options, nextIndex: i }
}

function parsePrintOptions(args: string[], startIndex: number): { options: PrintOptions; nextIndex: number } {
  const options: PrintOptions = { printResult: true }
  let i = startIndex
  while (i < args.length) {
    const parsed = parseOption(args, i)
    if (!parsed)
      break

    switch (parsed.option) {
      case '-s':
      case '--silent':
        options.printResult = false
        i += parsed.count
        break
      default:
        return { options, nextIndex: i }
    }
  }
  return { options, nextIndex: i }
}

function parseRunOptions(args: string[], startIndex: number): { context: Record<string, unknown>; printResult: boolean; pure: boolean; file: Maybe<string>; positional: Maybe<string>; nextIndex: number } {
  let context: Record<string, unknown> = {}
  let printResult = true
  let pure = false
  let file: Maybe<string> = null
  let positional: Maybe<string> = null
  let i = startIndex
  while (i < args.length) {
    const parsed = parseOption(args, i)
    if (!parsed) {
      if (positional !== null) {
        printErrorMessage(`Unexpected argument "${args[i]}"`)
        process.exit(1)
      }
      positional = args[i]!
      i += 1
      continue
    }

    switch (parsed.option) {
      case '-f':
      case '--file':
        if (!parsed.argument) {
          printErrorMessage(`Missing filename after ${parsed.option}`)
          process.exit(1)
        }
        file = parsed.argument
        i += parsed.count
        break
      case '-c':
      case '--context':
      case '-C':
      case '--context-file': {
        const result = parseContextOptions(args, i)
        context = { ...context, ...result.options.context }
        i = result.nextIndex
        break
      }
      case '-s':
      case '--silent': {
        const result = parsePrintOptions(args, i)
        printResult = result.options.printResult
        i = result.nextIndex
        break
      }
      case '--pure':
        pure = true
        i += parsed.count
        break
      default:
        printErrorMessage(`Unknown option "${parsed.option}"`)
        process.exit(1)
    }
  }
  return { context, printResult, pure, file, positional, nextIndex: i }
}

function processArguments(args: string[]): Config {
  // Global flags (no subcommand)
  if (args.length === 0) {
    return resolveReplConfig(null, {})
  }

  const first = args[0]!

  if (first === '--help' || first === '-h') {
    return { subcommand: 'help' }
  }
  if (first === '--version') {
    return { subcommand: 'version' }
  }

  switch (first) {
    case 'run': {
      const { positional, file, context, printResult, pure } = parseRunOptions(args, 1)
      if (positional && file) {
        printErrorMessage('Cannot use both inline code and -f <file>')
        process.exit(1)
      }
      let program: string | DvalaBundle
      if (positional) {
        program = positional
      } else if (file) {
        program = readProgram(file)
      } else {
        program = resolveEntryCode('run')
      }
      return { subcommand: 'run', program, context, printResult, pure }
    }
    case 'build': {
      let directory: Maybe<string> = null
      let output: Maybe<string> = null
      let noSourceMap = false
      let noExpandMacros = false
      let noTreeShake = false
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          if (directory !== null) {
            printErrorMessage(`Unexpected argument "${args[i]}"`)
            process.exit(1)
          }
          directory = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '-o':
          case '--output':
            if (!parsed.argument) {
              printErrorMessage(`Missing output filename after ${parsed.option}`)
              process.exit(1)
            }
            output = parsed.argument
            i += parsed.count
            break
          case '--no-sourcemap':
            noSourceMap = true
            i += parsed.count
            break
          case '--no-expand-macros':
            noExpandMacros = true
            i += parsed.count
            break
          case '--no-tree-shake':
            noTreeShake = true
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "build"`)
            process.exit(1)
        }
      }
      // directory is optional — if omitted, looks for dvala.json in cwd
      return { subcommand: 'build', directory, output, noSourceMap, noExpandMacros, noTreeShake }
    }
    case 'test': {
      let filename: Maybe<string> = null
      let testPattern: Maybe<string> = null
      let reporter: TestReporter = 'default'
      let outputFile: Maybe<string> = null
      let coverage = false
      let coverageReporter: Maybe<CoverageReporter[]> = null
      let coverageDir: Maybe<string> = null
      let i = 1
      const validReporters: TestReporter[] = ['default', 'verbose', 'tap', 'junit', 'html']
      const validCoverageReporters: CoverageReporter[] = ['lcov', 'html']
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          if (filename !== null) {
            printErrorMessage(`Unexpected argument "${args[i]}"`)
            process.exit(1)
          }
          filename = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '--pattern':
            if (!parsed.argument) {
              printErrorMessage(`Missing test name pattern after ${parsed.option}`)
              process.exit(1)
            }
            testPattern = parsed.argument
            i += parsed.count
            break
          case '--reporter':
            if (!parsed.argument || !validReporters.includes(parsed.argument as TestReporter)) {
              printErrorMessage(`--reporter must be one of: ${validReporters.join(', ')}`)
              process.exit(1)
            }
            reporter = parsed.argument as TestReporter
            i += parsed.count
            break
          case '--outputFile':
            if (!parsed.argument) {
              printErrorMessage('Missing filename after --outputFile')
              process.exit(1)
            }
            outputFile = parsed.argument
            i += parsed.count
            break
          case '--coverage':
            coverage = true
            i += parsed.count
            break
          case '--coverage-reporter': {
            if (!parsed.argument) {
              printErrorMessage('Missing reporters after --coverage-reporter')
              process.exit(1)
            }
            const reporters = parsed.argument.split(',').map(r => r.trim()) as CoverageReporter[]
            const invalid = reporters.filter(r => !validCoverageReporters.includes(r))
            if (invalid.length > 0) {
              printErrorMessage(`Invalid coverage reporter(s): ${invalid.join(', ')}. Must be one of: ${validCoverageReporters.join(', ')}`)
              process.exit(1)
            }
            coverageReporter = reporters
            i += parsed.count
            break
          }
          case '--coverage-dir':
            if (!parsed.argument) {
              printErrorMessage('Missing directory after --coverage-dir')
              process.exit(1)
            }
            coverageDir = parsed.argument
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "test"`)
            process.exit(1)
        }
      }
      // filename is optional — if omitted, dvala.json project mode is used
      return { subcommand: 'test', filename, testPattern, reporter, outputFile, coverage, coverageReporter, coverageDir }
    }
    case 'repl': {
      let loadFilename: Maybe<string> = null
      let context: Record<string, unknown> = {}
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          printErrorMessage(`Unknown argument "${args[i]}"`)
          process.exit(1)
        }
        switch (parsed.option) {
          case '-l':
          case '--load':
            if (!parsed.argument) {
              printErrorMessage(`Missing filename after ${parsed.option}`)
              process.exit(1)
            }
            loadFilename = parsed.argument
            i += parsed.count
            break
          case '-c':
          case '--context':
          case '-C':
          case '--context-file': {
            const result = parseContextOptions(args, i)
            context = { ...context, ...result.options.context }
            i = result.nextIndex
            break
          }
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "repl"`)
            process.exit(1)
        }
      }
      return resolveReplConfig(loadFilename, context)
    }
    case 'doc': {
      const name = args[1]
      if (!name) {
        printErrorMessage('Missing name after "doc"')
        process.exit(1)
      }
      return { subcommand: 'doc', name }
    }
    case 'list': {
      let moduleName: Maybe<string> = null
      let showModules = false
      let showDatatypes = false
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          // Positional argument = module name
          moduleName = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '--modules':
            showModules = true
            i += parsed.count
            break
          case '--datatypes':
            showDatatypes = true
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "list"`)
            process.exit(1)
        }
      }
      return { subcommand: 'list', moduleName, showModules, showDatatypes }
    }
    case 'tokenize':
    case 'parse': {
      let positional: Maybe<string> = null
      let file: Maybe<string> = null
      let debug = false
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          positional = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '-f':
          case '--file':
            if (!parsed.argument) {
              printErrorMessage(`Missing filename after ${parsed.option}`)
              process.exit(1)
            }
            file = parsed.argument
            i += parsed.count
            break
          case '--debug':
            debug = true
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "${first}"`)
            process.exit(1)
        }
      }
      if (positional && file) {
        printErrorMessage(`Cannot use both inline code and -f <file> for "${first}"`)
        process.exit(1)
      }
      let code: string
      if (positional) {
        code = positional
      } else if (file) {
        code = readFileContent(file)
      } else {
        code = resolveEntryCode(first)
      }
      return { subcommand: first, code, debug }
    }
    case 'init': {
      return { subcommand: 'init' }
    }
    case 'examples': {
      return { subcommand: 'examples' }
    }
    case 'help': {
      return { subcommand: 'help' }
    }
    default: {
      printErrorMessage(`Unknown subcommand "${first}". Run "dvala help" for usage.`)
      process.exit(1)
    }
  }
}

function runREPL(initialBindings: Record<string, unknown>, projectName: Maybe<string>, loadFilename: Maybe<string>) {
  const prompt = projectName
    ? fmt.bright.gray(`${projectName}> `)
    : PROMPT

  if (projectName) {
    console.log(`Welcome to Dvala v${version} — ${fmt.bright.white(projectName)}`)
  } else {
    console.log(`Welcome to Dvala v${version}.`)
  }
  console.log(`Type ${fmt.italic(':help')} for more information.`)

  let bindings = initialBindings

  if (Object.keys(bindings).length > 0) {
    console.log()
    printContext(bindings)
  }

  const rl = createReadlineInterface({
    completer,
    historySize: HIST_SIZE,
    prompt,
  })

  async function readLine(message: string): Promise<string> {
    return new Promise<string>(resolve => rl.question(message, answer => resolve(answer)))
  }

  rl.prompt()

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  rl.on('line', async line => {
    line = line.trim()

    const helpMatch = helpRegExp.exec(line)
    if (helpMatch) {
      const name = helpMatch[1]!
      console.log(getCliDocumentation(fmt, name))
    } else if (line.startsWith(':')) {
      switch (line) {
        case ':builtins':
          printBuiltins()
          break
        case ':help':
          printHelp()
          break
        case ':context':
          printContext(bindings)
          break
        case ':reload':
          if (loadFilename) {
            try {
              bindings = {}
              loadFileIntoContext(loadFilename, bindings)
              console.log(`Reloaded ${fmt.bright.white(path.basename(loadFilename))}`)
            } catch (error) {
              printErrorMessage(`${error}`)
            }
          } else {
            printErrorMessage('No file to reload (REPL was started without a load file)')
          }
          break
        case ':quit':
          rl.close()
          break
        default:
          printErrorMessage(`Unrecognized command ${Colors.Italic}${line}${Colors.ResetItalic}, try ${Colors.Italic}:help${Colors.ResetItalic}`)
      }
    } else if (line) {
      bindings = await execute(line, bindings, readLine)
    }
    rl.prompt()
  }).on('close', () => {
    console.log('Over and out!')
    process.exit(0)
  })
}

function printBuiltins() {
  Object
    .values(apiReference)
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach(reference => {
      console.log(`
${fmt.bright.blue(reference.title)} - ${fmt.gray(reference.category)}
${getDocString(reference)}`)
    })
}

function getDocString(reference: Reference) {
  if (isFunctionReference(reference))
    return `${getCliFunctionSignature(fmt, reference)}`
  return ''
}

function printHelp() {
  console.log(`
:builtins                 Print all builtin functions
:context                  Print context
:reload                   Reload the project REPL file
:help                     Print this help message
:help [builtin function]  Print help for [builtin function]
:quit                     Quit
`.trim())
}

function printUsage() {
  console.log(`
Usage: dvala [subcommand] [options]

Subcommands:
  run [code] [options]            Run code, a file (-f), or project entry (dvala.json)
  build [dir] [options]           Build a project (uses dvala.json)
  test [file] [options]           Run a .test.dvala test file
  init                            Initialize a new project (creates dvala.json)
  repl [options]                  Start an interactive REPL
  doc <name>                      Show documentation for a function/expression
  list [module] [options]         List core expressions or module functions
  tokenize [code] [options]       Tokenize code, a file (-f), or project entry to JSON
  parse [code] [options]          Parse code, a file (-f), or project entry to AST JSON
  examples                        Show example programs
  help                            Show this help

Run options:
  -f, --file=<file>               Run a .dvala file (or .json bundle)
  -c, --context=<json>            Context as a JSON string
  -C, --context-file=<file>       Context from a .json file
  -s, --silent                    Suppress printing the result
  --pure                          Enforce pure mode (no side effects or non-determinism)

Build options:
  -o, --output=<file>             Write build output to file (default: stdout)
  --no-sourcemap                  Strip source maps from bundle
  --no-expand-macros              Skip build-time macro expansion
  --no-tree-shake                 Skip unused binding removal

Test options:
  --pattern=<regex>               Only run tests matching pattern

Repl options:
  -l, --load=<file>               Preload a .dvala file into the REPL context
  -c, --context=<json>            Context as a JSON string
  -C, --context-file=<file>       Context from a .json file

List options:
  --modules                       List all available modules
  --datatypes                     List all datatypes

Tokenize/Parse options:
  -f, --file=<file>               Read code from a .dvala file
  --debug                         Include source positions in output

Global options:
  -h, --help                      Show this help
  --version                       Print dvala version

With no subcommand, starts an interactive REPL.
`.trim())
}

function printContext(bindings: Record<string, unknown>) {
  const keys = Object.keys(bindings)

  if (keys.length === 0) {
    console.log('[empty]\n')
  } else {
    keys.sort().forEach(x => {
      console.log(`${x} = ${formatValue(stringifyValue(bindings[x], false))}`)
    })
    console.log()
  }
}

function completer(line: string) {
  const helpMatch = line.match(/:help\s+(.*)/)
  if (helpMatch)
    return [expressions.filter(c => c.startsWith(helpMatch[1]!)).map(c => `:help ${c} `), line]

  if (line.startsWith(':'))
    return [commands.filter(c => c.startsWith(line)).map(c => `${c} `), line]

  const expressionMatch = expressionRegExp.exec(line)

  if (expressionMatch)
    return [expressions.filter(c => c.startsWith(expressionMatch[2]!)).map(c => `${expressionMatch[1]}${c} `), line]

  // TODO, add reserved names
  const replBindings = (config as ReplConfig).context ?? {}
  const names = [...new Set([...Object.keys(replBindings)])]
  const nameMatch = nameRegExp.exec(line)

  if (nameMatch)
    return [names.filter(c => c.startsWith(nameMatch[2]!)).map(c => `${nameMatch[1]}${c} `), line]

  return [[], line]
}

function printErrorMessage(message: string) {
  console.error(fmt.bright.red(message))
}
