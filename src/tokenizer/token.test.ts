import { describe, expect, test } from 'vitest'
import { DvalaError } from '../errors'
import { asA_BinaryOperatorToken, asBasePrefixedNumberToken, asLBraceToken, asLBracketToken, asLParenToken, asNumberToken, asOperatorToken, asRBraceToken, asRBracketToken, asRParenToken, asRegexpShorthandToken, asReservedSymbolToken, asStringToken, asSymbolToken, asWhitespaceToken } from './token'

describe('token', () => {
  describe('guards', () => {
    test('asSymbolToken', () => {
      expect(() => asSymbolToken(['Symbol', 'a'])).not.toThrow()
      expect(() => asSymbolToken(['Foo' as unknown as 'Symbol', 'a'])).toThrow(DvalaError)
    })
    test('asReservedSymbolToken', () => {
      expect(() => asReservedSymbolToken(['ReservedSymbol', 'null'])).not.toThrow()
      expect(() => asReservedSymbolToken(['Number', '1'])).toThrow(DvalaError)
    })
    test('asOperatorToken', () => {
      expect(() => asOperatorToken(['Operator', '*'])).not.toThrow()
      expect(() => asOperatorToken(['Number', '1'])).toThrow(DvalaError)
    })
    test('asWhitespaceToken', () => {
      expect(() => asWhitespaceToken(['Whitespace', ' '])).not.toThrow()
      expect(() => asWhitespaceToken(['Number', '1'])).toThrow(DvalaError)
    })
    test('asNumberToken', () => {
      expect(() => asNumberToken(['Number', '0xff'])).not.toThrow()
      expect(() => asNumberToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asBasePrefixedNumberToken', () => {
      expect(() => asBasePrefixedNumberToken(['BasePrefixedNumber', '0xff'])).not.toThrow()
      expect(() => asBasePrefixedNumberToken(['Whitespace', ' '])).toThrow(DvalaError)
    })

    test('asStringToken', () => {
      expect(() => asStringToken(['string', '"asd"'])).not.toThrow()
      expect(() => asStringToken(['Whitespace', ' '])).toThrow(DvalaError)
    })

    test('asRegexpShorthandToken', () => {
      expect(() => asRegexpShorthandToken(['RegexpShorthand', '#"asd"'])).not.toThrow()
      expect(() => asRegexpShorthandToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asA_BinaryOperatorToken', () => {
      expect(() => asA_BinaryOperatorToken(['Operator', '+'])).not.toThrow()
      expect(() => asA_BinaryOperatorToken(['Operator', '...'])).toThrow(DvalaError)
      expect(() => asA_BinaryOperatorToken(['Whitespace', ' '])).toThrow(DvalaError)
      expect(() => asA_BinaryOperatorToken(undefined)).toThrow(DvalaError)
    })

    test('asLParenToken', () => {
      expect(() => asLParenToken(['LParen', '('])).not.toThrow()
      expect(() => asLParenToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asRParenToken', () => {
      expect(() => asRParenToken(['RParen', ')'])).not.toThrow()
      expect(() => asRParenToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asLBracketToken', () => {
      expect(() => asLBracketToken(['LBracket', '['])).not.toThrow()
      expect(() => asLBracketToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asRBracketToken', () => {
      expect(() => asRBracketToken(['RBracket', ']'])).not.toThrow()
      expect(() => asRBracketToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asLBraceToken', () => {
      expect(() => asLBraceToken(['LBrace', '{'])).not.toThrow()
      expect(() => asLBraceToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
    test('asRBraceToken', () => {
      expect(() => asRBraceToken(['RBrace', '}'])).not.toThrow()
      expect(() => asRBraceToken(['Whitespace', ' '])).toThrow(DvalaError)
    })
  })
})
