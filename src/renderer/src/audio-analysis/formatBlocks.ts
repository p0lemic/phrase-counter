import type { Block } from '../../../shared/song'

export type { Block }

export function formatBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => (block.isBreakdown ? `(${block.phraseCount})` : String(block.phraseCount)))
    .join('+')
}
