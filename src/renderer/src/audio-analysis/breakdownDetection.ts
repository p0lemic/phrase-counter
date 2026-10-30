import type { EnergyBlock } from './energySegmentation'
import type { Block } from './formatBlocks'

/** Where the track's kick sections sit. A high percentile of the phrases rather than the loudest
 *  one, so a single unusually hot phrase can't drag the reference up and turn the rest quiet. */
const LOUD_PERCENTILE = 0.75

/** A block counts as a breakdown below this share of that level. Measured on a real track: kick
 *  sections land around 0.37 and the breakdown around 0.16 — a ratio of 0.43 — so half the loud
 *  level separates them with room on both sides. */
const BREAKDOWN_SHARE = 0.5

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

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

/**
 * Marks the blocks with no kick — a breakdown/atmosphere section — as the ones whose energy falls
 * well below the level the track plays at when the kick is in.
 *
 * The comparison is against the track as a whole, never against the block before. An earlier
 * version asked a block to tower over its predecessor as well, which quietly meant that in a track
 * that is mostly full-power only the section right after a breakdown could ever be recognised as
 * having a kick: everything else "failed" to be 1.3x its equally loud neighbour and was marked as a
 * breakdown. Over a real 105-track library that came out as 62% of all blocks.
 */
export function markBreakdowns(
  blocks: EnergyBlock[],
  energies: number[],
  breakdownShare = BREAKDOWN_SHARE
): Block[] {
  const blockEnergies = averageEnergyPerBlock(blocks, energies)
  const threshold = percentile(energies, LOUD_PERCENTILE) * breakdownShare

  return blocks.map((block, i) => ({
    phraseCount: block.phraseCount,
    isBreakdown: blockEnergies[i] < threshold
  }))
}
