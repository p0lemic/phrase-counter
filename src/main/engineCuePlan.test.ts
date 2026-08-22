import { describe, expect, it } from 'vitest'
import {
  CUE_COLOR_BLOCK,
  CUE_COLOR_BREAKDOWN,
  CUE_COLOR_DROP,
  planQuickCues
} from './engineCuePlan'
import { QUICK_CUE_COUNT } from './engineCues'
import type { Block } from '../shared/song'

function block(phraseCount: number, isBreakdown = false): Block {
  return { phraseCount, isBreakdown }
}

/** One phrase per second, so a block starting on phrase N starts at N seconds. */
function grid(phrases: number): number[] {
  return Array.from({ length: phrases + 1 }, (_, index) => index)
}

function labels(cues: ReturnType<typeof planQuickCues>): (string | null)[] {
  return cues.map((cue) => cue?.label ?? null)
}

describe('planQuickCues', () => {
  it('always returns exactly the eight slots Engine expects', () => {
    expect(planQuickCues([block(4)], grid(4), 44100)).toHaveLength(QUICK_CUE_COUNT)
    expect(planQuickCues([], [], 44100)).toHaveLength(QUICK_CUE_COUNT)
  })

  it('places one cue per block, labelled with its phrase count', () => {
    const blocks = [block(8), block(16), block(8)]
    const cues = planQuickCues(blocks, grid(32), 44100)
    expect(labels(cues)).toEqual(['8', '16', '8', null, null, null, null, null])
    expect(cues[0]!.positionSamples).toBe(0)
    expect(cues[1]!.positionSamples).toBe(8 * 44100)
    expect(cues[2]!.positionSamples).toBe(24 * 44100)
  })

  it('parenthesises breakdowns and marks the block after the longest one as the drop', () => {
    const blocks = [block(8), block(2, true), block(4), block(6, true), block(8), block(4)]
    const cues = planQuickCues(blocks, grid(32), 44100)
    expect(labels(cues)).toEqual(['8', '(2)', '4', '(6)', 'DROP 8', '4', null, null])
    expect(cues[1]!.colorArgb).toBe(CUE_COLOR_BREAKDOWN)
    expect(cues[4]!.colorArgb).toBe(CUE_COLOR_DROP)
    expect(cues[0]!.colorArgb).toBe(CUE_COLOR_BLOCK)
  })

  it('breaks a tie between equal breakdowns on the later one', () => {
    const blocks = [block(4, true), block(8), block(4, true), block(16)]
    expect(labels(planQuickCues(blocks, grid(32), 44100))).toEqual([
      '(4)', '8', '(4)', 'DROP 16', null, null, null, null
    ])
  })

  it('marks no drop when the track has no breakdown', () => {
    const cues = planQuickCues([block(8), block(8)], grid(16), 44100)
    expect(labels(cues)).toEqual(['8', '8', null, null, null, null, null, null])
    expect(cues.every((cue) => !cue || cue.colorArgb === CUE_COLOR_BLOCK)).toBe(true)
  })

  it('marks no drop when the breakdown runs to the end of the track', () => {
    const cues = planQuickCues([block(8), block(4, true)], grid(12), 44100)
    expect(labels(cues)).toEqual(['8', '(4)', null, null, null, null, null, null])
  })

  it('keeps the drop and the breakdowns when there are more than eight blocks', () => {
    // Twelve blocks: the drop sits at index 9, past where a naive truncation would stop.
    const blocks = [
      block(4), block(4), block(4), block(4), block(4), block(4),
      block(4), block(2, true), block(6, true), block(8), block(4), block(4)
    ]
    const cues = planQuickCues(blocks, grid(52), 44100)
    const kept = labels(cues).filter(Boolean)
    expect(kept).toHaveLength(QUICK_CUE_COUNT)
    expect(kept).toContain('DROP 8')
    expect(kept).toContain('(2)')
    expect(kept).toContain('(6)')
  })

  it('keeps the surviving cues in time order after pruning', () => {
    const blocks = [
      block(4), block(4), block(4), block(4), block(4),
      block(4), block(4), block(2, true), block(8), block(4)
    ]
    const cues = planQuickCues(blocks, grid(42), 44100)
    const positions = cues.filter(Boolean).map((cue) => cue!.positionSamples)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('scales positions by the track sample rate, not a fixed 44.1 kHz', () => {
    const blocks = [block(8), block(8)]
    expect(planQuickCues(blocks, grid(16), 48000)[1]!.positionSamples).toBe(8 * 48000)
    expect(planQuickCues(blocks, grid(16), 22050)[1]!.positionSamples).toBe(8 * 22050)
  })

  it('skips blocks that start past the end of the grid', () => {
    // Three blocks but a grid that only reaches the second one.
    const cues = planQuickCues([block(4), block(4), block(4)], [0, 1, 2, 3, 4], 44100)
    expect(labels(cues)).toEqual(['4', '4', null, null, null, null, null, null])
  })

  it('returns empty slots for an unusable sample rate', () => {
    expect(planQuickCues([block(8)], grid(8), 0).every((cue) => cue === null)).toBe(true)
  })

  it('writes labels that survive the latin1 encoding Engine uses', () => {
    const blocks = [block(8), block(4, true), block(16)]
    for (const cue of planQuickCues(blocks, grid(28), 44100)) {
      if (!cue) continue
      expect(Buffer.from(cue.label, 'latin1').toString('latin1')).toBe(cue.label)
    }
  })
})
