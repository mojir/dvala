import type { SourceCodeInfo } from '@mojir/dvala-types'

export function getSourceCodeInfo(
  anyValue: any,
  sourceCodeInfo: SourceCodeInfo | undefined,
): SourceCodeInfo | undefined {
  return anyValue?.sourceCodeInfo ?? sourceCodeInfo
}
