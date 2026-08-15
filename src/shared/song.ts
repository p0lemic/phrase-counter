export interface Block {
  phraseCount: number
  isDrop: boolean
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
