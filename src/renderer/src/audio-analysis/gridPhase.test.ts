import { describe, expect, it } from 'vitest'
import { bestPhaseOffsetSec, fitConstantTempoGrid, kickAttackEnvelope } from './gridPhase'

describe('fitConstantTempoGrid', () => {
  it('recovers the interval and phase of a perfectly regular set of ticks', () => {
    const ticks = Array.from({ length: 40 }, (_, i) => 0.25 + i * 0.5)
    const fit = fitConstantTempoGrid(120, ticks)
    expect(fit!.intervalSec).toBeCloseTo(0.5, 6)
    expect(fit!.phaseSec).toBeCloseTo(0.25, 6)
  })

  it('averages out the per-tick jitter instead of following it', () => {
    // Beats every 0.5 s, each nudged by up to ±20 ms in an alternating pattern.
    const ticks = Array.from({ length: 40 }, (_, i) => 0.25 + i * 0.5 + (i % 2 === 0 ? 0.02 : -0.02))
    const fit = fitConstantTempoGrid(120, ticks)
    expect(fit!.intervalSec).toBeCloseTo(0.5, 3)
    expect(fit!.phaseSec).toBeCloseTo(0.25, 2)
  })

  it('follows a real tempo that differs slightly from the reported bpm', () => {
    // Reported 120 bpm, actually 119.5.
    const trueInterval = 60 / 119.5
    const ticks = Array.from({ length: 60 }, (_, i) => 1 + i * trueInterval)
    const fit = fitConstantTempoGrid(120, ticks)
    expect(60 / fit!.intervalSec).toBeCloseTo(119.5, 2)
  })

  it('gives up when there are not enough ticks to fit a line through', () => {
    expect(fitConstantTempoGrid(120, [])).toBeNull()
    expect(fitConstantTempoGrid(120, [1.5])).toBeNull()
  })
})

describe('kickAttackEnvelope', () => {
  it('peaks at the frame where the signal jumps', () => {
    const samples = new Float32Array(4096)
    for (let i = 2048; i < 2048 + 256; i++) samples[i] = 1
    const envelope = kickAttackEnvelope(samples, 64)
    const loudest = envelope.indexOf(Math.max(...envelope))
    expect(loudest).toBe(2048 / 64)
  })

  it('stays flat for a steady signal, since only rises count', () => {
    const samples = new Float32Array(4096).fill(0.5)
    expect(Math.max(...kickAttackEnvelope(samples, 64))).toBeCloseTo(0, 6)
  })
})

describe('bestPhaseOffsetSec', () => {
  const sampleRate = 1000
  const hopSize = 10
  /** One attack every 0.5 s (every 50 frames), 4 s long. */
  const envelope = (() => {
    const frames = new Float32Array(400)
    for (let f = 0; f < 400; f += 50) frames[f] = 1
    return frames
  })()

  it('reports no correction for a grid already on the attacks', () => {
    const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
    expect(bestPhaseOffsetSec(grid, envelope, sampleRate, hopSize, 0.5)).toBeCloseTo(0, 2)
  })

  it('pushes a grid that sits early back onto the attacks', () => {
    const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => t - 0.08)
    expect(bestPhaseOffsetSec(grid, envelope, sampleRate, hopSize, 0.5)).toBeCloseTo(0.08, 2)
  })

  it('pulls a grid that sits late back onto the attacks', () => {
    const grid = [0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => t + 0.06)
    expect(bestPhaseOffsetSec(grid, envelope, sampleRate, hopSize, 0.5)).toBeCloseTo(-0.06, 2)
  })

  it('never shifts by more than the allowed range, so it cannot jump to the next beat', () => {
    const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
    const offset = bestPhaseOffsetSec(grid, envelope, sampleRate, hopSize, 0.05)
    expect(Math.abs(offset)).toBeLessThanOrEqual(0.05)
  })

  it('leaves the grid alone when there is nothing to align to', () => {
    expect(bestPhaseOffsetSec([0, 0.5], new Float32Array(400), sampleRate, hopSize, 0.5)).toBe(0)
    expect(bestPhaseOffsetSec([], envelope, sampleRate, hopSize, 0.5)).toBe(0)
  })
})
