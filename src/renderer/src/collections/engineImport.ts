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
