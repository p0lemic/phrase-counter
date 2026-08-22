import type { Block } from './song'

/** The one-line shape of a track: one number per block, breakdowns in parentheses — `8+16+(4)+8`.
 *  Lives in `shared` because both the renderer (library table, export, ID3 comment) and the main
 *  process (the Engine DJ sync) write it, and they must never disagree on the format. */
export function formatBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => (block.isBreakdown ? `(${block.phraseCount})` : String(block.phraseCount)))
    .join('+')
}
