import type { Block } from '../../../shared/song'

export type { Block }

export function formatBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => (block.isDrop ? `(${block.phraseCount})` : String(block.phraseCount)))
    .join('+')
}
