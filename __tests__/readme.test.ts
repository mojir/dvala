/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'

function extractDvalaCodeBlocks(): { code: string; lineNumber: number; blockIndex: number }[] {
  const readmeContent = readFileSync(join(process.cwd(), 'README.md'), 'utf-8')
  const blocks: { code: string; lineNumber: number; blockIndex: number }[] = []
  const lines = readmeContent.split('\n')

  let inDvalaBlock = false
  let currentBlock: string[] = []
  let blockStartLine = 0
  let blockIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (line.trim() === '```dvala' || line.trim().startsWith('```dvala ')) {
      inDvalaBlock = true
      currentBlock = []
      blockStartLine = i + 1
    } else if (line.trim() === '```' && inDvalaBlock) {
      inDvalaBlock = false
      if (currentBlock.length > 0) {
        blocks.push({
          code: currentBlock.join('\n').trim(),
          lineNumber: blockStartLine,
          blockIndex: blockIndex++,
        })
      }
    } else if (inDvalaBlock) {
      currentBlock.push(line)
    }
  }

  return blocks
}

describe('test README.md Dvala code examples', () => {
  const dvala = createDvala({ modules: allBuiltinModules })
  const codeBlocks = extractDvalaCodeBlocks()

  it('should find Dvala code blocks in README.md', () => {
    expect(codeBlocks.length).toBeGreaterThan(0)
    console.log(`Found ${codeBlocks.length} Dvala code blocks in README.md`)
  })

  for (const block of codeBlocks) {
    it(`should execute code block ${block.blockIndex + 1} (line ${block.lineNumber})`, () => {
      try {
        dvala.run(block.code)
        // Test passes if no error is thrown
        expect(true).toBe(true)
      } catch (error) {
        console.error(`\nCode block ${block.blockIndex + 1} at line ${block.lineNumber} failed:`)
        console.error('Code:')
        console.error(block.code)
        console.error('Error:')
        console.error(error)
        throw error
      }
    })
  }
})
