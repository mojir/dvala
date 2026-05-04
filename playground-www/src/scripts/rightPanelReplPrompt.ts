export function getReplPromptText(filePath: string): string {
  const trimmedPath = filePath.trim()
  if (trimmedPath === '') return '>'

  const lastSlash = trimmedPath.lastIndexOf('/')
  const basename = lastSlash === -1 ? trimmedPath : trimmedPath.slice(lastSlash + 1)

  return basename === '' ? '>' : `${basename} >`
}

export function getReplPromptWidth(promptText: string): string {
  return `${Math.max(promptText.length, 1)}ch`
}