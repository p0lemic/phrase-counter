import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeDecodedAudio, type SongAnalysis } from './analyzeSong'
import { phraseTimesFromEngineGrid } from '../../../shared/phraseGrid'
import type { EngineGrid } from '../../../shared/engine'

const SAMPLE_RATE = 8000
const DURATION_SEC = 40

/** A kick on every beat of a tempo deliberately unlike the grid we pass in, so a result that came
 *  out of our own detection would look nothing like the one Engine asked for. */
function clickTrack(bpm: number, firstBeatSec: number): Float32Array {
  const samples = new Float32Array(SAMPLE_RATE * DURATION_SEC)
  const intervalSec = 60 / bpm

  for (let beat = firstBeatSec; beat < DURATION_SEC - 0.2; beat += intervalSec) {
    const start = Math.round(beat * SAMPLE_RATE)
    for (let i = 0; i < SAMPLE_RATE / 20; i++) {
      // A decaying 60 Hz burst: squarely inside the kick band the energy pass measures.
      samples[start + i] = Math.sin((2 * Math.PI * 60 * i) / SAMPLE_RATE) * Math.exp(-i / 200)
    }
  }
  return samples
}

describe('analyzeDecodedAudio with an Engine grid', () => {
  const grid: EngineGrid = { bpm: 180, beatIntervalSec: 1 / 3, beat0Sec: 0.2, phraseAnchorBeat: 0 }
  let analysis: SongAnalysis

  beforeAll(async () => {
    analysis = await analyzeDecodedAudio(clickTrack(174, 0.5), SAMPLE_RATE, DURATION_SEC, grid)
  })

  it("reports Engine's tempo rather than one detected from the audio", () => {
    expect(analysis.bpm).toBe(180)
  })

  it("lays the phrase lines on Engine's grid", () => {
    expect(analysis.phraseTimesSec).toEqual(phraseTimesFromEngineGrid(grid, DURATION_SEC))
  })

  it('records where the grid came from', () => {
    expect(analysis.gridSource).toBe('engine')
  })

  it('still measures each phrase and groups them into blocks', () => {
    expect(analysis.phraseEnergies).toHaveLength(analysis.phraseTimesSec.length)
    expect(analysis.blocks.length).toBeGreaterThan(0)
  })
})
