import { describe, expect, test } from 'vitest'
import { detectKicks } from './kickDetection'

const SAMPLE_RATE = 44100

/** A single kick-drum-like thump: a decaying low-frequency sine burst. */
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

/** A click track of evenly-spaced synthetic kicks at a given BPM, with silence between. */
function makeClickTrack(
  sampleRate: number,
  bpm: number,
  kickCount: number,
  amplitude = 1
): { buffer: Float32Array; kickTimesSec: number[] } {
  const intervalSec = 60 / bpm
  const leadInSec = 0.2
  const trailSec = 0.3
  const totalDurationSec = leadInSec + intervalSec * (kickCount - 1) + trailSec
  const buffer = new Float32Array(Math.round(totalDurationSec * sampleRate))
  const kick = synthesizeKick(sampleRate, amplitude)
  const kickTimesSec: number[] = []

  for (let i = 0; i < kickCount; i++) {
    const timeSec = leadInSec + i * intervalSec
    kickTimesSec.push(timeSec)
    const startSample = Math.round(timeSec * sampleRate)
    for (let j = 0; j < kick.length && startSample + j < buffer.length; j++) {
      buffer[startSample + j] += kick[j]
    }
  }

  return { buffer, kickTimesSec }
}

/** Places kicks at explicit times (seconds) rather than an even grid, for gap scenarios. */
function makeClickTrackAtTimes(
  sampleRate: number,
  kickTimesSec: number[],
  durationSec: number,
  amplitude = 1
): Float32Array {
  const buffer = new Float32Array(Math.round(durationSec * sampleRate))
  const kick = synthesizeKick(sampleRate, amplitude)
  for (const timeSec of kickTimesSec) {
    const startSample = Math.round(timeSec * sampleRate)
    for (let j = 0; j < kick.length && startSample + j < buffer.length; j++) {
      buffer[startSample + j] += kick[j]
    }
  }
  return buffer
}

describe('detectKicks', () => {
  test('finds every kick in a steady click track at a known BPM', () => {
    const { buffer, kickTimesSec } = makeClickTrack(SAMPLE_RATE, 170, 8)

    const detected = detectKicks(buffer, SAMPLE_RATE)

    expect(detected.length).toBe(kickTimesSec.length)
    detected.forEach((timeSec, i) => {
      expect(timeSec).toBeCloseTo(kickTimesSec[i], 1)
    })
  })

  test('finds every kick at a different known BPM', () => {
    const { buffer, kickTimesSec } = makeClickTrack(SAMPLE_RATE, 150, 8)

    const detected = detectKicks(buffer, SAMPLE_RATE)

    expect(detected.length).toBe(kickTimesSec.length)
    detected.forEach((timeSec, i) => {
      expect(timeSec).toBeCloseTo(kickTimesSec[i], 1)
    })
  })

  test('detects a quiet intro and a loud drop at the same rate, despite the volume jump', () => {
    const quietIntro = makeClickTrack(SAMPLE_RATE, 170, 4, 0.3)
    const loudDrop = makeClickTrack(SAMPLE_RATE, 170, 4, 1)

    const buffer = new Float32Array(quietIntro.buffer.length + loudDrop.buffer.length)
    buffer.set(quietIntro.buffer, 0)
    buffer.set(loudDrop.buffer, quietIntro.buffer.length)

    const dropOffsetSec = quietIntro.buffer.length / SAMPLE_RATE
    const expectedTimesSec = [
      ...quietIntro.kickTimesSec,
      ...loudDrop.kickTimesSec.map((t) => t + dropOffsetSec)
    ]

    const detected = detectKicks(buffer, SAMPLE_RATE)

    expect(detected.length).toBe(expectedTimesSec.length)
    detected.forEach((timeSec, i) => {
      expect(timeSec).toBeCloseTo(expectedTimesSec[i], 1)
    })
  })

  test('does not hallucinate kicks during a silent breakdown gap', () => {
    const bpm = 170
    const intervalSec = 60 / bpm
    const before = [0.2, 0.2 + intervalSec, 0.2 + 2 * intervalSec, 0.2 + 3 * intervalSec]
    const gapEnd = before[before.length - 1] + 4 * intervalSec
    const after = [gapEnd, gapEnd + intervalSec, gapEnd + 2 * intervalSec, gapEnd + 3 * intervalSec]
    const allTimes = [...before, ...after]
    const durationSec = after[after.length - 1] + 0.3

    const buffer = makeClickTrackAtTimes(SAMPLE_RATE, allTimes, durationSec)

    const detected = detectKicks(buffer, SAMPLE_RATE)

    expect(detected.length).toBe(allTimes.length)
    detected.forEach((timeSec, i) => {
      expect(timeSec).toBeCloseTo(allTimes[i], 1)
    })
  })
})
