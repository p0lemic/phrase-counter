export interface Block {
  phraseCount: number
  /** No kick present in this block — a breakdown/atmosphere section. */
  isBreakdown: boolean
}

export interface SongRecord {
  id: number
  filePath: string
  title: string
  bpm: number
  durationMs: number
  blocks: Block[]
  createdAt: string
  updatedAt: string
}

export type NewSongRecord = Omit<SongRecord, 'id' | 'createdAt' | 'updatedAt'>

/** Tags read straight from the audio file (ID3 etc.) — separate from our own DSP analysis. */
export interface SongMetadata {
  title: string | null
  artist: string | null
  album: string | null
  /** Cover art as a data: URL, ready to use in an <img src>. */
  coverDataUrl: string | null
  /** Musical key as stored in the tag (e.g. Camelot "8A" or standard "Abm") — shown as-is, not converted. */
  key: string | null
  /** 0-5, rounded from the file's popularimeter tag; null if the file has no rating. */
  ratingStars: number | null
}
