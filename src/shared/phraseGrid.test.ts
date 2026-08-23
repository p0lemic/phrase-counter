import { describe, expect, it } from 'vitest'
import { phraseTimesFromEngineGrid, phraseTimesFromPhase } from './phraseGrid'
import type { EngineGrid } from './engine'

const BPM = 170
const BEAT = 60 / BPM
const PHRASE = 32 * BEAT

const grid = (phraseAnchorBeat: number, beat0Sec = 0): EngineGrid => ({
  bpm: BPM,
  beatIntervalSec: BEAT,
  beat0Sec,
  phraseAnchorBeat
})

describe('phraseTimesFromEngineGrid', () => {
  it('lays the lines out every 32 beats from Engine beat 0 when nothing anchors them', () => {
    const times = phraseTimesFromEngineGrid(grid(0), PHRASE * 3)

    expect(times).toEqual([0, PHRASE, PHRASE * 2])
  })

  it('takes the phase from the anchor beat, not just the start', () => {
    const times = phraseTimesFromEngineGrid(grid(4), PHRASE * 2 + 4 * BEAT)

    expect(times[0]).toBeCloseTo(4 * BEAT, 9)
    expect(times[1]).toBeCloseTo(4 * BEAT + PHRASE, 9)
  })

  it('covers the track from its start when the anchor sits deep into the song', () => {
    // A main cue on the drop is the natural place for a DJ to put one. The phrase it marks has to
    // set the phase of the whole grid, not amputate everything before it.
    const anchorBeat = 32 * 12 + 4
    const times = phraseTimesFromEngineGrid(grid(anchorBeat), PHRASE * 14)

    expect(times[0]).toBeCloseTo(4 * BEAT, 9)
    expect(times).toContain(times.find((t) => Math.abs(t - anchorBeat * BEAT) < 1e-9))
    expect(times.length).toBe(13)
  })

  it('never places a line before the audio starts', () => {
    const times = phraseTimesFromEngineGrid(grid(4, -1), PHRASE * 3)

    expect(times[0]).toBeGreaterThanOrEqual(0)
  })

  it('gives a clip shorter than one phrase a single line at the anchor', () => {
    const times = phraseTimesFromEngineGrid(grid(0), PHRASE / 2)

    expect(times).toEqual([0])
  })
})

describe('phraseTimesFromPhase', () => {
  it('re-lays the grid a bar later without losing the end of the track', () => {
    const durationSec = PHRASE * 4
    const before = phraseTimesFromPhase(0, BEAT, durationSec)
    const after = phraseTimesFromPhase(before[0] + 4 * BEAT, BEAT, durationSec)

    expect(before.length).toBe(4)
    expect(after[0]).toBeCloseTo(4 * BEAT, 9)
    // The last line no longer has a full phrase after it, so the grid is one line shorter.
    expect(after.length).toBe(3)
  })

  it('re-lays the grid a bar earlier by filling the gap it opens at the start', () => {
    const durationSec = PHRASE * 4
    const after = phraseTimesFromPhase(4 * BEAT - 4 * BEAT, BEAT, durationSec)

    expect(after[0]).toBeCloseTo(0, 9)
    expect(after.length).toBe(4)
  })
})
