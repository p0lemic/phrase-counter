import { describe, expect, test } from 'vitest'
import { computeKickBandPhraseEnergies, computePhraseEnergies, groupPhrasesIntoBlocks } from './energySegmentation'

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

describe('computeKickBandPhraseEnergies', () => {
  test('tells apart a kick phrase from an equally loud but kick-less breakdown phrase', () => {
    const sampleRate = 44100
    const phraseBoundariesSec = [0, 1]
    const durationSec = 2
    const samples = new Float32Array(sampleRate * durationSec)

    // First phrase: loud but kick-less (e.g. hihats/vocals) — energy well above the kick band.
    for (let i = 0; i < sampleRate; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 4000 * i) / sampleRate)
    }
    // Second phrase: a kick-band tone at roughly the same overall amplitude.
    for (let i = sampleRate; i < samples.length; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 80 * i) / sampleRate)
    }

    const fullSpectrum = computePhraseEnergies(samples, sampleRate, phraseBoundariesSec, durationSec)
    const kickBand = computeKickBandPhraseEnergies(samples, sampleRate, phraseBoundariesSec, durationSec)

    // Full-spectrum energy is nearly identical between the two phrases...
    expect(fullSpectrum[0]).toBeCloseTo(fullSpectrum[1], 1)
    // ...but kick-band energy clearly tells them apart.
    expect(kickBand[1]).toBeGreaterThan(kickBand[0] * 5)
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

  test('catches a moderate ~1.3x jump, the kind of contrast a breakdown with residual bass produces', () => {
    // A fully silent gap jumps many times over; a real breakdown often still carries some bass
    // (pads, sub-basslines) even with the kick removed, so the jump can be this much more subtle —
    // confirmed against a real track that a stricter threshold missed entirely (single block).
    const kick = [0.2, 0.2, 0.2, 0.2]
    const breakdown = [0.15, 0.15, 0.15]

    const blocks = groupPhrasesIntoBlocks([...kick, ...breakdown])

    expect(blocks).toEqual([{ phraseCount: 4 }, { phraseCount: 3 }])
  })

  test('folds a single transitional phrase back into its section instead of its own one-phrase block', () => {
    // A brief riser/fill on the way into the drop — clearly above the breakdown before it, but not
    // yet at full kick energy — used to read as a jump both into and back out of it, planting a
    // spurious lone block; it should end up merged into whichever real section it's closer to.
    const breakdown = [0.07, 0.07, 0.07, 0.07]
    const transitionalPhrase = [0.13]
    const kick = [0.23, 0.23, 0.23, 0.23]

    const blocks = groupPhrasesIntoBlocks([...breakdown, ...transitionalPhrase, ...kick])

    // 0.13 sits closer to the breakdown's 0.07 average than the kick's 0.23, so it's absorbed there.
    expect(blocks).toEqual([{ phraseCount: 5 }, { phraseCount: 4 }])
  })
})
