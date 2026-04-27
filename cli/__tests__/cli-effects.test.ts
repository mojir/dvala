/**
 * Tests that CLI effect handlers for dvala.io.* effects return the correct
 * types and values — matching the browser (playground) handler contracts.
 *
 * Contract per effect:
 *   dvala.io.read    : arg = string prompt → resumes with string
 *   dvala.io.pick    : arg = array | {items, options} → resumes with number (index) or null
 *   dvala.io.confirm : arg = string → resumes with boolean
 *   dvala.io.print   : arg = any → resumes with the value (handled by standard handler)
 *   dvala.io.error   : arg = any → resumes with the value (handled by standard handler)
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const dvalaCliPath = path.join(__dirname, '../../dist/cli/cli.js')
const exampleProjectDir = path.join(__dirname, '../../examples/project')

/**
 * Spawn the REPL, send a Dvala expression that wraps the result in a known marker,
 * feed answers for interactive prompts, and extract the marked result from stdout.
 *
 * The expression is wrapped as:
 *   let __r = <code>; "<<RESULT:" ++ str(__r) ++ ":END>>"
 * so we can reliably find the result in the mixed stdout output.
 */
function replEval(code: string, answers: string[] = [], cliArgs: string[] = []): Promise<string> {
  // Wrap code so result is clearly delimited in stdout.
  // Use explicit null check since str(null) returns "".
  const wrappedCode = `let __r = (${code}); "<<RESULT:" ++ (if __r == null then "null" else str(__r) end) ++ ":END>>"`

  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn('node', [dvalaCliPath, ...cliArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    })

    let stdout = ''
    let sentCode = false
    let answerIdx = 0

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk

      // Wait for first REPL prompt, then send the code
      if (!sentCode && stdout.includes('> ')) {
        sentCode = true
        child.stdin.write(`${wrappedCode}\n`)
        return
      }

      // After sending code, feed answers for interactive effect prompts
      if (sentCode && answerIdx < answers.length && !chunk.includes('> ')) {
        child.stdin.write(`${answers[answerIdx]}\n`)
        answerIdx++
        return
      }

      // When the result marker appears, quit
      if (sentCode && stdout.includes(':END>>')) {
        child.stdin.write(':quit\n')
      }
    })

    // Ignore stderr — dvala.io.error writes there by design
    child.on('close', () => {
      // Extract result from the <<RESULT:...:END>> marker
      const match = /<<RESULT:(.*?):END>>/.exec(stdout)
      if (match) {
        resolve(match[1]!)
      } else {
        reject(new Error(`No result marker found in stdout:\n${stdout}`))
      }
    })

    setTimeout(() => {
      child.kill()
      reject(new Error(`Timeout. stdout so far:\n${stdout}`))
    }, 10000)
  })
}

describe('CLI IO effect handlers', () => {
  it('loads a file into the REPL with relative imports resolved from that file', async () => {
    const mainFile = path.join(exampleProjectDir, 'main.dvala')
    expect(fs.existsSync(mainFile)).toBe(true)

    const result = await replEval('result.avg', [], ['repl', '-l', mainFile])

    expect(result).toBe('5')
  })

  // ── dvala.io.read ─────────────────────────────────────────────────────

  describe('dvala.io.read', () => {
    it('returns a string', async () => {
      const result = await replEval('perform(@dvala.io.read, "Name: ")', ['Alice'])
      expect(result).toBe('Alice')
    })

    it('returns empty string for empty input', async () => {
      const result = await replEval('perform(@dvala.io.read, "Name: ")', [''])
      expect(result).toBe('')
    })
  })

  // ── dvala.io.pick ─────────────────────────────────────────────────────

  describe('dvala.io.pick', () => {
    it('returns the selected index as a number', async () => {
      const result = await replEval('perform(@dvala.io.pick, ["A", "B", "C"])', ['1'])
      expect(result).toBe('1')
    })

    it('returns 0 for first item', async () => {
      const result = await replEval('perform(@dvala.io.pick, ["X", "Y"])', ['0'])
      expect(result).toBe('0')
    })

    it('supports {items, options} format with default', async () => {
      const result = await replEval('perform(@dvala.io.pick, {items: ["A", "B"], options: {default: 1}})', [''])
      expect(result).toBe('1')
    })

    it('returns null on empty input without default', async () => {
      const result = await replEval('perform(@dvala.io.pick, ["A", "B"])', [''])
      expect(result).toBe('null')
    })
  })

  // ── dvala.io.confirm ──────────────────────────────────────────────────

  describe('dvala.io.confirm', () => {
    it('returns true for "y"', async () => {
      const result = await replEval('perform(@dvala.io.confirm, "OK?")', ['y'])
      expect(result).toBe('true')
    })

    it('returns true for "yes"', async () => {
      const result = await replEval('perform(@dvala.io.confirm, "OK?")', ['yes'])
      expect(result).toBe('true')
    })

    it('returns true for "Y" (case insensitive)', async () => {
      const result = await replEval('perform(@dvala.io.confirm, "OK?")', ['Y'])
      expect(result).toBe('true')
    })

    it('returns false for "n"', async () => {
      const result = await replEval('perform(@dvala.io.confirm, "OK?")', ['n'])
      expect(result).toBe('false')
    })

    it('returns false for empty input', async () => {
      const result = await replEval('perform(@dvala.io.confirm, "OK?")', [''])
      expect(result).toBe('false')
    })
  })

  // ── dvala.io.print ────────────────────────────────────────────────────
  // Handled by the standard handler — resumes with the value (identity)

  describe('dvala.io.print', () => {
    it('resumes with the original number value', async () => {
      const result = await replEval('perform(@dvala.io.print, 42)')
      expect(result).toBe('42')
    })

    it('resumes with the original string value', async () => {
      const result = await replEval('perform(@dvala.io.print, "hello")')
      expect(result).toBe('hello')
    })
  })

  // ── dvala.io.error ────────────────────────────────────────────────────
  // Handled by the standard handler — resumes with the value (identity)

  describe('dvala.io.error', () => {
    it('resumes with the original value', async () => {
      const result = await replEval('perform(@dvala.io.error, "oops")')
      expect(result).toBe('oops')
    })
  })
})
