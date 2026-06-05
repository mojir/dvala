// Re-exports from @mojir/dvala-engine — the canonical owner of the API
// registry. The `api` const + ApiName type unions are derived from engine's
// actual builtin surface, so engine owns them. This file remains as a stable
// import path for tooling and host-only code (reference/index.ts,
// src/typechecker, …).
export {
  isApiName,
  isCoreApiName,
  categories,
  coreCategoryDescriptions,
  coreCategories,
  isDataType,
} from '@mojir/dvala-engine'
export type {
  CollectionApiName,
  ArrayApiName,
  SequenceApiName,
  MathApiName,
  FunctionalApiName,
  MiscApiName,
  MetaApiName,
  ObjectApiName,
  PredicateApiName,
  RegularExpressionApiName,
  StringApiName,
  BitwiseApiName,
  AssertionApiName,
  CoreNormalExpressionName,
  ModuleExpressionName,
  FunctionName,
  ShorthandName,
  DatatypeName,
  PreludeName,
  CoreApiName,
  ApiName,
} from '@mojir/dvala-engine'
