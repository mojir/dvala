import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export interface TutorialEntry {
  id: string
  title: string
  body: string
}

export interface TutorialFolder {
  title: string
  entries: TutorialEntry[]
}

export type TutorialItem = TutorialEntry | TutorialFolder

export function isTutorialFolder(item: TutorialItem): item is TutorialFolder {
  return 'entries' in item
}

// ---------------------------------------------------------------------------
// Markdown utilities
// ---------------------------------------------------------------------------

export function parseTutorialMarkdown(markdown: string): { title: string; body: string } {
  const lines = markdown.split('\n')
  const titleLineIndex = lines.findIndex(line => /^# .+$/.test(line))
  if (titleLineIndex === -1) {
    throw new Error('Tutorial markdown must have a # title')
  }
  const title = /^# (.+)$/.exec(lines[titleLineIndex]!)![1]!
  const bodyLines = [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)]
  const body = bodyLines.join('\n').trim()
  return { title, body }
}

/**
 * Extract runnable dvala code blocks from tutorial markdown.
 * Blocks tagged `no-run` are excluded.
 */
export function extractCodeBlocks(markdown: string): string[][] {
  const codeBlockRegExp = /^```dvala([^\n]*)\n([\s\S]*?)^```/gm
  const blocks: string[][] = []
  let match: RegExpExecArray | null

  while ((match = codeBlockRegExp.exec(markdown)) !== null) {
    const options = match[1]!.trim().split(',').map(s => s.trim()).filter(Boolean)
    if (!options.includes('no-run')) {
      blocks.push(match[2]!.split('\n').filter((_, i, arr) => i < arr.length - 1 || arr[i] !== ''))
    }
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Filesystem scanning
// ---------------------------------------------------------------------------

const pagesDir = path.resolve(process.cwd(), 'tutorials')

function toDisplayName(name: string): string {
  return name
    .replace(/^\d+-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function loadMarkdownFile(filePath: string): TutorialEntry {
  const basename = path.basename(filePath, '.md').replace(/^\d+-/, '')
  const id = `tutorial-${basename}`
  const content = fs.readFileSync(filePath, 'utf-8')
  const { title, body } = parseTutorialMarkdown(content)
  return { id, title, body }
}

function loadTutorialItems(): TutorialItem[] {
  const entries = fs.readdirSync(pagesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))

  const items: TutorialItem[] = []

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

export const tutorialItems: TutorialItem[] = loadTutorialItems()

/** Flat list of all tutorial entries */
export const tutorials: TutorialEntry[] = tutorialItems.flatMap(item =>
  isTutorialFolder(item) ? item.entries : [item],
)

export function getExamples(tutorial: TutorialEntry): string[][] {
  return extractCodeBlocks(tutorial.body)
}
