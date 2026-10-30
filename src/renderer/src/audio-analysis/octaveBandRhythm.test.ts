import { describe, expect, it } from 'vitest'
import { detectOctaveBandGrid, foldTempo, octaveBandOnsets, snapTempo } from './octaveBandRhythm'

const SAMPLE_RATE = 44100

/** A dance track reduced to its skeleton: a 55 Hz kick on every beat and a short noise hat on
 *  every off-beat, starting `firstBeatSec` in. Deterministic noise keeps the tests repeatable. */
function kickTrack(bpm: number, firstBeatSec: number, durationSec: number): Float32Array {
  const samples = new Float32Array(Math.round(durationSec * SAMPLE_RATE))
  const beatSec = 60 / bpm
  let seed = 1
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 1073741824 - 1
  }

  for (let beat = 0; firstBeatSec + beat * beatSec < durationSec; beat++) {
    const kickStart = Math.round((firstBeatSec + beat * beatSec) * SAMPLE_RATE)
    for (let i = 0; i < 0.15 * SAMPLE_RATE && kickStart + i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      samples[kickStart + i] += 0.8 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t / 0.05)
    }
    const hatStart = Math.round((firstBeatSec + (beat + 0.5) * beatSec) * SAMPLE_RATE)
    for (let i = 0; i < 0.03 * SAMPLE_RATE && hatStart + i < samples.length; i++) {
      samples[hatStart + i] += 0.2 * noise() * Math.exp(-i / SAMPLE_RATE / 0.01)
    }
  }
  return samples
}

/** Distance between two times on a circle of `periodSec`, so 0.01 and period-0.01 are 20 ms apart. */
function circularDistanceSec(a: number, b: number, periodSec: number): number {
  const d = (((a - b) % periodSec) + periodSec) % periodSec
  return Math.min(d, periodSec - d)
}

describe('snapTempo', () => {
  it('takes the whole number when the estimate sits within 0.02 bpm of it', () => {
    expect(snapTempo(169.985)).toBe(170)
    expect(snapTempo(170.019)).toBe(170)
  })

  it('keeps a tempo that is genuinely between whole numbers', () => {
    expect(snapTempo(165.063)).toBeCloseTo(165.063, 6)
    expect(snapTempo(169.97)).toBeCloseTo(169.97, 6)
  })
})

describe('foldTempo', () => {
  it('doubles or halves into [min, 2·min)', () => {
    expect(foldTempo(85, 100)).toBe(170)
    expect(foldTempo(220, 100)).toBe(110)
    expect(foldTempo(170, 100)).toBe(170)
    expect(foldTempo(200, 100)).toBe(100)
  })
})

describe('octaveBandOnsets', () => {
  it('finds one low-band onset per kick, right where it starts', () => {
    const samples = kickTrack(120, 1, 10)
    const { onsets } = octaveBandOnsets(samples, SAMPLE_RATE)
    // The 32.5 and 65 Hz bands both carry a 55 Hz kick.
    const low = onsets.filter((onset) => onset.band === 1)
    expect(low.length).toBeGreaterThanOrEqual(17)
    expect(low.length).toBeLessThanOrEqual(19)
    for (const onset of low) {
      expect(circularDistanceSec(onset.positionSamples / SAMPLE_RATE, 1, 0.5)).toBeLessThan(0.01)
    }
  })
})

describe('detectOctaveBandGrid', () => {
  it('lands a whole-number tempo exactly, with beat 0 on the first kick', () => {
    const grid = detectOctaveBandGrid(kickTrack(172, 0.731, 100), SAMPLE_RATE)!
    expect(grid.bpm).toBe(172)
    expect(grid.beatIntervalSec).toBeCloseTo(60 / 172, 9)
    // Beat 0 is the first downbeat at or after the start: the first kick, mod one bar.
    expect(circularDistanceSec(grid.beat0Sec, 0.731, 4 * grid.beatIntervalSec)).toBeLessThan(0.005)
    expect(grid.beat0Sec).toBeGreaterThanOrEqual(0)
    expect(grid.beat0Sec).toBeLessThan(4 * grid.beatIntervalSec)
    expect(grid.phraseAnchorBeat).toBe(0)
  })

  it('counts the bars from the first kick, not from a stray noise before it', () => {
    const samples = kickTrack(172, 1, 100)
    // A click off the beat grid, well before the music starts.
    const clickStart = Math.round(0.2 * SAMPLE_RATE)
    for (let i = 0; i < 0.01 * SAMPLE_RATE; i++) samples[clickStart + i] += 0.5 * Math.exp(-i / 50) * (i % 2 ? 1 : -1)

    const grid = detectOctaveBandGrid(samples, SAMPLE_RATE)!
    expect(circularDistanceSec(grid.beat0Sec, 1, 4 * grid.beatIntervalSec)).toBeLessThan(0.005)
  })

  it('keeps a tempo between whole numbers instead of rounding it away', () => {
    const grid = detectOctaveBandGrid(kickTrack(165.063, 0.2, 120), SAMPLE_RATE)!
    expect(grid.bpm).toBeCloseTo(165.063, 2)
    expect(Number.isInteger(grid.bpm)).toBe(false)
  })

  it('reads a fast track at its own tempo, not half of it', () => {
    const grid = detectOctaveBandGrid(kickTrack(180, 0.1, 90), SAMPLE_RATE)!
    expect(grid.bpm).toBe(180)
  })

  it('stays on the kicks to the end of a long track', () => {
    const grid = detectOctaveBandGrid(kickTrack(170, 0.5, 300), SAMPLE_RATE)!
    const lastKickSec = 0.5 + Math.floor((300 - 0.5) / (60 / 170) - 1) * (60 / 170)
    expect(circularDistanceSec(lastKickSec, grid.beat0Sec, grid.beatIntervalSec)).toBeLessThan(0.005)
  })

  it('returns null for silence', () => {
    expect(detectOctaveBandGrid(new Float32Array(SAMPLE_RATE * 10), SAMPLE_RATE)).toBeNull()
  })
})
