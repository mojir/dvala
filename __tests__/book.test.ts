/* eslint-disable no-console */
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'

interface CodeBlock {
  code: string
  file: string
  lineNumber: number
  blockIndex: number
  noRun: boolean
  throws: boolean
}

function findUntaggedCodeBlocks(filePath: string): { file: string; lineNumber: number }[] {
  const content = readFileSync(filePath, 'utf-8')
  const relPath = filePath.replace(`${process.cwd()}/`, '')
  const untagged: { file: string; lineNumber: number }[] = []
  const lines = content.split('\n')
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!inBlock && trimmed === '```') {
      untagged.push({ file: relPath, lineNumber: i + 1 })
      inBlock = true
    } else if (!inBlock && trimmed.startsWith('```')) {
      inBlock = true
    } else if (inBlock && trimmed === '```') {
      inBlock = false
    }
  }

  return untagged
}

function extractCodeBlocksFromFile(filePath: string): CodeBlock[] {
  const content = readFileSync(filePath, 'utf-8')
  const blocks: CodeBlock[] = []
  const lines = content.split('\n')
  const relPath = filePath.replace(`${process.cwd()}/`, '')

  let inDvalaBlock = false
  let noRun = false
  let throws = false
  let currentBlock: string[] = []
  let blockStartLine = 0
  let blockIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (!inDvalaBlock && (trimmed === '```dvala' || trimmed.startsWith('```dvala '))) {
      inDvalaBlock = true
      noRun = trimmed.includes('no-run')
      throws = trimmed.includes('throws')
      currentBlock = []
      blockStartLine = i + 2 // 1-based, point to first code line
    } else if (trimmed === '```' && inDvalaBlock) {
      inDvalaBlock = false
      if (currentBlock.length > 0) {
        blocks.push({
          code: currentBlock.join('\n').trim(),
          file: relPath,
          lineNumber: blockStartLine,
          blockIndex: blockIndex++,
          noRun,
          throws,
        })
      }
    } else if (inDvalaBlock) {
      currentBlock.push(line)
    }
  }

  return blocks
}

function extractAllBookCodeBlocks(): CodeBlock[] {
  const files = globSync('book/**/*.md', { cwd: process.cwd() }).sort()
  return files.flatMap(file => extractCodeBlocksFromFile(join(process.cwd(), file)))
}

function findAllUntaggedCodeBlocks(): { file: string; lineNumber: number }[] {
  const files = globSync('book/**/*.md', { cwd: process.cwd() }).sort()
  return files.flatMap(file => findUntaggedCodeBlocks(join(process.cwd(), file)))
}

describe('book code blocks', () => {
  const dvala = createDvala({ modules: allBuiltinModules })
  const allBlocks = extractAllBookCodeBlocks()
  const runnable = allBlocks.filter(b => !b.noRun)
  const skipped = allBlocks.filter(b => b.noRun)

  it('finds dvala code blocks in the book', () => {
    expect(allBlocks.length).toBeGreaterThan(0)
    console.log(`Found ${allBlocks.length} dvala code blocks (${runnable.length} runnable, ${skipped.length} no-run)`)
  })

  it('all code blocks have a language tag', () => {
    const untagged = findAllUntaggedCodeBlocks()
    if (untagged.length > 0) {
      console.error(`Untagged code blocks:\n${untagged.map(u => `  ${u.file}:${u.lineNumber}`).join('\n')}`)
    }
    expect(untagged).toHaveLength(0)
  })

  for (const block of runnable) {
    it(`${block.file}:${block.lineNumber} block ${block.blockIndex + 1}`, () => {
      if (block.throws) {
        expect(() => dvala.run(block.code)).toThrow()
      } else {
        try {
          dvala.run(block.code)
        } catch (error) {
          console.error(`\nFailed: ${block.file} line ${block.lineNumber}`)
          console.error(block.code)
          throw error
        }
      }
    })
  }
})
