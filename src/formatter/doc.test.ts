import { describe, expect, it } from 'vitest'
import {
  concat,
  group,
  hardLine,
  ifBreak,
  join,
  line,
  lineComment,
  nest,
  render,
  softLine,
  text,
  trailingComma,
} from './doc'

describe('Doc algebra — render', () => {
  it('renders plain text', () => {
    expect(render(text('hello'))).toBe('hello')
  })

  it('renders concat', () => {
    expect(render(concat(text('a'), text('b'), text('c')))).toBe('abc')
  })

  it('renders hardLine', () => {
    expect(render(concat(text('a'), hardLine, text('b')))).toBe('a\nb')
  })

  it('renders hardLine with indent', () => {
    expect(render(nest(2, concat(text('a'), hardLine, text('b'))))).toBe('a\n  b')
  })

  it('renders group flat when it fits', () => {
    const doc = group(concat(text('['), text('1'), text(', '), text('2'), text(']')))
    expect(render(doc, 80)).toBe('[1, 2]')
  })

  it('renders group broken when it does not fit', () => {
    const doc = group(concat(
      text('['),
      nest(2, concat(line, text('a_long_item'), text(','), line, text('b_long_item'))),
      line,
      text(']'),
    ))
    expect(render(doc, 20)).toBe('[\n  a_long_item,\n  b_long_item\n]')
  })

  it('renders line as space in flat mode', () => {
    const doc = group(concat(text('a'), line, text('b')))
    expect(render(doc, 80)).toBe('a b')
  })

  it('renders line as newline in break mode', () => {
    const doc = group(concat(text('a_very_long_word'), line, text('another_very_long_word')))
    expect(render(doc, 20)).toBe('a_very_long_word\nanother_very_long_word')
  })

  it('renders softLine as nothing in flat mode', () => {
    const doc = group(concat(text('a'), softLine, text('b')))
    expect(render(doc, 80)).toBe('ab')
  })

  it('renders softLine as newline in break mode', () => {
    const doc = group(concat(text('a_very_long_word'), softLine, text('another_very_long_word')))
    expect(render(doc, 20)).toBe('a_very_long_word\nanother_very_long_word')
  })

  it('renders nested indent', () => {
    const doc = nest(4, concat(text('{'), hardLine, text('x'), hardLine, text('}')))
    expect(render(doc)).toBe('{\n    x\n    }')
  })

  it('renders lineComment with forced break', () => {
    const doc = concat(text('x'), text(' '), lineComment('// hello'), text('y'))
    expect(render(doc)).toBe('x // hello\ny')
  })

  it('renders ifBreak — flat path', () => {
    const doc = group(concat(text('['), ifBreak(text('BROKEN'), text('FLAT')), text(']')))
    expect(render(doc, 80)).toBe('[FLAT]')
  })

  it('renders ifBreak — broken path', () => {
    const doc = group(concat(
      text('['),
      ifBreak(text('BROKEN'), text('FLAT')),
      text(' '.repeat(80)),
      text(']'),
    ))
    expect(render(doc, 80)).toBe('[BROKEN' + ' '.repeat(80) + ']')
  })

  it('renders trailingComma in broken group', () => {
    const doc = group(concat(
      text('['),
      nest(2, concat(
        line,
        join(concat(text(','), line), [text('a_long_name'), text('b_long_name')]),
        trailingComma,
      )),
      line,
      text(']'),
    ))
    expect(render(doc, 20)).toBe('[\n  a_long_name,\n  b_long_name,\n]')
  })

  it('omits trailingComma in flat group', () => {
    const doc = group(concat(
      text('['),
      nest(2, concat(
        softLine,
        join(concat(text(','), line), [text('a'), text('b')]),
        trailingComma,
      )),
      softLine,
      text(']'),
    ))
    expect(render(doc, 80)).toBe('[a, b]')
  })

  it('renders join with separator', () => {
    const doc = join(text(', '), [text('a'), text('b'), text('c')])
    expect(render(doc)).toBe('a, b, c')
  })

  it('renders join with zero items', () => {
    expect(render(join(text(', '), []))).toBe('')
  })

  it('renders join with one item', () => {
    expect(render(join(text(', '), [text('x')]))).toBe('x')
  })

  it('formats array-like structure — fits on one line', () => {
    const items = [text('1'), text('2'), text('3')]
    const doc = group(concat(
      text('['),
      nest(2, concat(softLine, join(concat(text(','), line), items))),
      softLine,
      text(']'),
    ))
    expect(render(doc, 80)).toBe('[1, 2, 3]')
  })

  it('formats array-like structure — breaks across lines', () => {
    const items = [text('first_long_element'), text('second_long_element'), text('third_long_element')]
    const doc = group(concat(
      text('['),
      nest(2, concat(softLine, join(concat(text(','), line), items))),
      softLine,
      text(']'),
    ))
    expect(render(doc, 40)).toBe('[\n  first_long_element,\n  second_long_element,\n  third_long_element\n]')
  })

  it('handles deeply nested groups', () => {
    const inner = group(concat(text('('), nest(2, concat(softLine, text('x'))), softLine, text(')')))
    const outer = group(concat(text('f'), inner))
    expect(render(outer, 80)).toBe('f(x)')
  })

  it('hardLine forces enclosing group to break', () => {
    const doc = group(concat(text('a'), hardLine, text('b')))
    expect(render(doc, 80)).toBe('a\nb')
  })

  it('lineComment forces enclosing group to break', () => {
    const doc = group(concat(text('x'), text(' '), lineComment('// note'), text('y')))
    // lineComment doesn't fit flat, so group breaks, but line comments
    // still force a newline regardless
    expect(render(doc, 80)).toBe('x // note\ny')
  })

  it('flattens nested concat in constructor', () => {
    const doc = concat(text('a'), concat(text('b'), text('c')), text('d'))
    expect(render(doc)).toBe('abcd')
  })

  it('filters empty text in concat', () => {
    const doc = concat(text(''), text('a'), text(''), text('b'))
    expect(render(doc)).toBe('ab')
  })
})
