import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export interface ChapterEntry {
  id: string
  title: string
  body: string
}

export interface BookSection {
  title: string
  entries: ChapterEntry[]
}

export type BookItem = ChapterEntry | BookSection

export function isBookSection(item: BookItem): item is BookSection {
  return 'entries' in item
}

// ---------------------------------------------------------------------------
// Markdown utilities
// ---------------------------------------------------------------------------

export function parseChapterMarkdown(markdown: string): { title: string; body: string } {
  const lines = markdown.split('\n')
  const titleLineIndex = lines.findIndex(line => /^# .+$/.test(line))
  if (titleLineIndex === -1) {
    throw new Error('Chapter markdown must have a # title')
  }
  const title = /^# (.+)$/.exec(lines[titleLineIndex]!)![1]!
  const bodyLines = [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)]
  const body = bodyLines.join('\n').trim()
  return { title, body }
}

export interface CodeBlock {
  lines: string[]
  /** If true, the block is expected to throw an error when run. */
  throws: boolean
}

/**
 * Extract runnable dvala code blocks from chapter markdown.
 * Blocks tagged `no-run` are excluded.
 * Blocks tagged `throws` are expected to throw an error.
 */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const codeBlockRegExp = /^```dvala([^\n]*)\n([\s\S]*?)^```/gm
  const blocks: CodeBlock[] = []
  let match: RegExpExecArray | null

  while ((match = codeBlockRegExp.exec(markdown)) !== null) {
    const options = match[1]!.trim().split(',').map(s => s.trim()).filter(Boolean)
    if (!options.includes('no-run')) {
      const lines = match[2]!.split('\n').filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '')
      blocks.push({ lines, throws: options.includes('throws') })
    }
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Filesystem scanning
// ---------------------------------------------------------------------------

const pagesDir = path.resolve(process.cwd(), 'book')

function toDisplayName(name: string): string {
  return name
    .replace(/^\d+-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function loadMarkdownFile(filePath: string): ChapterEntry {
  const basename = path.basename(filePath, '.md').replace(/^\d+-/, '')
  const id = `chapter-${basename}`
  const content = fs.readFileSync(filePath, 'utf-8')
  const { title, body } = parseChapterMarkdown(content)
  return { id, title, body }
}

function loadBookItems(): BookItem[] {
  const entries = fs.readdirSync(pagesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))

  const items: BookItem[] = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      items.push(loadMarkdownFile(path.join(pagesDir, entry.name)))
    } else if (entry.isDirectory()) {
      const folderPath = path.join(pagesDir, entry.name)
      const folderTitle = toDisplayName(entry.name)
      const mdFiles = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.md'))
        .sort((a, b) => a.localeCompare(b))

      const folderEntries = mdFiles.map(f => loadMarkdownFile(path.join(folderPath, f)))

      if (folderEntries.length > 0) {
        items.push({ title: folderTitle, entries: folderEntries })
      }
    }
  }

  return items
}

export const bookItems: BookItem[] = loadBookItems()

/** Flat list of all chapter entries */
export const chapters: ChapterEntry[] = bookItems.flatMap(item =>
  isBookSection(item) ? item.entries : [item],
)

export function getExamples(chapter: ChapterEntry): CodeBlock[] {
  return extractCodeBlocks(chapter.body)
}
