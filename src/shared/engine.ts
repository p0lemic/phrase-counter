/**
 * The beat grid Engine DJ analysed for a track, reduced to the straight line it always is.
 *
 * Every one of the 24,317 analysed tracks in a real library stores exactly two markers, so the
 * grid is a constant tempo through and through: `beat0Sec + n * beatIntervalSec` reproduces it
 * everywhere, with none of the drift our own tempo estimate accumulates over a long track.
 */
export interface EngineGrid {
  bpm: number
  beatIntervalSec: number
  /** Time of Engine's beat 0 — the beat its bar and phrase numbering counts from. */
  beat0Sec: number
  /** Beat the 32-beat phrase grid should start on: the main cue's beat, or 0 when there is none. */
  phraseAnchorBeat: number
}

/** One Engine DJ playlist, with its parent chain already folded into the name. */
export interface EnginePlaylist {
  id: number
  name: string
  /** True for the playlists Engine shows at the top of its sidebar (no parent folder). */
  isRoot: boolean
  /** Ids into the library's `trackPaths`. Engine's own ordering is dropped — collections are sets. */
  trackIds: number[]
}

export interface EngineLibrary {
  /** The folder the data came from, so the UI can show which library is on screen. */
  libraryDir: string
  playlists: EnginePlaylist[]
  /** Absolute path per track id, deduplicated — playlists reference the same track many times over. */
  trackPaths: Record<number, string>
  /** Engine's beat grid per absolute path, for every track in the library it has analysed. */
  grids: Record<string, EngineGrid>
}

/** What the renderer asks for when pushing our analysis into Engine's library. */
export interface EngineSyncRequest {
  /** Defaults to ~/Music/Engine Library when left out. */
  libraryDir?: string
  writeComment: boolean
  writeTitle: boolean
  writeCues: boolean
  /** Count what would change without writing anything. */
  dryRun: boolean
}

export interface EngineSyncResult {
  /** Songs of ours that exist in Engine's library at all. */
  matched: number
  /** Songs of ours with no track in Engine — nothing to write for these. */
  unmatched: number
  commentsWritten: number
  titlesWritten: number
  cuesWritten: number
  /** Tracks with more than eight blocks, where cues cover only part of the structure. */
  cuesTruncated: number
  /** Tracks Engine hasn't analysed yet, so there's no sample rate to place cues against. */
  cuesSkippedNoSampleRate: number
  backupPath: string | null
  dryRun: boolean
}

export interface EngineRevertResult {
  titlesReverted: number
  cuesCleared: number
  backupPath: string
}
