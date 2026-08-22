import { describe, expect, it, vi } from 'vitest'
import { runConcurrently } from './runConcurrently'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('runConcurrently', () => {
  it('processes every item', async () => {
    const seen: number[] = []
    await runConcurrently([1, 2, 3, 4], 2, async (item) => {
      seen.push(item)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4])
  })

  it('never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    await runConcurrently(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      running++
      peak = Math.max(peak, running)
      await Promise.resolve()
      running--
    })
    expect(peak).toBe(3)
  })

  it('passes each item its index', async () => {
    const pairs: [string, number][] = []
    await runConcurrently(['a', 'b'], 1, async (item, index) => {
      pairs.push([item, index])
    })
    expect(pairs).toEqual([
      ['a', 0],
      ['b', 1]
    ])
  })

  it('stops picking up new items once cancelled', async () => {
    const gate = deferred()
    const started: number[] = []
    let cancelled = false

    const run = runConcurrently(
      [1, 2, 3, 4, 5, 6],
      2,
      async (item) => {
        started.push(item)
        await gate.promise
      },
      () => cancelled
    )

    cancelled = true
    gate.resolve()
    await run

    // The two already in flight finish; nothing new is picked up.
    expect(started).toEqual([1, 2])
  })

  it('keeps going when one item throws', async () => {
    const done: number[] = []
    await runConcurrently([1, 2, 3], 1, async (item) => {
      if (item === 2) throw new Error('boom')
      done.push(item)
    })
    expect(done).toEqual([1, 3])
  })

  it('resolves immediately for an empty list', async () => {
    const worker = vi.fn()
    await runConcurrently([], 4, worker)
    expect(worker).not.toHaveBeenCalled()
  })

  it('copes with a limit larger than the number of items', async () => {
    const seen: number[] = []
    await runConcurrently([1, 2], 10, async (item) => {
      seen.push(item)
    })
    expect(seen.sort()).toEqual([1, 2])
  })
})
