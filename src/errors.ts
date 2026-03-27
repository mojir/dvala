import { getCodeMarker } from '../src/utils/debug/getCodeMarker'
import type { Arr } from './interface'
import type { SourceCodeInfo } from './tokenizer/token'

function getDvalaErrorMessage(message: string, sourceCodeInfo?: SourceCodeInfo) {
  if (!sourceCodeInfo) {
    return message
  }
  const location = `${sourceCodeInfo.position.line}:${sourceCodeInfo.position.column}`
  const filePathLine = sourceCodeInfo.filePath
    ? `\n${sourceCodeInfo.filePath}:${location}`
    : `\nLocation ${location}`
  const codeLine = `\n${sourceCodeInfo.code}`
  const codeMarker = `\n${getCodeMarker(sourceCodeInfo)}`
  return `${message}${filePathLine}${codeLine}${codeMarker}`
}

export class RecurSignal extends Error {
  public params: Arr
  constructor(params: Arr) {
    super(`recur, params: ${params}`)
    Object.setPrototypeOf(this, RecurSignal.prototype)
    this.name = 'RecurSignal'
    this.params = params
  }
}

// ---------------------------------------------------------------------------
// Base error class
// ---------------------------------------------------------------------------

export class DvalaError extends Error {
  public readonly sourceCodeInfo?: SourceCodeInfo
  public readonly shortMessage: string
  /** Machine-readable error category for the structured @dvala.error payload. */
  readonly errorType: string = 'RuntimeError'
  constructor(err: unknown, sourceCodeInfo: SourceCodeInfo | undefined) {
    const message = err instanceof Error
      ? err.message
      : `${err}`

    super(getDvalaErrorMessage(message, sourceCodeInfo))
    this.shortMessage = message
    this.sourceCodeInfo = sourceCodeInfo
    Object.setPrototypeOf(this, DvalaError.prototype)
    this.name = 'DvalaError'
  }

  public getCodeMarker(): string | undefined {
    return this.sourceCodeInfo && getCodeMarker(this.sourceCodeInfo)
  }

  public toJSON(): DvalaErrorJSON {
    return {
      name: this.name,
      message: this.message,
      shortMessage: this.shortMessage,
      line: this.sourceCodeInfo?.position.line,
      column: this.sourceCodeInfo?.position.column,
      code: this.sourceCodeInfo?.code,
      filePath: this.sourceCodeInfo?.filePath,
    }
  }
}

export interface DvalaErrorJSON {
  name: string
  message: string
  shortMessage: string
  line?: number
  column?: number
  code?: string
  filePath?: string
}

// ---------------------------------------------------------------------------
// Pre-runtime errors (never go through @dvala.error)
// ---------------------------------------------------------------------------

export class TokenizerError extends DvalaError {
  override readonly errorType = 'TokenizerError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, TokenizerError.prototype)
    this.name = 'TokenizerError'
  }
}

export class ParseError extends DvalaError {
  override readonly errorType = 'ParseError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, ParseError.prototype)
    this.name = 'ParseError'
  }
}

// ---------------------------------------------------------------------------
// Runtime errors (routed through @dvala.error when handlers exist)
// ---------------------------------------------------------------------------

export class RuntimeError extends DvalaError {
  override readonly errorType: string = 'RuntimeError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, RuntimeError.prototype)
    this.name = 'RuntimeError'
  }
}

export class TypeError extends RuntimeError {
  override readonly errorType = 'TypeError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, TypeError.prototype)
    this.name = 'TypeError'
  }
}

export class ReferenceError extends RuntimeError {
  override readonly errorType = 'ReferenceError'
  public readonly symbol: string
  constructor(symbolName: string, sourceCodeInfo?: SourceCodeInfo) {
    super(`Undefined symbol '${symbolName}'.`, sourceCodeInfo)
    this.symbol = symbolName
    Object.setPrototypeOf(this, ReferenceError.prototype)
    this.name = 'ReferenceError'
  }
}

export class AssertionError extends RuntimeError {
  override readonly errorType = 'AssertionError'
  constructor(message: string | Error, sourceCodeInfo?: SourceCodeInfo) {
    super(message instanceof Error ? message.message : message, sourceCodeInfo)
    Object.setPrototypeOf(this, AssertionError.prototype)
    this.name = 'AssertionError'
  }
}

export class ArithmeticError extends RuntimeError {
  override readonly errorType = 'ArithmeticError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, ArithmeticError.prototype)
    this.name = 'ArithmeticError'
  }
}

export class MacroError extends RuntimeError {
  override readonly errorType = 'MacroError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, MacroError.prototype)
    this.name = 'MacroError'
  }
}

export class UserError extends RuntimeError {
  override readonly errorType = 'UserError'
  public readonly userMessage: string
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    this.userMessage = message
    Object.setPrototypeOf(this, UserError.prototype)
    this.name = 'UserError'
  }
}

// ---------------------------------------------------------------------------
// Backward compatibility aliases (to remove after full migration)
// ---------------------------------------------------------------------------

/** @deprecated Use UserError instead */
export type UserDefinedError = UserError
/** @deprecated Use UserError instead */
export const UserDefinedError = UserError
/** @deprecated Use ReferenceError instead */
export type UndefinedSymbolError = ReferenceError
/** @deprecated Use ReferenceError instead */
export const UndefinedSymbolError = ReferenceError

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isDvalaError(error: unknown): error is DvalaError {
  return error instanceof DvalaError
}
