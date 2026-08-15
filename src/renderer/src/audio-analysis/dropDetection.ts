import type { EnergyBlock } from './energySegmentation'
import type { Block } from './formatBlocks'

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageEnergyPerBlock(blocks: EnergyBlock[], energies: number[]): number[] {
  const blockEnergies: number[] = []
  let phraseIndex = 0

  for (const block of blocks) {
    const phraseEnergies = energies.slice(phraseIndex, phraseIndex + block.phraseCount)
    blockEnergies.push(average(phraseEnergies))
    phraseIndex += block.phraseCount
  }

  return blockEnergies
}

/** Marks blocks whose energy towers over both the previous block and the track average as drops. */
export function markDrops(blocks: EnergyBlock[], energies: number[], previousBlockRatio = 1.3): Block[] {
  const blockEnergies = averageEnergyPerBlock(blocks, energies)
  const trackAverage = average(blockEnergies)

  return blocks.map((block, i) => {
    const previousEnergy = i > 0 ? blockEnergies[i - 1] : 0
    const isDrop = blockEnergies[i] > trackAverage && blockEnergies[i] >= previousEnergy * previousBlockRatio
    return { phraseCount: block.phraseCount, isDrop }
  })
}
