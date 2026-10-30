import type { SongRecord } from '../../../shared/song'

export interface TrackMatch {
  /** Ids of the playlist's tracks that are already analyzed in our library. */
  songIds: number[]
  /** Absolute paths of the ones that aren't — the files still to analyze. */
  missingPaths: string[]
}

/** Splits an Engine playlist against our library by absolute path, which is the only identifier the
 *  two databases share. Duplicates within the playlist collapse to one entry. */
export function matchTrackPaths(trackPaths: string[], songs: SongRecord[]): TrackMatch {
  const songsByPath = new Map(songs.map((song) => [song.filePath, song]))
  const songIds: number[] = []
  const missingPaths: string[] = []
  const seen = new Set<string>()

  for (const path of trackPaths) {
    if (seen.has(path)) continue
    seen.add(path)
    const song = songsByPath.get(path)
    if (song) songIds.push(song.id)
    else missingPaths.push(path)
  }

  return { songIds, missingPaths }
}

/**
 * Of the songs a playlist links to that we already have, the ones worth analyzing again — by path,
 * ready to join the missing files in the import's analysis queue.
 *
 * Linking alone used to leave these exactly as they were, which is how a collection imported from
 * Engine ended up on our own detected grid: a song analyzed before Engine's library was ever read
 * keeps a tempo and a phase that are close but not Engine's, and nothing later goes back for it.
 * Two cases need the pass: a song with no grid at all (a migration invalidated it), and a song on
 * our detected grid that Engine has an exact one for. A song already on Engine's grid is done, and
 * so is one Engine has never analyzed — there is nothing better to give it.
 */
export function linkedPathsToRegrid(
  songIds: number[],
  songs: SongRecord[],
  pathsWithEngineGrid: ReadonlySet<string>
): string[] {
  const songsById = new Map(songs.map((song) => [song.id, song]))

  return songIds.flatMap((id) => {
    const song = songsById.get(id)
    if (!song) return []
    if (song.phraseTimesSec.length === 0) return [song.filePath]
    if (song.gridSource === 'engine') return []
    return pathsWithEngineGrid.has(song.filePath) ? [song.filePath] : []
  })
}
