/**
 * Content-addressable hashing for JSON-compatible value trees.
 *
 * Uses FNV-1a (32-bit) for fast, deterministic hashing. The hash is
 * computed bottom-up (Merkle-style): child hashes feed directly into
 * the parent hash as integers, avoiding intermediate string allocation.
 *
 * The hash is returned as a number (the raw 32-bit FNV-1a result).
 */

// FNV-1a constants (32-bit)
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/**
 * Mix a single byte into an FNV-1a hash state.
 */
function fnvMixByte(hash: number, byte: number): number {
  return Math.imul(hash ^ (byte & 0xff), FNV_PRIME)
}

/**
 * Mix a 32-bit integer (4 bytes, little-endian) into an FNV-1a hash state.
 */
function fnvMixInt(hash: number, value: number): number {
  hash = fnvMixByte(hash, value)
  hash = fnvMixByte(hash, value >>> 8)
  hash = fnvMixByte(hash, value >>> 16)
  hash = fnvMixByte(hash, value >>> 24)
  return hash
}

/**
 * Mix a string into an FNV-1a hash state byte-by-byte (charCode).
 */
function fnvMixString(hash: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    hash = fnvMixByte(hash, code)
    hash = fnvMixByte(hash, code >>> 8)
  }
  return hash
}

// Type tags to distinguish different value types in the hash
const TAG_NULL = 0
const TAG_BOOLEAN_TRUE = 1
const TAG_BOOLEAN_FALSE = 2
const TAG_NUMBER = 3
const TAG_STRING = 4
const TAG_ARRAY = 5
const TAG_OBJECT = 6
const TAG_UNDEFINED = 7

/**
 * Compute a deterministic content hash for any JSON-compatible value tree.
 *
 * Properties:
 * - Identical structures produce identical hashes
 * - Object key order does not affect the hash (keys are sorted)
 * - Returns a 32-bit integer (FNV-1a)
 *
 * Supports: null, undefined, boolean, number, string, arrays, plain objects.
 * Does not support: class instances, functions, symbols, bigint, etc.
 */
export function contentHash(value: unknown): number {
  let hash = FNV_OFFSET_BASIS

  if (value === null) {
    hash = fnvMixByte(hash, TAG_NULL)
    return hash >>> 0
  }

  if (value === undefined) {
    hash = fnvMixByte(hash, TAG_UNDEFINED)
    return hash >>> 0
  }

  const type = typeof value

  if (type === 'boolean') {
    hash = fnvMixByte(hash, value ? TAG_BOOLEAN_TRUE : TAG_BOOLEAN_FALSE)
    return hash >>> 0
  }

  if (type === 'number') {
    hash = fnvMixByte(hash, TAG_NUMBER)
    // Use the string representation to handle NaN, Infinity consistently.
    // Special-case -0 since String(-0) === "0".
    hash = fnvMixString(hash, Object.is(value, -0) ? '-0' : String(value))
    return hash >>> 0
  }

  if (type === 'string') {
    hash = fnvMixByte(hash, TAG_STRING)
    hash = fnvMixString(hash, value as string)
    return hash >>> 0
  }

  if (Array.isArray(value)) {
    hash = fnvMixByte(hash, TAG_ARRAY)
    hash = fnvMixInt(hash, value.length)
    for (let i = 0; i < value.length; i++) {
      hash = fnvMixInt(hash, contentHash(value[i]))
    }
    return hash >>> 0
  }

  // Plain object
  hash = fnvMixByte(hash, TAG_OBJECT)
  const keys = Object.keys(value).sort()
  hash = fnvMixInt(hash, keys.length)
  for (const key of keys) {
    hash = fnvMixString(hash, key)
    hash = fnvMixInt(hash, contentHash((value as Record<string, unknown>)[key]))
  }
  return hash >>> 0
}
