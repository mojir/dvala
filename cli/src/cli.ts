#!/usr/bin/env node

import type { Reference } from '../../reference'
import type { DvalaBundle } from '../../src/bundler/interface'
import type { UnknownRecord } from '../../src/interface'
import fs from 'node:fs'
import path from 'node:path'
import { stringifyValue } from '../../common/utils'
import { version } from '../../package.json'
import { apiReference, isFunctionReference } from '../../reference'
import { allBuiltinModules } from '../../src/allModules'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { bundle } from '../../src/bundler'
import { isDvalaBundle } from '../../src/bundler/interface'
import { createDvala } from '../../src/createDvala'
import { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from '../../src/symbolPatterns'
import { runTest } from '../../src/testFramework'
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

interface RunBundleConfig {
  subcommand: 'run-bundle'
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

interface TestConfig {
  subcommand: 'test'
  filename: string
  testPattern: Maybe<string>
}

interface BundleConfig {
  subcommand: 'bundle'
  filename: string
  output: Maybe<string>
}

interface HelpConfig {
  subcommand: 'help'
}

interface VersionConfig {
  subcommand: 'version'
}

type Config = ReplConfig | RunConfig | RunBundleConfig | EvalConfig | TestConfig | BundleConfig | HelpConfig | VersionConfig

const historyResults: unknown[] = []
const formatValue = getInlineCodeFormatter(fmt)
const booleanFlags = new Set(['-s', '--silent', '--pure'])

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
      const result = dvala.run(content)
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
  case 'run-bundle': {
    const dvala = makeDvala(config.context, config.pure)
    try {
      const content = fs.readFileSync(config.filename, { encoding: 'utf-8' })
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        printErrorMessage(`Invalid bundle: ${config.filename} is not valid JSON`)
        process.exit(1)
      }
      if (!isDvalaBundle(parsed)) {
        printErrorMessage(`Invalid bundle: ${config.filename} is not a valid Dvala bundle (expected "program" string and "fileModules" array)`)
        process.exit(1)
      }
      const result = dvala.run(parsed)
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
  case 'bundle': {
    try {
      const absolutePath = path.resolve(config.filename)
      const result = bundle(absolutePath)
      const json = JSON.stringify(result, null, 2)
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
    runDvalaTest(config.filename, config.testPattern)
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

function runDvalaTest(testPath: string, testNamePattern: Maybe<string>) {
  if (!/\.test\.dvala/.test(testPath)) {
    printErrorMessage('Test file must end with .test.dvala')
    process.exit(1)
  }
  const { success, tap } = runTest({
    testPath,
    testNamePattern: testNamePattern !== null ? new RegExp(testNamePattern) : undefined,
  })

  console.log(`\n${tap}`)

  if (!success)
    process.exit(1)
}

async function execute(expression: string, bindings: Record<string, unknown>, readLine: (msg: string) => Promise<string>): Promise<Record<string, unknown>> {
  const _dvala = createDvala({ debug: true, modules: [...allBuiltinModules, ...cliModules] })
  try {
    const runResult = await _dvala.runAsync(expression, {
      bindings,
      effectHandlers: {
        'dvala.io.read-line': async ({ args, resume }) => {
          const message = typeof args[0] === 'string' ? args[0] : ''
          const answer = await readLine(message)
          resume(answer)
        },
      },
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
    case 'run-bundle': {
      const { positional: filename, context, printResult, pure } = parseRunEvalOptions(args, 1)
      if (!filename) {
        printErrorMessage('Missing filename after "run-bundle"')
        process.exit(1)
      }
      return { subcommand: 'run-bundle', filename, context, printResult, pure }
    }
    case 'eval': {
      const { positional: expression, context, printResult, pure } = parseRunEvalOptions(args, 1)
      if (!expression) {
        printErrorMessage('Missing expression after "eval"')
        process.exit(1)
      }
      return { subcommand: 'eval', expression, context, printResult, pure }
    }
    case 'bundle': {
      let filename: Maybe<string> = null
      let output: Maybe<string> = null
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
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "bundle"`)
            process.exit(1)
        }
      }
      if (!filename) {
        printErrorMessage('Missing filename after "bundle"')
        process.exit(1)
      }
      return { subcommand: 'bundle', filename, output }
    }
    case 'test': {
      let filename: Maybe<string> = null
      let testPattern: Maybe<string> = null
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
          case '--pattern':
            if (!parsed.argument) {
              printErrorMessage(`Missing test name pattern after ${parsed.option}`)
              process.exit(1)
            }
            testPattern = parsed.argument
            i += parsed.count
            break
          default:
            printErrorMessage(`Unknown option "${parsed.option}" for "test"`)
            process.exit(1)
        }
      }
      if (!filename) {
        printErrorMessage('Missing filename after "test"')
        process.exit(1)
      }
      return { subcommand: 'test', filename, testPattern }
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
  run <file> [options]            Run a .dvala file
  run-bundle <file> [options]     Run a .json bundle
  eval <expression> [options]     Evaluate a Dvala expression
  bundle <entry> [options]        Bundle a multi-file project
  test <file> [options]           Run a .test.dvala test file
  repl [options]                  Start an interactive REPL
  help                            Show this help

Run/Run-bundle/Eval options:
  -c, --context=<json>            Context as a JSON string
  -C, --context-file=<file>       Context from a .json file
  -s, --silent                    Suppress printing the result
  --pure                          Enforce pure mode (no side effects or non-determinism)

Bundle options:
  -o, --output=<file>             Write bundle to file (default: stdout)

Test options:
  --pattern=<regex>               Only run tests matching pattern

Repl options:
  -l, --load=<file>               Preload a .dvala file into the REPL context
  -c, --context=<json>            Context as a JSON string
  -C, --context-file=<file>       Context from a .json file

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
