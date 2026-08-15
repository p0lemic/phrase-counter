import { describe, expect, test } from 'vitest'
import {
  blockBoundaryTimesSec,
  mergeWithNext,
  shiftBoundary,
  splitInHalf,
  toggleBreakdown
} from './blockEditing'
import type { Block } from './formatBlocks'

describe('blockBoundaryTimesSec', () => {
  test('returns one start time per block plus the track duration at the end', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 6, isBreakdown: true }
    ]
    const phraseTimesSec = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
    const durationSec = 100

    const boundaries = blockBoundaryTimesSec(blocks, phraseTimesSec, durationSec)

    expect(boundaries).toEqual([0, 40, 100])
  })
})

describe('mergeWithNext', () => {
  test('combines phrase counts and ORs the breakdown flag', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 6, isBreakdown: true },
      { phraseCount: 4, isBreakdown: false }
    ]

    const result = mergeWithNext(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 10, isBreakdown: true },
      { phraseCount: 4, isBreakdown: false }
    ])
  })

  test('is a no-op on the last block', () => {
    const blocks: Block[] = [{ phraseCount: 4, isBreakdown: false }]
    expect(mergeWithNext(blocks, 0)).toEqual(blocks)
  })
})

describe('splitInHalf', () => {
  test('splits an even block into two equal halves, both keeping the breakdown flag', () => {
    const blocks: Block[] = [{ phraseCount: 6, isBreakdown: true }]

    const result = splitInHalf(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 3, isBreakdown: true },
      { phraseCount: 3, isBreakdown: true }
    ])
  })

  test('rounds down the first half for an odd block', () => {
    const blocks: Block[] = [{ phraseCount: 5, isBreakdown: false }]

    const result = splitInHalf(blocks, 0)

    expect(result).toEqual([
      { phraseCount: 2, isBreakdown: false },
      { phraseCount: 3, isBreakdown: false }
    ])
  })

  test('is a no-op on a 1-phrase block', () => {
    const blocks: Block[] = [{ phraseCount: 1, isBreakdown: false }]
    expect(splitInHalf(blocks, 0)).toEqual(blocks)
  })
})

describe('toggleBreakdown', () => {
  test('flips only the targeted block', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false }
    ]

    const result = toggleBreakdown(blocks, 1)

    expect(result).toEqual([
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: true }
    ])
  })
})

describe('shiftBoundary', () => {
  test('moving the boundary left shrinks the left block and grows the right one', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false }
    ]

    const result = shiftBoundary(blocks, 0, -1)

    expect(result).toEqual([
      { phraseCount: 3, isBreakdown: false },
      { phraseCount: 5, isBreakdown: false }
    ])
  })

  test('moving the boundary right grows the left block and shrinks the right one', () => {
    const blocks: Block[] = [
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false }
    ]

    const result = shiftBoundary(blocks, 0, 1)

    expect(result).toEqual([
      { phraseCount: 5, isBreakdown: false },
      { phraseCount: 3, isBreakdown: false }
    ])
  })

  test('refuses to shrink a block down to zero phrases', () => {
    const blocks: Block[] = [
      { phraseCount: 1, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false }
    ]

    const result = shiftBoundary(blocks, 0, -1)

    expect(result).toEqual(blocks)
  })
})
