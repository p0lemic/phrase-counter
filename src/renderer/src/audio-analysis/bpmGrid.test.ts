import { describe, expect, test } from 'vitest'
import { buildBeatGridFromBpm, buildCorrectedBeatGrid, phraseBoundariesSec } from './bpmGrid'
import { phraseTimesFromEngineGrid } from '../../../shared/phraseGrid'

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

describe('buildCorrectedBeatGrid', () => {
  test('returns an empty grid when no kicks were detected', () => {
    const grid = buildCorrectedBeatGrid(170, [], 10)

    expect(grid.kickTimesSec).toEqual([])
    expect(grid.kickIntervalSec).toBeCloseTo(60 / 170, 5)
  })

  test('matches the real kicks exactly when the estimated BPM is spot on', () => {
    const intervalSec = 60 / 170
    const kickTimesSec = Array.from({ length: 40 }, (_, i) => 0.3 + i * intervalSec)
    // Tight duration: just enough room for the last real kick, no extra trailing extrapolation.
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + intervalSec * 0.5

    const grid = buildCorrectedBeatGrid(170, kickTimesSec, durationSec)

    expect(grid.kickTimesSec.length).toBe(kickTimesSec.length)
    grid.kickTimesSec.forEach((t, i) => expect(t).toBeCloseTo(kickTimesSec[i], 5))
  })

  test('self-corrects instead of compounding drift when the BPM estimate is slightly off', () => {
    // Real tempo is 170.5, but we only ever get a rounded 170 estimate — pure extrapolation from
    // that would drift further off with every beat; re-anchoring to the real kicks should not.
    const realIntervalSec = 60 / 170.5
    const kickTimesSec = Array.from({ length: 100 }, (_, i) => 0.3 + i * realIntervalSec)
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + (60 / 170) * 0.5

    const grid = buildCorrectedBeatGrid(170, kickTimesSec, durationSec)

    // A naive extrapolation from 170 would be off by ~0.5s after 100 beats; corrected stays tight.
    expect(grid.kickTimesSec.length).toBe(kickTimesSec.length)
    const lastDrift = Math.abs(grid.kickTimesSec[grid.kickTimesSec.length - 1] - kickTimesSec[kickTimesSec.length - 1])
    expect(lastDrift).toBeLessThan(0.01)
  })

  test('extrapolates smoothly through a gap with no nearby kicks, then re-syncs after it', () => {
    const intervalSec = 60 / 170
    const before = Array.from({ length: 10 }, (_, i) => 0.3 + i * intervalSec)
    const gapEnd = before[before.length - 1] + 6 * intervalSec // a breakdown-sized gap
    const after = Array.from({ length: 10 }, (_, i) => gapEnd + i * intervalSec)
    const kickTimesSec = [...before, ...after]
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + intervalSec * 0.5

    const grid = buildCorrectedBeatGrid(170, kickTimesSec, durationSec)

    // The gap phrases fall back to pure extrapolation, still evenly spaced.
    const gapPositions = grid.kickTimesSec.filter((t) => t > before[before.length - 1] && t < gapEnd)
    expect(gapPositions.length).toBe(5)
    // It re-locks onto the real kicks once they resume.
    expect(grid.kickTimesSec[grid.kickTimesSec.length - 1]).toBeCloseTo(after[after.length - 1], 5)
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

describe('phraseTimesFromEngineGrid', () => {
  /** 180 BPM: a third of a second per beat, so a 32-beat phrase is a round 10.666… s. */
  const grid = { bpm: 180, beatIntervalSec: 1 / 3, beat0Sec: 0.2, phraseAnchorBeat: 0 }

  test('puts a phrase line every 32 beats from Engine beat 0', () => {
    const times = phraseTimesFromEngineGrid(grid, 40)

    expect(times[0]).toBeCloseTo(0.2, 6)
    expect(times[1]).toBeCloseTo(0.2 + 32 / 3, 6)
    expect(times[2]).toBeCloseTo(0.2 + 64 / 3, 6)
  })

  test('anchors the phrases on the beat the main cue marks', () => {
    const times = phraseTimesFromEngineGrid({ ...grid, phraseAnchorBeat: 4 }, 40)

    expect(times[0]).toBeCloseTo(0.2 + 4 / 3, 6)
    expect(times[1]).toBeCloseTo(0.2 + 36 / 3, 6)
  })

  test('drops a trailing stretch too short to hold a full phrase', () => {
    // Three phrases fit in 32.2 s; the fourth would run past the end of the track.
    const times = phraseTimesFromEngineGrid(grid, 32.2)

    expect(times).toHaveLength(3)
  })

  test('starts at the first phrase that falls inside the track', () => {
    // An anchor 32 beats before the start of the audio: its first phrase line is unplayable.
    const times = phraseTimesFromEngineGrid({ ...grid, phraseAnchorBeat: -32 }, 40)

    expect(times[0]).toBeCloseTo(0.2, 6)
  })

  test('still marks a single phrase on a clip shorter than 32 beats', () => {
    const times = phraseTimesFromEngineGrid(grid, 5)

    expect(times).toEqual([0.2])
  })
})
