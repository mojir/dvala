import { getCodeMarker } from '../src/utils/debug/getCodeMarker'
import type { CallStackEntry } from './evaluator/callStack'
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
  /** Call stack entries attached when the error propagates out of the evaluator. */
  public callStack?: CallStackEntry[]
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

  /**
   * Attach a call stack to this error and update the message.
   * Called when the error is about to propagate out of the evaluator
   * (not when caught by an algebraic handler).
   */
  public attachCallStack(entries: CallStackEntry[]): void {
    if (entries.length === 0)
      return
    this.callStack = entries
    // Rebuild the full message with the call stack appended
    const stackStr = entries
      .map(entry => {
        const location = entry.sourceCodeInfo
          ? `${entry.sourceCodeInfo.filePath ?? ''}:${entry.sourceCodeInfo.position.line}:${entry.sourceCodeInfo.position.column}`
          : '<unknown>'
        return `  at ${entry.name}  ${location}`
      })
      .join('\n')
    this.message = `${this.message}\n${stackStr}`
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

export class MatchError extends RuntimeError {
  override readonly errorType = 'MatchError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, MatchError.prototype)
    this.name = 'MatchError'
  }
}

export class KeyError extends RuntimeError {
  override readonly errorType = 'KeyError'
  constructor(message: string, sourceCodeInfo?: SourceCodeInfo) {
    super(message, sourceCodeInfo)
    Object.setPrototypeOf(this, KeyError.prototype)
    this.name = 'KeyError'
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isDvalaError(error: unknown): error is DvalaError {
  return error instanceof DvalaError
}
