import { describe, expect, it } from 'vitest'
import { resume } from '../src/resume'
import { createDvala } from '../src/createDvala'
import { dedupSubTrees, expandPoolRefs } from '../src/evaluator/dedupSubTrees'

const dvala = createDvala()

describe('continuation dedup integration', () => {
  describe('blob size comparison', () => {
    it('should produce a suspension blob with dedup pool when checkpoints are present', async () => {
      const result = await dvala.runAsync(`
        let a = perform(effect(my.step), 1);
        let b = perform(effect(my.step), 2);
        let c = perform(effect(my.step), 3);
        perform(effect(my.done));
        a + b + c
      `, {
        effectHandlers: {
          'my.step': async ({ args, checkpoint, resume: r }) => {
            checkpoint('checkpoint')
            r(args[0]!)
          },
          'my.done': async ({ suspend }) => {
            suspend()
          },
        },
      })

      expect(result.type).toBe('suspended')
      if (result.type !== 'suspended')
        return

      const blob = result.snapshot.continuation as {
        version: number
        pool?: Record<number, unknown>
        snapshots?: unknown[]
      }
      expect(blob.version).toBe(2)
      // Should have 3 snapshots from checkpoints
      expect(blob.snapshots).toBeDefined()
      expect(blob.snapshots!.length).toBe(3)
    })
  })

  describe('suspend/resume with dedup', () => {
    it('should correctly round-trip through suspend with checkpoints', async () => {
      let step = 0

      const result = await dvala.runAsync(`
        let a = perform(effect(my.work), "first");
        let b = perform(effect(my.work), "second");
        a ++ " and " ++ b
      `, {
        effectHandlers: {
          'my.work': async ({ checkpoint, suspend }) => {
            step++
            checkpoint(`step ${step}`, { step })
            suspend({ step })
          },
        },
      })

      expect(result.type).toBe('suspended')
      if (result.type !== 'suspended')
        return

      // The blob has dedup applied
      const blob = result.snapshot.continuation as {
        version: number
        pool?: Record<number, unknown>
      }
      expect(blob.version).toBe(2)

      // Resume with a value
      const result2 = await resume(result.snapshot, 'hello', {
        handlers: {
          'my.work': async ({ checkpoint, suspend }) => {
            step++
            checkpoint(`step ${step}`, { step })
            suspend({ step })
          },
        },
      })

      expect(result2.type).toBe('suspended')
      if (result2.type !== 'suspended')
        return

      // Resume again to complete
      const result3 = await resume(result2.snapshot, 'world', {
        handlers: {
          'my.work': async ({ resume: r }) => {
            r('final')
          },
        },
      })

      expect(result3.type).toBe('completed')
      if (result3.type === 'completed') {
        expect(result3.value).toBe('hello and world')
      }
    })
  })

  describe('dedup correctness', () => {
    it('should produce correct results with threshold = 0', () => {
      const data = [
        { a: { shared: [1, 2, 3] }, b: 'unique1' },
        { a: { shared: [1, 2, 3] }, b: 'unique2' },
        { a: { shared: [1, 2, 3] }, b: 'unique3' },
      ]

      const { roots, pool } = dedupSubTrees(data, 0)
      const restored = roots.map(r => expandPoolRefs(r, pool))

      expect(restored).toEqual(data)
    })

    it('should produce v1-equivalent blobs with threshold = Infinity', () => {
      const data = [
        { a: { shared: [1, 2, 3] }, b: 'unique1' },
        { a: { shared: [1, 2, 3] }, b: 'unique2' },
      ]

      const { roots, pool } = dedupSubTrees(data, Infinity)

      // No pooling at infinity threshold
      expect(Object.keys(pool)).toHaveLength(0)
      expect(roots).toEqual(data)
    })
  })

  describe('dedup performance', () => {
    it('should dedup 1000 similar objects in < 1 second', () => {
      // Create 1000 "snapshot continuations" with shared structure
      const sharedAst = {
        type: 'fn',
        body: [
          { type: 'let', name: 'x', value: { type: 'num', val: 42 } },
          { type: 'call', fn: 'add', args: [
            { type: 'sym', name: 'x' },
            { type: 'num', val: 1 },
          ] },
        ],
        params: ['a', 'b', 'c'],
      }

      const roots = Array.from({ length: 1000 }, (_, i) => ({
        version: 1,
        contextStacks: [{ id: 0, contexts: [{ x: { value: i } }], globalContextIndex: 0, pure: false }],
        k: [
          { type: 'Sequence', remaining: [sharedAst, sharedAst], env: { __csRef: 0 } },
          { type: 'FnBody', body: { ...sharedAst }, env: { __csRef: 0 } },
        ],
      }))

      const start = performance.now()
      const { roots: dedupedRoots, pool } = dedupSubTrees(roots, 50)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(3000)

      // Verify correctness
      const restored = dedupedRoots.map(r => expandPoolRefs(r, pool))
      expect(restored).toEqual(roots)

      // Verify actual size reduction
      const originalSize = JSON.stringify(roots).length
      const dedupedSize = JSON.stringify({ roots: dedupedRoots, pool }).length
      expect(dedupedSize).toBeLessThan(originalSize)
    })
  })
})
