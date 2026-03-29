#!/usr/bin/env node
/* eslint-disable no-console */

import type { Reference } from '../../reference'
import type { DvalaBundle } from '../../src/bundler/interface'
import { serializeBundle, deserializeBundle } from '../../src/bundler/serialize'
import type { UnknownRecord } from '../../src/interface'
import fs from 'node:fs'
import path from 'node:path'
import { stringifyValue } from '../../common/utils'
import { version } from '../../package.json'
import { apiReference, isFunctionReference } from '../../reference'
import { formatDoc, formatExamples, getModuleNames, listCoreExpressions, listDatatypes, listModuleExpressions, listModules, lookupDoc } from '../../reference/format'
import { allBuiltinModules } from '../../src/allModules'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { bundle } from '../../src/bundler'
import { createDvala } from '../../src/createDvala'
import { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from '../../src/symbolPatterns'
import { findConfig } from '../../src/config'
import { runTestFile, runTestSuite } from '../../src/testFramework'
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
  context: Record<string, unknown>
}

interface RunConfig {
  subcommand: 'run'
  filename: string
  context: Record<string, unknown>
  printResult: boolean
  pure: boolean
}

interface EvalConfig {
  subcommand: 'eval'
  expression: string
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
}

interface BuildConfig {
  subcommand: 'build'
  filename: string
  output: Maybe<string>
  sourceMap: boolean
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

interface ExamplesConfig {
  subcommand: 'examples'
}

interface HelpConfig {
  subcommand: 'help'
}

interface VersionConfig {
  subcommand: 'version'
}

type Config = ReplConfig | RunConfig | EvalConfig | TestConfig | BuildConfig | DocConfig | ListConfig | TokenizeConfig | ParseConfig | ExamplesConfig | HelpConfig | VersionConfig

const historyResults: unknown[] = []
const formatValue = getInlineCodeFormatter(fmt)
const booleanFlags = new Set(['-s', '--silent', '--pure', '--debug', '--modules', '--datatypes', '--no-sourcemap'])

const commands = ['`help', '`quit', '`builtins', '`context']
const expressionRegExp = new RegExp(`^(.*\\(\\s*)(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}*)$`)
const nameRegExp = new RegExp(`^(.*?)(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}*)$`)
const helpRegExp = new RegExp(`^\`help\\s+(${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}+)\\s*$`)
const expressions = [...normalExpressionKeys, ...specialExpressionKeys]

const config = processArguments(process.argv.slice(2))

const cliModules = getCliModules()

function makeDvala(bindings: Record<string, unknown>, pure: boolean) {
  const runner = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules], bindings })
  return {
    run: (program: string | DvalaBundle) => runner.run(program, { pure }),
  }
}

switch (config.subcommand) {
  case 'run': {
    const dvala = makeDvala(config.context, config.pure)
    try {
      const content = fs.readFileSync(config.filename, { encoding: 'utf-8' })
      // Detect bundle (JSON) vs source (.dvala) by trying JSON parse
      let result: unknown
      if (config.filename.endsWith('.json')) {
        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch {
          printErrorMessage(`Invalid JSON: ${config.filename}`)
          process.exit(1)
        }
        const dvalaBundle = deserializeBundle(parsed)
        if (!dvalaBundle) {
          printErrorMessage(`Invalid bundle: ${config.filename} is not a valid Dvala bundle`)
          process.exit(1)
        }
        result = dvala.run(dvalaBundle)
      } else {
        result = dvala.run(content)
      }
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
  case 'eval': {
    const dvala = makeDvala(config.context, config.pure)
    try {
      const result = dvala.run(config.expression)
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
      const absolutePath = path.resolve(config.filename)
      const result = bundle(absolutePath, { sourceMap: config.sourceMap })
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
    runDvalaTest(config.filename, config.testPattern, config.reporter, config.outputFile)
    process.exit(0)
    break
  }
  case 'repl': {
    if (config.loadFilename) {
      const dvala = makeDvala(config.context, false)
      const content = fs.readFileSync(config.loadFilename, { encoding: 'utf-8' })
      const result = dvala.run(content)
      if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
        for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
          config.context[key] = value
        }
      }
    }
    runREPL(config.context)
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

function runDvalaTest(testPath: Maybe<string>, testNamePattern: Maybe<string>, reporter: TestReporter, outputFile: Maybe<string>) {
  const pattern = testNamePattern !== null ? new RegExp(testNamePattern) : undefined

  if (testPath) {
    // Single file mode
    if (!/\.test\.dvala/.test(testPath)) {
      printErrorMessage('Test file must end with .test.dvala')
      process.exit(1)
    }
    const result = runTestFile({ testPath, testNamePattern: pattern })
    reportSingleFile(result, reporter, outputFile)
  } else {
    // Project mode — discover tests via dvala.json
    const resolved = findConfig()
    if (!resolved) {
      printErrorMessage('No dvala.json found. Either specify a test file or create a dvala.json in the project root.')
      process.exit(1)
    }
    const suiteResult = runTestSuite(resolved.rootDir, resolved.config.tests, pattern)

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

    if (!success)
      process.exit(1)
  }
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

async function execute(expression: string, bindings: Record<string, unknown>, readLine: (msg: string) => Promise<string>): Promise<Record<string, unknown>> {
  const _dvala = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules] })
  try {
    const runResult = await _dvala.runAsync(expression, {
      bindings,
      effectHandlers: [
        { pattern: 'dvala.io.read', handler: async ({ arg, resume }) => {
          const message = typeof arg === 'string' ? arg : ''
          const answer = await readLine(message)
          resume(answer)
        } },
        { pattern: 'dvala.io.pick', handler: async ({ arg, resume }) => {
          const options = Array.isArray(arg) ? arg as string[] : (arg as { options: string[] }).options
          const message = Array.isArray(arg) ? 'Pick one:' : (arg as { message?: string }).message ?? 'Pick one:'
          for (let i = 0; i < options.length; i++) {
            console.log(`  ${i + 1}) ${options[i]}`)
          }
          const answer = await readLine(`${message} (1-${options.length}): `)
          const idx = parseInt(answer) - 1
          resume(idx >= 0 && idx < options.length ? options[idx]! : null)
        } },
        { pattern: 'dvala.io.confirm', handler: async ({ arg, resume }) => {
          const message = typeof arg === 'string' ? arg : 'Confirm?'
          const answer = await readLine(`${message} (y/n): `)
          resume(answer.toLowerCase().startsWith('y'))
        } },
      ],
    })
    if (runResult.type === 'error')
      throw runResult.error
    const result = runResult.type === 'completed' ? runResult.value : null
    historyResults.unshift(result)
    if (historyResults.length > 9) {
      historyResults.length = 9
    }
    const newBindings = { ...bindings, ...(runResult.type === 'completed' ? runResult.definedBindings : {}) }
    setReplHistoryVariables(newBindings)
    console.log(stringifyValue(result, false))
    return newBindings
  } catch (error) {
    printErrorMessage(`${error}`)
    return { ...bindings, '*e*': getErrorMessage(error) }
  }
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

function parseRunEvalOptions(args: string[], startIndex: number): { context: Record<string, unknown>; printResult: boolean; pure: boolean; positional: Maybe<string>; nextIndex: number } {
  let context: Record<string, unknown> = {}
  let printResult = true
  let pure = false
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
  return { context, printResult, pure, positional, nextIndex: i }
}

function processArguments(args: string[]): Config {
  // Global flags (no subcommand)
  if (args.length === 0) {
    return { subcommand: 'repl', loadFilename: null, context: {} }
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
      const { positional: filename, context, printResult, pure } = parseRunEvalOptions(args, 1)
      if (!filename) {
        printErrorMessage('Missing filename after "run"')
        process.exit(1)
      }
      return { subcommand: 'run', filename, context, printResult, pure }
    }
    case 'eval': {
      const { positional: expression, context, printResult, pure } = parseRunEvalOptions(args, 1)
      if (!expression) {
        printErrorMessage('Missing expression after "eval"')
        process.exit(1)
      }
      return { subcommand: 'eval', expression, context, printResult, pure }
    }
    case 'build': {
      let filename: Maybe<string> = null
      let output: Maybe<string> = null
      let sourceMap = true
      let i = 1
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
            sourceMap = false
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "build"`)
            process.exit(1)
        }
      }
      if (!filename) {
        printErrorMessage('Missing filename after "build"')
        process.exit(1)
      }
      return { subcommand: 'build', filename, output, sourceMap }
    }
    case 'test': {
      let filename: Maybe<string> = null
      let testPattern: Maybe<string> = null
      let reporter: TestReporter = 'default'
      let outputFile: Maybe<string> = null
      let i = 1
      const validReporters: TestReporter[] = ['default', 'verbose', 'tap', 'junit', 'html']
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
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "test"`)
            process.exit(1)
        }
      }
      // filename is optional — if omitted, dvala.json project mode is used
      return { subcommand: 'test', filename, testPattern, reporter, outputFile }
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
      return { subcommand: 'repl', loadFilename, context }
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
    case 'tokenize': {
      let code: Maybe<string> = null
      let debug = false
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          code = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '--debug':
            debug = true
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "tokenize"`)
            process.exit(1)
        }
      }
      if (!code) {
        printErrorMessage('Missing code after "tokenize"')
        process.exit(1)
      }
      return { subcommand: 'tokenize', code, debug }
    }
    case 'parse': {
      let code: Maybe<string> = null
      let debug = false
      let i = 1
      while (i < args.length) {
        const parsed = parseOption(args, i)
        if (!parsed) {
          code = args[i]!
          i += 1
          continue
        }
        switch (parsed.option) {
          case '--debug':
            debug = true
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "parse"`)
            process.exit(1)
        }
      }
      if (!code) {
        printErrorMessage('Missing code after "parse"')
        process.exit(1)
      }
      return { subcommand: 'parse', code, debug }
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

function runREPL(initialBindings: Record<string, unknown>) {
  console.log(`Welcome to Dvala v${version}.
Type ${fmt.italic('`help')} for more information.`)

  let bindings = initialBindings

  const rl = createReadlineInterface({
    completer,
    historySize: HIST_SIZE,
    prompt: PROMPT,
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
    } else if (line.startsWith('`')) {
      switch (line) {
        case '`builtins':
          printBuiltins()
          break
        case '`help':
          printHelp()
          break
        case '`context':
          printContext(bindings)
          break
        case '`quit':
          rl.close()
          break
        default:
          printErrorMessage(`Unrecognized command ${Colors.Italic}${line}${Colors.ResetItalic}, try ${Colors.Italic}\`help${Colors.ResetItalic}`)
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
\`builtins                 Print all builtin functions
\`context                  Print context
\`help                     Print this help message
\`help [builtin function]  Print help for [builtin function]
\`quit                     Quit
`.trim())
}

function printUsage() {
  console.log(`
Usage: dvala [subcommand] [options]

Subcommands:
  run <file> [options]            Run a .dvala file or .json bundle
  eval <expression> [options]     Evaluate a Dvala expression
  build <entry> [options]        Build a multi-file project
  test <file> [options]           Run a .test.dvala test file
  repl [options]                  Start an interactive REPL
  doc <name>                      Show documentation for a function/expression
  list [module] [options]         List core expressions or module functions
  tokenize <code> [options]       Tokenize source code to JSON
  parse <code> [options]          Parse source code to AST JSON
  examples                        Show example programs
  help                            Show this help

Run/Eval options:
  -c, --context=<json>            Context as a JSON string
  -C, --context-file=<file>       Context from a .json file
  -s, --silent                    Suppress printing the result
  --pure                          Enforce pure mode (no side effects or non-determinism)

Build options:
  -o, --output=<file>             Write build output to file (default: stdout)

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
  const helpMatch = line.match(/`help\s+(.*)/)
  if (helpMatch)
    return [expressions.filter(c => c.startsWith(helpMatch[1]!)).map(c => `\`help ${c} `), line]

  if (line.startsWith('`'))
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
