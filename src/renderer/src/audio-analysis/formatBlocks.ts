import type { Block } from '../../../shared/song'

export type { Block }

/** Re-exported so the renderer keeps importing it from here, while the main process (Engine DJ
 *  sync) can reach the same implementation without reaching into renderer code. */
export { formatBlocks } from '../../../shared/formatBlocks'
