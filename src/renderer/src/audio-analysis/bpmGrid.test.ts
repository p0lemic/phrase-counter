import { describe, expect, test } from 'vitest'
import { buildBeatGridFromBpm, phraseBoundariesSec } from './bpmGrid'

describe('buildBeatGridFromBpm', () => {
  test('builds an evenly-spaced grid from a manual BPM and first-kick offset', () => {
    const grid = buildBeatGridFromBpm(180, 0.5, 5)

    expect(grid.bpm).toBe(180)
    expect(grid.kickIntervalSec).toBeCloseTo(60 / 180, 5)
    expect(grid.kickTimesSec[0]).toBe(0.5)
    expect(grid.kickTimesSec[1]).toBeCloseTo(0.5 + 60 / 180, 5)
    expect(grid.kickTimesSec[grid.kickTimesSec.length - 1]).toBeLessThanOrEqual(5)
  })
})

describe('phraseBoundariesSec', () => {
  test('takes every 32nd kick as a phrase boundary', () => {
    const kickTimesSec = Array.from({ length: 96 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0], kickTimesSec[32], kickTimesSec[64]])
  })

  test('omits a trailing partial phrase shorter than 32 kicks, rather than counting it as its own block', () => {
    const kickTimesSec = Array.from({ length: 40 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0]])
  })

  test('omits a trailing partial phrase even when it is nearly a full one', () => {
    const kickTimesSec = Array.from({ length: 63 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0]])
  })

  test('marks a second phrase once a full 32 more kicks are present', () => {
    const kickTimesSec = Array.from({ length: 64 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0], kickTimesSec[32]])
  })

  test('still marks a single block for a clip shorter than one full phrase', () => {
    const kickTimesSec = Array.from({ length: 10 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0]])
  })
})
