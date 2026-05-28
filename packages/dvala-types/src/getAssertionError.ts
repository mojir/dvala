import { TypeError } from './errors'
import type { SourceCodeInfo } from './sourceCodeInfo'
import { valueToString } from './debug'
import { getSourceCodeInfo } from './debug'

export function getAssertionError(typeName: string, value: unknown, sourceCodeInfo?: SourceCodeInfo): TypeError {
  return new TypeError(`Expected ${typeName}, got ${valueToString(value)}.`, getSourceCodeInfo(value, sourceCodeInfo))
}
