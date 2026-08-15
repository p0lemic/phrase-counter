import { describe, expect, test } from 'vitest'
import { markBreakdowns } from './breakdownDetection'

describe('markBreakdowns', () => {
  test('marks every block as breakdown when no block ever has a kick-level energy peak', () => {
    const blocks = [{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 4 }]
    const energies = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

    const result = markBreakdowns(blocks, energies)

    expect(result.map((b) => b.isBreakdown)).toEqual([true, true, true])
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
