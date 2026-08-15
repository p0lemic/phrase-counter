import { describe, expect, test } from 'vitest'
import {
  blockBoundaryTimesSec,
  mergeWithNext,
  shiftBoundary,
  splitInHalf,
  toggleDrop
} from './blockEditing'
import type { Block } from './formatBlocks'

describe('blockBoundaryTimesSec', () => {
  test('returns one start time per block plus the track duration at the end', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isDrop: false },
      { phraseCount: 6, isDrop: true }
    ]
    const phraseTimesSec = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
    const durationSec = 100

    const boundaries = blockBoundaryTimesSec(blocks, phraseTimesSec, durationSec)

    expect(boundaries).toEqual([0, 40, 100])
  })
})

describe('mergeWithNext', () => {
  test('combines phrase counts and ORs the drop flag', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isDrop: false },
      { phraseCount: 6, isDrop: true },
      { phraseCount: 4, isDrop: false }
    ]

    const result = mergeWithNext(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 10, isDrop: true },
      { phraseCount: 4, isDrop: false }
    ])
  })

  test('is a no-op on the last block', () => {
    const blocks: Block[] = [{ phraseCount: 4, isDrop: false }]
    expect(mergeWithNext(blocks, 0)).toEqual(blocks)
  })
})

describe('splitInHalf', () => {
  test('splits an even block into two equal halves, both keeping the drop flag', () => {
    const blocks: Block[] = [{ phraseCount: 6, isDrop: true }]

    const result = splitInHalf(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 3, isDrop: true },
      { phraseCount: 3, isDrop: true }
    ])
  })

  test('rounds down the first half for an odd block', () => {
    const blocks: Block[] = [{ phraseCount: 5, isDrop: false }]

    const result = splitInHalf(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 2, isDrop: false },
      { phraseCount: 3, isDrop: false }
    ])
  })

  test('is a no-op on a 1-phrase block', () => {
    const blocks: Block[] = [{ phraseCount: 1, isDrop: false }]
    expect(splitInHalf(blocks, 0)).toEqual(blocks)
  })
})

describe('toggleDrop', () => {
  test('flips only the targeted block', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false }
    ]

    const result = toggleDrop(blocks, 1)

    expect(result).toEqual([
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: true }
    ])
  })
})

describe('shiftBoundary', () => {
  test('moving the boundary left shrinks the left block and grows the right one', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false }
    ]

    const result = shiftBoundary(blocks, 0, -1)

    expect(result).toEqual([
      { phraseCount: 3, isDrop: false },
      { phraseCount: 5, isDrop: false }
    ])
  })

  test('moving the boundary right grows the left block and shrinks the right one', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false }
    ]

    const result = shiftBoundary(blocks, 0, 1)

    expect(result).toEqual([
      { phraseCount: 5, isDrop: false },
      { phraseCount: 3, isDrop: false }
    ])
  })

  test('refuses to shrink a block down to zero phrases', () => {
    const blocks: Block[] = [
      { phraseCount: 1, isDrop: false },
      { phraseCount: 4, isDrop: false }
    ]

    const result = shiftBoundary(blocks, 0, -1)

    expect(result).toEqual(blocks)
  })
})
