import { describe, expect, test } from 'vitest'
import { markBreakdowns } from './breakdownDetection'

describe('markBreakdowns', () => {
  test('marks nothing as breakdown on a track that never drops its energy', () => {
    // Nothing here is quiet relative to anything else, so nothing is a breakdown. Calling the whole
    // track one long breakdown (which the old previous-block rule did) says nothing about the music.
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const energies = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

    const result = markBreakdowns(blocks, energies)

    expect(result.map((b) => b.isBreakdown)).toEqual([false, false, false])
  })

  test('keeps a loud block that follows another loud block out of the breakdowns', () => {
    // The shape that made 62% of a real 105-track library come back marked as breakdown: a track is
    // mostly full-power, and a kick section only ever "earns" its mark by following a quiet one.
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const quiet = [0.16, 0.16, 0.16, 0.16]
    const loud = [0.37, 0.37, 0.37, 0.37]
    const energies = [...loud, ...loud, ...quiet, ...loud]

    const result = markBreakdowns(blocks, energies)

    expect(result.map((b) => b.isBreakdown)).toEqual([false, false, true, false])
  })

  test('marks a block that is quiet next to the track, not just next to its neighbour', () => {
    // A gentle taper from one loud section into the next is not a breakdown, however the blocks fall.
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const energies = [0.9, 0.9, 0.9, 0.9, 0.75, 0.75, 0.75, 0.75, 0.85, 0.85, 0.85, 0.85]

    const result = markBreakdowns(blocks, energies)

    expect(result.map((b) => b.isBreakdown)).toEqual([false, false, false])
  })

  test('marks the quiet blocks as breakdown around the one block whose energy shows the kick', () => {
    // 4+(4)+6+(4) shape: quiet, quiet, LOUD (has kick), quiet
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 6 }, { phraseCount: 4 }]
    const quiet = [0.2, 0.2, 0.2, 0.2]
    const loud = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]
    const energies = [...quiet, ...quiet, ...loud, ...quiet]

    const result = markBreakdowns(blocks, energies)

    expect(result).toEqual([
      { phraseCount: 4, isBreakdown: true },
      { phraseCount: 4, isBreakdown: true },
      { phraseCount: 6, isBreakdown: false },
      { phraseCount: 4, isBreakdown: true }
    ])
  })

  test('marks the quiet blocks as breakdown around two separate kick sections', () => {
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const quiet = [0.2, 0.2, 0.2, 0.2]
    const loud = [0.9, 0.9, 0.9, 0.9]
    const energies = [...quiet, ...loud, ...quiet, ...loud, ...quiet]

    const result = markBreakdowns(blocks, energies)

    expect(result.map((b) => b.isBreakdown)).toEqual([true, false, true, false, true])
  })
})
