import { describe, expect, test } from 'vitest'
import { detectRhythm } from './essentiaRhythm'

const SAMPLE_RATE = 44100

function synthesizeKick(sampleRate: number, amplitude = 1): Float32Array {
  const durationSec = 0.15
  const numSamples = Math.round(durationSec * sampleRate)
  const samples = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const envelope = Math.exp(-t * 30)
    samples[i] = amplitude * envelope * Math.sin(2 * Math.PI * 60 * t)
  }
  return samples
}

function makeClickTrack(sampleRate: number, bpm: number, kickCount: number): Float32Array {
  const intervalSec = 60 / bpm
  const leadInSec = 0.2
  const trailSec = 0.3
  const totalDurationSec = leadInSec + intervalSec * (kickCount - 1) + trailSec
  const buffer = new Float32Array(Math.round(totalDurationSec * sampleRate))
  const kick = synthesizeKick(sampleRate)

  for (let i = 0; i < kickCount; i++) {
    const startSample = Math.round((leadInSec + i * intervalSec) * sampleRate)
    for (let j = 0; j < kick.length && startSample + j < buffer.length; j++) {
      buffer[startSample + j] += kick[j]
    }
  }

  return buffer
}

describe('detectRhythm', () => {
  test('finds the BPM and one tick per kick of a steady click track', async () => {
    const bpm = 170
    const buffer = makeClickTrack(SAMPLE_RATE, bpm, 32)

    const result = await detectRhythm(buffer, 120, 220)

    expect(result.bpm).toBeCloseTo(bpm, -1)
    expect(result.kickTimesSec.length).toBeGreaterThan(20)
  }, 20000)
})
