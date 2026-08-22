import type { Block } from '../shared/song'
import { QUICK_CUE_COUNT, type QuickCue } from './engineCues'

/** Engine's own pad palette, so the cues look native next to hand-placed ones. */
export const CUE_COLOR_BLOCK = 0xff1571e2
export const CUE_COLOR_BREAKDOWN = 0xffef8130
export const CUE_COLOR_DROP = 0xffce3239

/** Labels are written latin1 and shown on a narrow pad, so they stay short and ASCII. */
function labelFor(block: Block, isDrop: boolean): string {
  if (isDrop) return `DROP ${block.phraseCount}`
  return block.isBreakdown ? `(${block.phraseCount})` : String(block.phraseCount)
}

/** The phrase index each block starts on, which is what indexes into `phraseTimesSec`. */
function blockStartPhraseIndexes(blocks: Block[]): number[] {
  const indexes: number[] = []
  let phrase = 0
  for (const block of blocks) {
    indexes.push(phrase)
    phrase += block.phraseCount
  }
  return indexes
}

/** In makina the drop is the block that lands after the breakdown. With more than one breakdown
 *  the longest is the one that counts — the short ones are transitions, not the build. */
function findDropIndex(blocks: Block[]): number | null {
  let bestBreakdown = -1
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (!block.isBreakdown) continue
    const isBetter =
      bestBreakdown === -1 || block.phraseCount >= blocks[bestBreakdown].phraseCount
    // `>=` so a tie picks the later breakdown, which is the one the track actually drops out of.
    if (isBetter) bestBreakdown = index
  }
  if (bestBreakdown === -1) return null
  const dropIndex = bestBreakdown + 1
  return dropIndex < blocks.length && !blocks[dropIndex].isBreakdown ? dropIndex : null
}

interface Candidate {
  cue: QuickCue
  blockIndex: number
  priority: number
}

/**
 * Turns the analysed blocks into the eight cue slots Engine gives us.
 *
 * Tracks with more than eight blocks — 14% of a real makina library — cannot be represented in
 * full, so rather than truncating at the eighth block (which would drop the end of the track,
 * including the drop on a long one) the cues that matter for mixing are kept first: the drop, then
 * the breakdowns, then the rest in order. What survives is always re-sorted by time, because
 * Engine numbers the pads by slot and a DJ reads them left to right.
 */
export function planQuickCues(
  blocks: Block[],
  phraseTimesSec: number[],
  sampleRate: number
): (QuickCue | null)[] {
  const empty: (QuickCue | null)[] = new Array(QUICK_CUE_COUNT).fill(null)
  if (blocks.length === 0 || phraseTimesSec.length === 0 || !(sampleRate > 0)) return empty

  const dropIndex = findDropIndex(blocks)
  const startIndexes = blockStartPhraseIndexes(blocks)
  const candidates: Candidate[] = []

  for (let index = 0; index < blocks.length; index++) {
    const startSec = phraseTimesSec[startIndexes[index]]
    // A block can start past the end of the grid when the analysis was edited down; nothing to mark.
    if (startSec === undefined) continue
    const block = blocks[index]
    const isDrop = index === dropIndex
    candidates.push({
      blockIndex: index,
      priority: isDrop ? 0 : block.isBreakdown ? 1 : 2,
      cue: {
        label: labelFor(block, isDrop),
        positionSamples: Math.round(startSec * sampleRate),
        colorArgb: isDrop ? CUE_COLOR_DROP : block.isBreakdown ? CUE_COLOR_BREAKDOWN : CUE_COLOR_BLOCK
      }
    })
  }

  const kept = [...candidates]
    .sort((a, b) => a.priority - b.priority || a.blockIndex - b.blockIndex)
    .slice(0, QUICK_CUE_COUNT)
    .sort((a, b) => a.blockIndex - b.blockIndex)

  const cues = [...empty]
  kept.forEach((candidate, slot) => {
    cues[slot] = candidate.cue
  })
  return cues
}
