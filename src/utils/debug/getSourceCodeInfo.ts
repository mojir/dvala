import type { SourceCodeInfo } from '../../tokenizer/token'

export function getSourceCodeInfo(anyValue: any, sourceCodeInfo: SourceCodeInfo | undefined): SourceCodeInfo | undefined {

  return anyValue?.sourceCodeInfo ?? sourceCodeInfo
}
