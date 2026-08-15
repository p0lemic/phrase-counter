import { describe, expect, test } from 'vitest'
import { computePhraseEnergies, groupPhrasesIntoBlocks } from './energySegmentation'

describe('computePhraseEnergies', () => {
  test('reports near-zero energy for a silent phrase and higher energy for a loud one', () => {
    const sampleRate = 1000
    const phraseBoundariesSec = [0, 1]
    const durationSec = 2
    const samples = new Float32Array(sampleRate * durationSec)
    // Second phrase (samples[1000..2000)) is a constant-amplitude tone.
    for (let i = sampleRate; i < samples.length; i++) {
      samples[i] = 0.8
    }

    const energies = computePhraseEnergies(samples, sampleRate, phraseBoundariesSec, durationSec)

    expect(energies).toHaveLength(2)
    expect(energies[0]).toBeCloseTo(0, 5)
    expect(energies[1]).toBeCloseTo(0.8, 5)
  })
})

describe('groupPhrasesIntoBlocks', () => {
  test('keeps flat energy as a single block', () => {
    const energies = [0.5, 0.5, 0.5, 0.5]

    const blocks = groupPhrasesIntoBlocks(energies)

    expect(blocks).toEqual([{ phraseCount: 4 }])
  })

  test('splits into blocks at a clear energy jump', () => {
    const energies = [0.2, 0.2, 0.2, 0.2, 0.9, 0.9, 0.9, 0.9]

    const blocks = groupPhrasesIntoBlocks(energies)

    expect(blocks).toEqual([{ phraseCount: 4 }, { phraseCount: 4 }])
  })

  test('recovers a 4+4+6+4 pattern from a quiet/medium/loud/medium energy shape', () => {
    const quiet = [0.1, 0.1, 0.1, 0.1]
    const medium = [0.4, 0.4, 0.4, 0.4]
    const loud = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]
    const energies = [...quiet, ...medium, ...loud, ...medium]

    const blocks = groupPhrasesIntoBlocks(energies)

    expect(blocks).toEqual([{ phraseCount: 4 }, { phraseCount: 4 }, { phraseCount: 6 }, { phraseCount: 4 }])
  })
})
