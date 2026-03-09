#!/usr/bin/env node

import type { ReadLine, ReadLineOptions } from 'node:readline'
import type { UnknownRecord } from '../../src/interface'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const historyDir = path.join(os.homedir(), '.config')
const historyFile = path.join(historyDir, 'dvala_history.txt')

function isHistoryEnabled() {
  if (fs.existsSync(historyFile))
    return true

  try {
    fs.openSync(historyFile, 'w')
  } catch (_e) {
    console.error(`No history for you!
If you would like to enable history persistence, make sure the directory "${path.resolve(
  historyDir,
)}" exists and is writable.
`)
    return false
  }
  return true
}

type Options = Required<Pick<ReadLineOptions, 'completer' | 'historySize' | 'prompt'>>

export function createReadlineInterface(options: Options): ReadLine {
  const readlineOptions: ReadLineOptions = {
    input: process.stdin,
    output: process.stdout,
    ...options,
  }
  const historyEnabled = isHistoryEnabled()
  const history = historyEnabled
    ? fs.readFileSync(historyFile, 'utf8')
      .toString()
      .split('\n')
      .slice(0, -1)
      .reverse()
      .slice(0, options.historySize)
    : []

  ;(readline as UnknownRecord).kHistorySize = Math.max((readline as UnknownRecord).kHistorySize as number, options.historySize)

  const rl = readline.createInterface(readlineOptions) as any

  if (historyEnabled) {
    const oldAddHistory = rl._addHistory

    rl._addHistory = function () {
      const last = rl.history[0]
      const line = oldAddHistory.call(rl)

      if (line.length > 0 && line !== last)
        fs.appendFileSync(historyFile, `${line}\n`)

      return line
    }

    if (Array.isArray(rl.history))
      rl.history.push(...history)
  }

  return rl
}
