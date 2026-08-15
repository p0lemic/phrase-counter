import type { Block } from './formatBlocks'

/** Timestamps where each block starts, plus a final entry at the track's end. */
export function blockBoundaryTimesSec(blocks: Block[], phraseTimesSec: number[], durationSec: number): number[] {
  const boundaries: number[] = []
  let phraseIndex = 0
  for (const block of blocks) {
    boundaries.push(phraseTimesSec[phraseIndex] ?? durationSec)
    phraseIndex += block.phraseCount
  }
  boundaries.push(durationSec)
  return boundaries
}

export function mergeWithNext(blocks: Block[], index: number): Block[] {
  if (index >= blocks.length - 1) return blocks
  const merged: Block = {
    phraseCount: blocks[index].phraseCount + blocks[index + 1].phraseCount,
    isBreakdown: blocks[index].isBreakdown || blocks[index + 1].isBreakdown
  }
  return [...blocks.slice(0, index), merged, ...blocks.slice(index + 2)]
}

export function splitInHalf(blocks: Block[], index: number): Block[] {
  const block = blocks[index]
  const firstHalf = Math.floor(block.phraseCount / 2)
  if (firstHalf < 1 || block.phraseCount - firstHalf < 1) return blocks
  const first: Block = { phraseCount: firstHalf, isBreakdown: block.isBreakdown }
  const second: Block = { phraseCount: block.phraseCount - firstHalf, isBreakdown: block.isBreakdown }
  return [...blocks.slice(0, index), first, second, ...blocks.slice(index + 1)]
}

export function toggleBreakdown(blocks: Block[], index: number): Block[] {
  return blocks.map((block, i) => (i === index ? { ...block, isBreakdown: !block.isBreakdown } : block))
}

/**
 * Shifts one phrase across the boundary between block[boundaryIndex] and block[boundaryIndex + 1].
 * direction -1 moves the boundary left (that block shrinks, its neighbour grows); +1 moves it right.
 * Always snapped to the phrase grid, since it moves whole phrases.
 */
export function shiftBoundary(blocks: Block[], boundaryIndex: number, direction: 1 | -1): Block[] {
  const donorIndex = direction === -1 ? boundaryIndex : boundaryIndex + 1
  const receiverIndex = direction === -1 ? boundaryIndex + 1 : boundaryIndex
  if (donorIndex < 0 || receiverIndex >= blocks.length || blocks[donorIndex].phraseCount <= 1) return blocks

  return blocks.map((block, i) => {
    if (i === donorIndex) return { ...block, phraseCount: block.phraseCount - 1 }
    if (i === receiverIndex) return { ...block, phraseCount: block.phraseCount + 1 }
    return block
  })
}
