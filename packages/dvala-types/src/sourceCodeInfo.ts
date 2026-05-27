export interface SourceCodeInfo {
  position: {
    line: number
    column: number
  }
  code: string
  filePath?: string
}
