import { describe, expect, test } from 'vitest'
import { markDrops } from './dropDetection'

describe('markDrops', () => {
  test('marks no drop when energy is uniform across blocks', () => {
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const energies = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

    const result = markDrops(blocks, energies)

    expect(result.map((b) => b.isDrop)).toEqual([false, false, false])
  })

  test('marks the one block whose energy towers over its neighbour and the track average', () => {
    // 4+4+(6)+4 shape: quiet, quiet, LOUD, quiet
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 6 }, { phraseCount: 4 }]
    const quiet = [0.2, 0.2, 0.2, 0.2]
    const loud = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]
    const energies = [...quiet, ...quiet, ...loud, ...quiet]

    const result = markDrops(blocks, energies)

    expect(result).toEqual([
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false },
      { phraseCount: 6, isDrop: true },
      { phraseCount: 4, isDrop: false }
    ])
  })

  test('marks two separate drops in a track with a double-drop structure', () => {
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const quiet = [0.2, 0.2, 0.2, 0.2]
    const loud = [0.9, 0.9, 0.9, 0.9]
    const energies = [...quiet, ...loud, ...quiet, ...loud, ...quiet]

    const result = markDrops(blocks, energies)

    expect(result.map((b) => b.isDrop)).toEqual([false, true, false, true, false])
  })
})
