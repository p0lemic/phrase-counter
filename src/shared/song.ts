export interface Block {
  phraseCount: number
  /** No kick present in this block — a breakdown/atmosphere section. */
  isBreakdown: boolean
}

export interface SongRecord {
  id: number
  filePath: string
  /** Track title — from the file's tags, falling back to its name. Editable in the library. */
  title: string
  /** Track artist — same source and same editing. Empty when neither tag nor name supplies one. */
  artist: string
  /** Whether this song's tags have been read off disk yet; drives the one-time backfill. */
  tagsRead: boolean
  bpm: number
  durationMs: number
  /** Phrase-grid line timestamps, cached so reopening a song never re-runs BPM/kick detection. */
  phraseTimesSec: number[]
  blocks: Block[]
  createdAt: string
  updatedAt: string
}

export type NewSongRecord = Omit<SongRecord, 'id' | 'createdAt' | 'updatedAt'>

/** The subset of analysis that can change after the initial insert (BPM/grid edits, block edits). */
export type SongAnalysisUpdate = Pick<SongRecord, 'bpm' | 'phraseTimesSec' | 'blocks'>

/** What an in-place edit (or the tag backfill) writes back. */
export type SongTagsUpdate = Pick<SongRecord, 'title' | 'artist'>

/** Tags read straight from the audio file (ID3 etc.) — separate from our own DSP analysis. */
export interface SongMetadata {
  title: string | null
  artist: string | null
  album: string | null
  /** Cover art as a data: URL, ready to use in an <img src>. */
  coverDataUrl: string | null
  /** Musical key as stored in the tag (e.g. Camelot "8A" or standard "Abm") — shown as-is, not converted. */
  key: string | null
}
