import type { EngineGrid } from '../../../shared/engine'

export interface EngineGridIndex {
  /** Engine's grid for a track, or undefined when Engine has never analysed it (or isn't installed). */
  gridFor: (filePath: string) => Promise<EngineGrid | undefined>
  /** How many of these tracks Engine has a grid for — what a batch can tell the user up front. */
  countKnown: (filePaths: string[]) => Promise<number>
  /** Which of these tracks Engine has a grid for, for deciding per song rather than counting. */
  pathsWithGrid: (filePaths: string[]) => Promise<Set<string>>
  /** Feeds in grids a caller already has, so importing a playlist doesn't re-read the library. */
  prime: (grids: Record<string, EngineGrid>) => void
}

type ReadGrids = () => Promise<Record<string, EngineGrid>>

/**
 * Session-long cache of Engine DJ's beat grids, so that analysing a batch of songs reads Engine's
 * library once rather than once per song — it is a several-hundred-megabyte SQLite file, and
 * loading it is by far the most expensive part of asking it anything.
 *
 * A library that can't be read (Engine not installed, a moved folder) isn't an error here: the
 * analysis simply falls back to detecting the grid itself, exactly as it did before.
 */
export function createEngineGridIndex(readGrids: ReadGrids): EngineGridIndex {
  const primed: Record<string, EngineGrid> = {}
  let loading: Promise<Record<string, EngineGrid>> | undefined

  return {
    prime(grids) {
      Object.assign(primed, grids)
    },

    async countKnown(filePaths) {
      return (await this.pathsWithGrid(filePaths)).size
    },

    async pathsWithGrid(filePaths) {
      const grids = await Promise.all(filePaths.map((filePath) => this.gridFor(filePath)))
      return new Set(filePaths.filter((_, index) => grids[index]))
    },

    async gridFor(filePath) {
      if (primed[filePath]) return primed[filePath]

      // Kept even when it rejects: one failed read means Engine isn't available at all, and
      // retrying it per song would re-open the library hundreds of times to fail hundreds of times.
      loading ??= readGrids().catch(() => ({}))
      return (await loading)[filePath]
    }
  }
}

/** The index the app uses, reading through the Engine library IPC. */
export const engineGrids = createEngineGridIndex(async () => (await window.api.engine.readLibrary()).grids)
