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

export interface EnergyBlock {
  phraseCount: number
}

const ENERGY_EPSILON = 1e-6

/** Groups consecutive phrases with similar energy; a jump of `jumpRatio`x or more starts a new block. */
export function groupPhrasesIntoBlocks(energies: number[], jumpRatio = 1.4): EnergyBlock[] {
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
