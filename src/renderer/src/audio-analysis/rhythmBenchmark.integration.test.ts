import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readEngineLibrary } from '../../../main/engineLibrary'
import { engineDatabasePath } from '../../../main/engineSync'
import { analyzeDecodedAudio } from './analyzeSong'
import type { EngineGrid } from '../../../shared/engine'

/**
 * Measures our own tempo and phase detection — the analysis a track gets when Engine has no grid
 * for it — against the grids Engine DJ analysed, on a fixed sample of real tracks: the yardstick
 * for any change to the detector.
 *
 * Opt in by pointing it at an Engine library (needs ffmpeg on the PATH, which decodes the same way
 * Engine itself does); it is skipped everywhere else:
 *
 *   PHRASE_COUNTER_ENGINE_LIBRARY="$HOME/Music/Engine Library" \
 *   PHRASE_COUNTER_BENCH_N=40 PHRASE_COUNTER_BENCH_OUT=/tmp/bench.json \
 *   npx vitest run src/renderer/src/audio-analysis/rhythmBenchmark.integration.test.ts
 */
const engineLibrary = process.env['PHRASE_COUNTER_ENGINE_LIBRARY']
const sampleSize = Number(process.env['PHRASE_COUNTER_BENCH_N'] ?? 40)
const outputPath = process.env['PHRASE_COUNTER_BENCH_OUT']
const enabled = Boolean(engineLibrary && existsSync(engineDatabasePath(engineLibrary)))

const SAMPLE_RATE = 44100
const BEATS_PER_BAR = 4
/** Tempo agreement this close counts as the same tempo: 0.05 bpm drifts under 40 ms in 5 minutes
 *  at 170 bpm, under the width of a kick. */
const SAME_TEMPO_BPM = 0.05

interface TrackResult {
  path: string
  engineBpm: number
  bpm: number
  bpmError: number
  /** Median distance of our phrase lines from the nearest beat Engine plays to. */
  offBeatMs: number
  /** Share of our phrase lines that sit on one of Engine's downbeats (beat 0 of a bar). */
  onDownbeat: number
  seconds: number
}

/** Stable pseudo-random order, so every run measures the same tracks. */
function sampleOrder(path: string): string {
  return createHash('sha1').update(path).digest('hex')
}

function decodeMono(path: string): Float32Array {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 }
  )
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
}

function beatPosition(timeSec: number, grid: EngineGrid): number {
  return (timeSec - grid.beat0Sec) / grid.beatIntervalSec
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? NaN
}

function measure(phraseTimesSec: number[], grid: EngineGrid): { offBeatMs: number; onDownbeat: number } {
  const offsets: number[] = []
  let downbeats = 0
  for (const time of phraseTimesSec) {
    const beat = beatPosition(time, grid)
    const nearest = Math.round(beat)
    offsets.push(Math.abs(beat - nearest) * grid.beatIntervalSec * 1000)
    if ((((nearest % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0) downbeats++
  }
  return { offBeatMs: median(offsets), onDownbeat: phraseTimesSec.length ? downbeats / phraseTimesSec.length : 0 }
}

function summarise(results: TrackResult[]): Record<string, number> {
  const sameTempo = results.filter((result) => Math.abs(result.bpmError) < SAME_TEMPO_BPM)
  const octave = results.filter((result) => {
    const ratio = result.bpm / result.engineBpm
    return Math.abs(ratio - 2) < 0.02 || Math.abs(ratio - 0.5) < 0.005
  })
  return {
    tracks: results.length,
    sameTempo: sameTempo.length,
    octaveErrors: octave.length,
    medianAbsBpmError: median(results.map((result) => Math.abs(result.bpmError))),
    medianOffBeatMsWhenSameTempo: median(sameTempo.map((result) => result.offBeatMs)),
    onBeatWithin20msWhenSameTempo: sameTempo.filter((result) => result.offBeatMs < 20).length,
    onDownbeatWhenSameTempo: sameTempo.filter((result) => result.onDownbeat > 0.5).length,
    secondsPerTrack: median(results.map((result) => result.seconds))
  }
}

describe.skipIf(!enabled)('our rhythm detection against Engine DJ grids', () => {
  it(
    'reports tempo and phase agreement on a fixed sample of tracks',
    async () => {
      const engine = await readEngineLibrary(engineLibrary!)
      const candidates = Object.entries(engine.grids)
        .filter(([path, grid]) => grid.bpm >= 100 && grid.bpm < 200 && existsSync(path))
        .sort(([a], [b]) => sampleOrder(a).localeCompare(sampleOrder(b)))
        .slice(0, sampleSize)

      const results: TrackResult[] = []
      for (const [path, grid] of candidates) {
        const started = performance.now()
        let samples: Float32Array
        try {
          samples = decodeMono(path)
        } catch {
          continue
        }
        const durationSec = samples.length / SAMPLE_RATE
        const analysis = await analyzeDecodedAudio(samples, SAMPLE_RATE, durationSec)
        const seconds = (performance.now() - started) / 1000

        results.push({
          path,
          engineBpm: grid.bpm,
          bpm: analysis.bpm,
          bpmError: analysis.bpm - grid.bpm,
          ...measure(analysis.phraseTimesSec, grid),
          seconds
        })
      }

      const summary = summarise(results)
      console.log(JSON.stringify(summary, null, 2))
      if (outputPath) writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2))

      expect(results.length).toBeGreaterThan(0)
    },
    6 * 60 * 60 * 1000
  )
})
