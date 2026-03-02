import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../src/Dvala/Dvala'
import { DvalaError } from '../../../src/errors'
import { bitwiseUtilsModule } from '../../../src/builtin/modules/bitwise'

describe('bitwise', () => {
  for (const dvala of [new Dvala(), new Dvala({ debug: true })]) {
    describe('<<', () => {
      it('samples', () => {
        expect(dvala.run('16 << 2')).toBe(64)
        expect(dvala.run('<<(16, 2)')).toBe(64)
        expect(dvala.run('<<(-16, 2)')).toBe(-64)
        expect(() => dvala.run('<<()')).toThrow(DvalaError)
        expect(() => dvala.run('<<(1)')).toThrow(DvalaError)
        expect(() => dvala.run('<<(1, -2)')).toThrow(DvalaError)
      })
    })
    describe('>>', () => {
      it('samples', () => {
        expect(dvala.run('16 >> 2')).toBe(4)
        expect(dvala.run('>>(16, 2)')).toBe(4)
        expect(dvala.run('>>(-16, 2)')).toBe(-4)
        expect(() => dvala.run('>>()')).toThrow(DvalaError)
        expect(() => dvala.run('>>(1)')).toThrow(DvalaError)
        expect(() => dvala.run('>>(1, -2)')).toThrow(DvalaError)
      })
    })
    describe('>>>', () => {
      it('samples', () => {
        expect(dvala.run('16 >>> 2')).toBe(4)
        expect(dvala.run('>>>(16, 2)')).toBe(4)
        expect(dvala.run('>>>(-16, 2)')).toBe(0x3FFFFFFC)
        expect(() => dvala.run('>>>()')).toThrow(DvalaError)
        expect(() => dvala.run('>>>(1)')).toThrow(DvalaError)
        expect(() => dvala.run('>>>(1, -2)')).toThrow(DvalaError)
      })
    })
    describe('&', () => {
      it('samples', () => {
        expect(dvala.run('0b0011 & 0b1010')).toBe(0b0010)
        expect(dvala.run('&(0b0011, 0b1010)')).toBe(0b0010)
        expect(dvala.run('&(0b1111, 0b1010, 0b0101)')).toBe(0b0000)
        expect(dvala.run('&(0b1111, 0b0111, 0b0011)')).toBe(0b0011)
        expect(() => dvala.run('&()')).toThrow(DvalaError)
        expect(() => dvala.run('&(12)')).toThrow(DvalaError)
        expect(() => dvala.run('&(1, 2.1)')).toThrow(DvalaError)
      })
    })
    describe('|', () => {
      it('samples', () => {
        expect(dvala.run('0b0011 | 0b1010')).toBe(0b1011)
        expect(dvala.run('|(0b0011, 0b1010)')).toBe(0b1011)
        expect(dvala.run('|(0b0001, 0b0010, 0b0100)')).toBe(0b0111)
        expect(dvala.run('|(0b0001, 0b0010, 0b1111)')).toBe(0b1111)
        expect(() => dvala.run('|()')).toThrow(DvalaError)
        expect(() => dvala.run('|(12)')).toThrow(DvalaError)
        expect(() => dvala.run('|(1, 2.1)')).toThrow(DvalaError)
      })
    })
    describe('xor', () => {
      it('samples', () => {
        expect(dvala.run('0b0011 xor 0b1010')).toBe(0b1001)
        expect(dvala.run('xor(0b0011, 0b1010)')).toBe(0b1001)
        expect(dvala.run('xor(0b11110000, 0b00111100, 0b10101010)')).toBe(0b01100110)
        expect(() => dvala.run('xor()')).toThrow(DvalaError)
        expect(() => dvala.run('xor(1)')).toThrow(DvalaError)
      })
    })
  }

  for (const dvala of [new Dvala({ modules: [bitwiseUtilsModule] }), new Dvala({ modules: [bitwiseUtilsModule], debug: true })]) {
    describe('bit-not', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-not } = import(bitwise); bit-not(0)')).toBe(-1)
        expect(dvala.run('let { bit-not } = import(bitwise); bit-not(255)')).toBe(-256)
        expect(dvala.run('let { bit-not } = import(bitwise); bit-not(0b1111)')).toBe(~Number('0b1111'))
        expect(dvala.run('let { bit-not } = import(bitwise); bit-not(0xffff)')).toBe(~Number('0xffff'))
        expect(() => dvala.run('let { bit-not } = import(bitwise); bit-not()')).toThrow(DvalaError)
        expect(() => dvala.run('let { bit-not } = import(bitwise); bit-not(1, 2)')).toThrow(DvalaError)
      })
    })
    describe('bit-and-not', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-and-not } = import(bitwise); bit-and-not(0b1100, 0b1001)')).toBe(0b0100)
        expect(dvala.run('let { bit-and-not } = import(bitwise); bit-and-not(0b1111, 0b1010, 0b1010)')).toBe(0b0101)
        expect(dvala.run('let { bit-and-not } = import(bitwise); bit-and-not(0b1111, 0b0111, 0b0011)')).toBe(0b1000)
        expect(() => dvala.run('let { bit-and-not } = import(bitwise); bit-and-not()')).toThrow(DvalaError)
        expect(() => dvala.run('let { bit-and-not } = import(bitwise); bit-and-not(12)')).toThrow(DvalaError)
        expect(() => dvala.run('let { bit-and-not } = import(bitwise); bit-and-not(1, 2.1)')).toThrow(DvalaError)
      })
    })
    describe('bit-clear', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-clear } = import(bitwise); 0b1111 bit-clear 2')).toBe(0b1011)
        expect(dvala.run('let { bit-clear } = import(bitwise); bit-clear(0b1111, 2)')).toBe(0b1011)
        expect(dvala.run('let { bit-clear } = import(bitwise); bit-clear(0b1111, 5)')).toBe(0b1111)
      })
    })
    describe('bit-flip', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-flip } = import(bitwise); 0b1111 bit-flip 2')).toBe(0b1011)
        expect(dvala.run('let { bit-flip } = import(bitwise); bit-flip(0b1111, 2)')).toBe(0b1011)
        expect(dvala.run('let { bit-flip } = import(bitwise); bit-flip(0, 2)')).toBe(0b100)
      })
    })
    describe('bit-set', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-set } = import(bitwise); 0b1001 bit-set 2')).toBe(0b1101)
        expect(dvala.run('let { bit-set } = import(bitwise); bit-set(0b1001, 2)')).toBe(0b1101)
        expect(dvala.run('let { bit-set } = import(bitwise); bit-set(0, 2)')).toBe(0b100)
      })
    })
    describe('bit-test', () => {
      it('samples', () => {
        expect(dvala.run('let { bit-test } = import(bitwise); 0b1001 bit-test 2')).toBe(false)
        expect(dvala.run('let { bit-test } = import(bitwise); 0b1111 bit-test 2')).toBe(true)
        expect(dvala.run('let { bit-test } = import(bitwise); bit-test(0b1001, 2)')).toBe(false)
        expect(dvala.run('let { bit-test } = import(bitwise); bit-test(0b1111, 2)')).toBe(true)
      })
    })
  }
})
