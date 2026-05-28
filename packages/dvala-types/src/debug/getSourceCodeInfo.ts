import type { SourceCodeInfo } from '../sourceCodeInfo'

export function getSourceCodeInfo(
  anyValue: any,
  sourceCodeInfo: SourceCodeInfo | undefined,
): SourceCodeInfo | undefined {
  return anyValue?.sourceCodeInfo ?? sourceCodeInfo
}
