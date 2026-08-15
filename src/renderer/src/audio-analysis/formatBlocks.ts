export interface Block {
  phraseCount: number
  isDrop: boolean
}

export function formatBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => (block.isDrop ? `(${block.phraseCount})` : String(block.phraseCount)))
    .join('+')
}
