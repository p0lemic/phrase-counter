import { describe, expect, test } from 'vitest'
import { buildBeatGrid, buildBeatGridFromBpm, phraseBoundariesSec } from './bpmGrid'

describe('buildBeatGrid', () => {
  test('computes the BPM of a steady sequence of kicks', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    const kickTimesSec = Array.from({ length: 32 }, (_, i) => 0.2 + i * intervalSec)
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + 1

    const grid = buildBeatGrid(kickTimesSec, durationSec)

    expect(grid.bpm).toBeCloseTo(bpm, 0)
  })

  test('stays robust to a couple of missed kicks that double an interval', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    const steadyTimes = Array.from({ length: 20 }, (_, i) => 0.2 + i * intervalSec)
    // Remove two kicks in the middle so their neighbours are 3x the normal interval apart.
    const kickTimesSec = [...steadyTimes.slice(0, 10), ...steadyTimes.slice(12)]
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + 1

    const grid = buildBeatGrid(kickTimesSec, durationSec)

    expect(grid.bpm).toBeCloseTo(bpm, 0)
  })

  test('generates a full grid of kicks spanning the whole track duration', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    const kickTimesSec = Array.from({ length: 32 }, (_, i) => 0.2 + i * intervalSec)
    const durationSec = 20

    const grid = buildBeatGrid(kickTimesSec, durationSec)

    const expectedCount = Math.floor((durationSec - kickTimesSec[0]) / intervalSec) + 1
    expect(grid.kickTimesSec.length).toBe(expectedCount)
    expect(grid.kickTimesSec[0]).toBeCloseTo(kickTimesSec[0], 3)
    expect(grid.kickTimesSec[1]).toBeCloseTo(kickTimesSec[1], 3)
  })

  test('snaps the grid to detected kicks to correct for drift', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    // Every detected kick drifts 8ms later than the ideal grid position.
    const driftSec = 0.008
    const kickTimesSec = Array.from({ length: 16 }, (_, i) => 0.2 + i * intervalSec + i * driftSec)
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + 1

    const grid = buildBeatGrid(kickTimesSec, durationSec)

    for (let i = 0; i < kickTimesSec.length; i++) {
      expect(grid.kickTimesSec[i]).toBeCloseTo(kickTimesSec[i], 3)
    }
  })

  test('interpolates through a gap where kicks were not detected (e.g. a breakdown)', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    const before = Array.from({ length: 8 }, (_, i) => 0.2 + i * intervalSec)
    // Kicks 8-11 are missing (a silent breakdown), detection resumes at kick 12.
    const afterStartIndex = 12
    const after = Array.from({ length: 8 }, (_, i) => 0.2 + (afterStartIndex + i) * intervalSec)
    const kickTimesSec = [...before, ...after]
    const durationSec = kickTimesSec[kickTimesSec.length - 1] + 1

    const grid = buildBeatGrid(kickTimesSec, durationSec)

    // The grid should still contain beat-spaced entries through the gap.
    for (let i = 8; i < afterStartIndex; i++) {
      const expectedTimeSec = 0.2 + i * intervalSec
      expect(grid.kickTimesSec[i]).toBeCloseTo(expectedTimeSec, 1)
    }
    // And it picks back up aligned with the real detected kicks afterwards.
    expect(grid.kickTimesSec[afterStartIndex]).toBeCloseTo(after[0], 1)
  })
})

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

  test('still marks the start of a trailing partial phrase shorter than 32 kicks', () => {
    const kickTimesSec = Array.from({ length: 40 }, (_, i) => i * 0.35)

    const boundaries = phraseBoundariesSec(kickTimesSec)

    expect(boundaries).toEqual([kickTimesSec[0], kickTimesSec[32]])
  })
})
