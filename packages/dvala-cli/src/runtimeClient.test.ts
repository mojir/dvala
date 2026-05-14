import { describe, expect, it } from 'vitest'

import { createCliRuntimeClient } from './runtimeClient'

describe('createCliRuntimeClient', () => {
  it('routes string runAsync through backend start-session lifecycle', async () => {
    const client = createCliRuntimeClient({
      context: {},
      pure: true,
      modules: [],
      noCheck: true,
    })

    const result = await client.runAsync('41 + 1')

    expect(result).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
      }),
    )
  })

  it('routes resumeSnapshot through backend resume lifecycle', async () => {
    const client = createCliRuntimeClient({
      context: {},
      pure: false,
      modules: [],
      noCheck: true,
    })

    const started = await client.runAsync('let x = perform(@my.ask); x + 1', undefined, [
      {
        pattern: 'my.ask',
        handler: ({ suspend }) => {
          suspend()
        },
      },
    ])

    expect(started.type).toBe('suspended')
    if (started.type !== 'suspended') return

    const resumed = await client.resumeSnapshot(started.snapshot, 41, [
      {
        pattern: 'my.ask',
        handler: ({ resume }) => {
          resume(41)
        },
      },
    ])

    expect(resumed).toEqual(
      expect.objectContaining({
        type: 'completed',
        value: 42,
      }),
    )
  })
})
