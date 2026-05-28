import type { SourceCodeInfo } from './sourceCodeInfo'

export interface CallStackEntry {
  name: string // function name, handler effect name, or "<anonymous>"
  sourceCodeInfo?: SourceCodeInfo
}
