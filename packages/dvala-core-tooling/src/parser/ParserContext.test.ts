import { describe, expect, it } from 'vitest'
import { ParserContext } from './ParserContext'
import { tokenize } from '../tokenizer/tokenize'

describe('ParserContext', () => {
  it('setNodeEnd silently returns when the node id has no position entry', () => {
    // Use a debug-mode stream so sourceMap is created, then allocate a node
    // without debug info — it won't be added to positions. setNodeEnd must
    // not throw when it finds no entry for the id.
    const stream = tokenize('let x = 1', true, undefined)
    let id = 0
    const ctx = new ParserContext(stream, () => id++)
    const nodeId = ctx.allocateNodeId(undefined) // no debugInfo → not in positions map
    expect(() => ctx.setNodeEnd(nodeId)).not.toThrow()
  })
})
