/**
 * `true` iff `name` would tokenize as a single user-defined symbol — the
 * JS-style identifier shape Dvala uses: `[a-zA-Z_$][a-zA-Z0-9_$]*`.
 *
 * Used by the formatter (object-key shorthand eligibility), the VS Code
 * extension (rename input validation), and the language-service backend
 * (distinguishing named-function builtins from operator builtins like `+`,
 * `==`, `&&` when emitting inlay hints). Each of those sites previously
 * inlined the same regex; centralising it removes the drift risk if the
 * tokenizer's identifier alphabet changes (e.g. Unicode support).
 *
 * NOT a substitute for the tokenizer's stateful single-character check —
 * the tokenizer uses character-class regexes (`jsIdentifierFirstCharRegExp`,
 * `jsIdentifierCharRegExp`) inside a state machine, which is a different
 * shape from this whole-string predicate.
 */
const IDENTIFIER_NAME_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

export function isDvalaIdentifierName(name: string): boolean {
  return IDENTIFIER_NAME_REGEX.test(name)
}
