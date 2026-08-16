import { describe, expect, test } from 'vitest'
import { bandpassFilter } from './filters'

const SAMPLE_RATE = 44100

function sineWave(sampleRate: number, frequencyHz: number, durationSec: number, amplitude = 1): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * durationSec))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate)
  }
  return samples
}

function rms(samples: Float32Array): number {
  // Skip the filter's brief settling transient at the start.
  const settled = samples.subarray(Math.round(samples.length * 0.1))
  const sumOfSquares = settled.reduce((sum, v) => sum + v * v, 0)
  return Math.sqrt(sumOfSquares / settled.length)
}

describe('bandpassFilter', () => {
  test('passes a tone inside the band through with most of its amplitude intact', () => {
    const tone = sineWave(SAMPLE_RATE, 80, 0.5)

    const filtered = bandpassFilter(tone, SAMPLE_RATE, 40, 150)

    expect(rms(filtered)).toBeGreaterThan(rms(tone) * 0.7)
  })

  test('heavily attenuates a tone well above the band', () => {
    const tone = sineWave(SAMPLE_RATE, 2000, 0.5)

    const filtered = bandpassFilter(tone, SAMPLE_RATE, 40, 150)

    expect(rms(filtered)).toBeLessThan(rms(tone) * 0.1)
  })

  test('heavily attenuates a tone well below the band', () => {
    const tone = sineWave(SAMPLE_RATE, 5, 0.5)

    const filtered = bandpassFilter(tone, SAMPLE_RATE, 40, 150)

    expect(rms(filtered)).toBeLessThan(rms(tone) * 0.1)
  })
})
