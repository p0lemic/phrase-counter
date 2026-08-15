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

/**
 * Marks blocks with no kick — a breakdown/atmosphere section — as the ones whose energy does
 * *not* tower over both the previous block and the track average. The energy comparison itself
 * reliably tells kick-driven blocks from breakdowns (confirmed against real tracks); breakdown is
 * just everything that isn't one of those kick blocks.
 */
export function markBreakdowns(blocks: EnergyBlock[], energies: number[], previousBlockRatio = 1.3): Block[] {
  const blockEnergies = averageEnergyPerBlock(blocks, energies)
  const trackAverage = average(blockEnergies)

  return blocks.map((block, i) => {
    const previousEnergy = i > 0 ? blockEnergies[i - 1] : 0
    const hasKick = blockEnergies[i] > trackAverage && blockEnergies[i] >= previousEnergy * previousBlockRatio
    return { phraseCount: block.phraseCount, isBreakdown: !hasKick }
  })
}
