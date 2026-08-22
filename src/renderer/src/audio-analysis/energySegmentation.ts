import { bandpassFilter } from './filters'

/** A breakdown can be just as loud overall as a kick section (pads, vocals, hihats) — it's
 *  specifically missing the kick, so the kick-drum frequency range is what actually tells them
 *  apart reliably. */
export const KICK_BAND_LOW_HZ = 40
export const KICK_BAND_HIGH_HZ = 150

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

/** A block this short is more likely a transitional phrase between two real sections (a riser, a
 *  filter sweep easing into the drop) than a section of its own — see mergeShortBlocks. */
const MIN_BLOCK_PHRASES = 2

function blockAverageEnergies(blocks: EnergyBlock[], energies: number[]): number[] {
  const averages: number[] = []
  let phraseIndex = 0
  for (const block of blocks) {
    const slice = energies.slice(phraseIndex, phraseIndex + block.phraseCount)
    averages.push(slice.reduce((sum, value) => sum + value, 0) / slice.length)
    phraseIndex += block.phraseCount
  }
  return averages
}

/** Merges any block shorter than MIN_BLOCK_PHRASES into whichever adjacent block has the closer
 *  average energy, repeating until every remaining block meets the minimum. Without this, a single
 *  transitional phrase reads as a jump both into *and* back out of it, planting a spurious
 *  one-phrase block right in the middle of what's really one continuous section. */
function mergeShortBlocks(blocks: EnergyBlock[], energies: number[]): EnergyBlock[] {
  let result = blocks.map((block) => ({ ...block }))

  while (result.length > 1) {
    const shortestIndex = result.findIndex((block) => block.phraseCount < MIN_BLOCK_PHRASES)
    if (shortestIndex === -1) break

    const averages = blockAverageEnergies(result, energies)
    const leftDistance = shortestIndex > 0 ? Math.abs(averages[shortestIndex] - averages[shortestIndex - 1]) : Infinity
    const rightDistance =
      shortestIndex < result.length - 1 ? Math.abs(averages[shortestIndex] - averages[shortestIndex + 1]) : Infinity
    const mergeAt = leftDistance <= rightDistance ? shortestIndex - 1 : shortestIndex

    const merged = { phraseCount: result[mergeAt].phraseCount + result[mergeAt + 1].phraseCount }
    result = [...result.slice(0, mergeAt), merged, ...result.slice(mergeAt + 2)]
  }

  return result
}

/** Groups consecutive phrases with similar energy; a jump of `jumpRatio`x or more starts a new block.
 *  Real breakdowns often still carry some bass (pads, sub-basslines) even with the kick removed, so
 *  the kick-band contrast between a breakdown and a kick section tends to be a moderate ~1.2-1.5x,
 *  not the much larger jump a fully silent gap would produce — this is deliberately sensitive enough
 *  to catch that, which means it also catches individual transitional phrases as their own one-phrase
 *  "block"; mergeShortBlocks folds those back into whichever real section they belong to. */
export function groupPhrasesIntoBlocks(energies: number[], jumpRatio = 1.15): EnergyBlock[] {
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

  return mergeShortBlocks(blocks, energies)
}
