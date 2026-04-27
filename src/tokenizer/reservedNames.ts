import type { Any } from '../interface'

const nonNumberReservedSymbolRecord = {
  true: true,
  false: false,
  null: null,
  do: null,
  else: null,
  case: null,
  in: null,
  when: null,
  while: null,
  as: null,
  then: null,
  end: null,
  with: null,
  quote: null,
  _: null,
} as const satisfies Record<string, Any>

const phi = (1 + Math.sqrt(5)) / 2
export const numberReservedSymbolRecord = {
  E: Math.E,
  PI: Math.PI,
  PHI: phi,
  MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
  MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
  MAX_VALUE: Number.MAX_VALUE,
  MIN_VALUE: Number.MIN_VALUE,
} as const satisfies Record<string, number>

export const reservedSymbolRecord = {
  ...nonNumberReservedSymbolRecord,
  ...numberReservedSymbolRecord,
} as const

export type ReservedSymbol = keyof typeof reservedSymbolRecord

export function isReservedSymbol(symbol: string): symbol is keyof typeof reservedSymbolRecord {
  return symbol in reservedSymbolRecord
}

export function isNumberReservedSymbol(symbol: string): symbol is keyof typeof numberReservedSymbolRecord {
  return symbol in numberReservedSymbolRecord
}
