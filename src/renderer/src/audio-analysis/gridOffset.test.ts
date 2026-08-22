import { describe, expect, it } from 'vitest'
import { formatGridOffset, shiftPhraseGrid } from './gridOffset'

describe('shiftPhraseGrid', () => {
  it('moves every phrase line by the requested amount', () => {
    const result = shiftPhraseGrid([10, 20, 30], 0.5, 60)
    expect(result.phraseTimesSec).toEqual([10.5, 20.5, 30.5])
    expect(result.appliedSec).toBe(0.5)
  })

  it('keeps the spacing between lines untouched', () => {
    const result = shiftPhraseGrid([10, 20.96, 31.92], -0.04, 60)
    const gaps = result.phraseTimesSec.slice(1).map((time, i) => time - result.phraseTimesSec[i])
    expect(gaps[0]).toBeCloseTo(10.96, 10)
    expect(gaps[1]).toBeCloseTo(10.96, 10)
  })

  // Moving the grid earlier than the start of the track would put a phrase line at a negative
  // time, which the waveform can't draw — the grid stops at 0 instead.
  it('clamps a backward shift at the start of the track', () => {
    const result = shiftPhraseGrid([0.2, 10.2], -0.5, 60)
    expect(result.phraseTimesSec[0]).toBeCloseTo(0, 10)
    expect(result.phraseTimesSec[1]).toBeCloseTo(10, 10)
    expect(result.appliedSec).toBeCloseTo(-0.2, 10)
  })

  it('clamps a forward shift at the end of the track', () => {
    const result = shiftPhraseGrid([10, 59.8], 0.5, 60)
    expect(result.phraseTimesSec[0]).toBeCloseTo(10.2, 10)
    expect(result.phraseTimesSec[1]).toBeCloseTo(60, 10)
    expect(result.appliedSec).toBeCloseTo(0.2, 10)
  })

  it('reports no movement when the grid is already against the edge', () => {
    const result = shiftPhraseGrid([0, 10], -0.5, 60)
    expect(result.phraseTimesSec).toEqual([0, 10])
    expect(result.appliedSec).toBe(0)
  })

  it('leaves an empty grid alone', () => {
    const result = shiftPhraseGrid([], 0.5, 60)
    expect(result.phraseTimesSec).toEqual([])
    expect(result.appliedSec).toBe(0)
  })

  // A grid that somehow spans past the end of the track has no room in either direction; moving it
  // would only make one edge worse, so it stays put.
  it('leaves a grid with no room in either direction alone', () => {
    const result = shiftPhraseGrid([0, 70], 0.5, 60)
    expect(result.phraseTimesSec).toEqual([0, 70])
    expect(result.appliedSec).toBe(0)
  })
})

describe('formatGridOffset', () => {
  it('shows no sign when the grid sits where it was found', () => {
    expect(formatGridOffset(0)).toBe('0 ms')
  })

  it('signs a grid moved later', () => {
    expect(formatGridOffset(0.045)).toBe('+45 ms')
  })

  it('signs a grid moved earlier', () => {
    expect(formatGridOffset(-0.0123)).toBe('\u221212 ms')
  })

  // Sub-millisecond leftovers from clamping shouldn't read as a move.
  it('rounds to whole milliseconds', () => {
    expect(formatGridOffset(0.0004)).toBe('0 ms')
  })
})
