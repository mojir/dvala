import type { SourceCodeInfo } from './sourceCodeInfo'

export interface CallStackEntry {
  name: string
  sourceCodeInfo?: SourceCodeInfo
}
