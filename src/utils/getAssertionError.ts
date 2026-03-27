import { TypeError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { valueToString } from './debug/debugTools'
import { getSourceCodeInfo } from './debug/getSourceCodeInfo'

export function getAssertionError(typeName: string, value: unknown, sourceCodeInfo?: SourceCodeInfo): TypeError {
  return new TypeError(`Expected ${typeName}, got ${valueToString(value)}.`, getSourceCodeInfo(value, sourceCodeInfo))
}
