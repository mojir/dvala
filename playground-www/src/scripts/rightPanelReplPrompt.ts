import { HANDLERS_FILE_PATH } from '../handlersBuffer'
import { SCRATCH_FILE_PATH } from '../scratchBuffer'

const PLAYGROUND_PATH_LABELS: Record<string, string> = {
  [SCRATCH_FILE_PATH]: '[scratch]',
  [HANDLERS_FILE_PATH]: '[handlers]',
}

export function getReplPromptText(filePath: string): string {
  const trimmedPath = filePath.trim()
  if (trimmedPath === '') return '>'

  // Show friendly labels for playground reserved paths.
  const label = PLAYGROUND_PATH_LABELS[trimmedPath]
  if (label) return `${label} >`

  const lastSlash = trimmedPath.lastIndexOf('/')
  const basename = lastSlash === -1 ? trimmedPath : trimmedPath.slice(lastSlash + 1)

  return basename === '' ? '>' : `${basename} >`
}

export function getReplPromptWidth(promptText: string): string {
  return `${Math.max(promptText.length, 1)}ch`
}