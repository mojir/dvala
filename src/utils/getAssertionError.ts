import { TypeError } from '@mojir/dvala-types'
import type { SourceCodeInfo } from '@mojir/dvala-types'
import { valueToString } from '@mojir/dvala-types'
import { getSourceCodeInfo } from '@mojir/dvala-types'

export function getAssertionError(typeName: string, value: unknown, sourceCodeInfo?: SourceCodeInfo): TypeError {
  return new TypeError(`Expected ${typeName}, got ${valueToString(value)}.`, getSourceCodeInfo(value, sourceCodeInfo))
}
