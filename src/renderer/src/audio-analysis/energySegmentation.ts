import { bandpassFilter } from './filters'

/** A breakdown can be just as loud overall as a kick section (pads, vocals, hihats) — it's
 *  specifically missing the kick, so the kick-drum frequency range is what actually tells them
 *  apart reliably. */
const KICK_BAND_LOW_HZ = 40
const KICK_BAND_HIGH_HZ = 150

export function computePhraseEnergies(
  monoSamples: Float32Array,
  sampleRate: number,
  phraseBoundariesSec: number[],
  durationSec: number
): number[] {
  const boundaries = [...phraseBoundariesSec, durationSec]
  const energies: number[] = []

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startSample = Math.round(boundaries[i] * sampleRate)
    const endSample = Math.min(Math.round(boundaries[i + 1] * sampleRate), monoSamples.length)

    let sumOfSquares = 0
    for (let s = startSample; s < endSample; s++) {
      sumOfSquares += monoSamples[s] * monoSamples[s]
    }
    const sampleCount = Math.max(endSample - startSample, 1)
    energies.push(Math.sqrt(sumOfSquares / sampleCount))
  }

  return energies
}

/** Same as computePhraseEnergies, but measures only kick-drum-range energy — a far more reliable
 *  signal for telling kick sections from breakdowns than overall loudness (see KICK_BAND_LOW_HZ). */
export function computeKickBandPhraseEnergies(
  monoSamples: Float32Array,
  sampleRate: number,
  phraseBoundariesSec: number[],
  durationSec: number
): number[] {
  const kickBand = bandpassFilter(monoSamples, sampleRate, KICK_BAND_LOW_HZ, KICK_BAND_HIGH_HZ)
  return computePhraseEnergies(kickBand, sampleRate, phraseBoundariesSec, durationSec)
}

export interface EnergyBlock {
  phraseCount: number
}

const ENERGY_EPSILON = 1e-6

/** Groups consecutive phrases with similar energy; a jump of `jumpRatio`x or more starts a new block.
 *  Real breakdowns often still carry some bass (pads, sub-basslines) even with the kick removed, so
 *  the kick-band contrast between a breakdown and a kick section tends to be a moderate ~1.2-1.5x,
 *  not the much larger jump a fully silent gap would produce — 1.4 missed real transitions like
 *  that on some tracks entirely, collapsing the whole thing into a single block. */
export function groupPhrasesIntoBlocks(energies: number[], jumpRatio = 1.2): EnergyBlock[] {
  if (energies.length === 0) return []

  const blocks: EnergyBlock[] = [{ phraseCount: 1 }]

  for (let i = 1; i < energies.length; i++) {
    const previous = Math.max(energies[i - 1], ENERGY_EPSILON)
    const current = Math.max(energies[i], ENERGY_EPSILON)
    const ratio = current >= previous ? current / previous : previous / current

    if (ratio >= jumpRatio) {
      blocks.push({ phraseCount: 1 })
    } else {
      blocks[blocks.length - 1].phraseCount++
    }
  }

  return blocks
}
