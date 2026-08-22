import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import initSqlJs, { type Database } from 'sql.js'
import type { Collection, CollectionMember } from '../shared/collection'
import type { NewSongRecord, SongAnalysisUpdate, SongRecord, SongTagsUpdate } from '../shared/song'

export type { Collection, CollectionMember, NewSongRecord, SongRecord }

let db: Database | undefined
let dbPath: string | undefined

export async function openDatabase(path: string): Promise<void> {
  dbPath = path
  const SQL = await initSqlJs()
  db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()

  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      bpm REAL NOT NULL,
      duration_ms INTEGER NOT NULL,
      phrase_times_sec TEXT NOT NULL DEFAULT '[]',
      blocks TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  // The composite primary key is what lets a song sit in any number of collections at once while
  // making a second drop of the same song onto the same collection a no-op.
  db.run(`
    CREATE TABLE IF NOT EXISTS collection_songs (
      collection_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (collection_id, song_id)
    )
  `)
  migrate()
  persist()
}

/** CREATE TABLE IF NOT EXISTS doesn't alter an already-existing table, so new columns need this. */
function migrate(): void {
  requireDb().run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')

  runOnce('add_phrase_times_sec_column', () => {
    const columns = requireDb()
      .exec('PRAGMA table_info(songs)')[0]
      .values.map((row) => row[1] as string)
    if (!columns.includes('phrase_times_sec')) {
      requireDb().run("ALTER TABLE songs ADD COLUMN phrase_times_sec TEXT NOT NULL DEFAULT '[]'")
    }
  })

  runOnce('invalidate_drifted_phrase_grids', () => {
    // Grids cached before this migration were built from essentia's raw per-tick positions, which
    // drift out of sync with the music (worst through breakdowns, with no kick to lock onto).
    // Clearing them makes each song rebuild its grid as perfectly even beats (see analyzeSong.ts)
    // next time it's opened — saved/edited blocks are untouched, only the timing grid + bpm refresh.
    requireDb().run("UPDATE songs SET phrase_times_sec = '[]'")
  })

  runOnce('invalidate_misphased_grids', () => {
    // Grids cached before this migration were re-anchored to the nearest essentia tick beat by
    // beat, with a quarter-beat tolerance so wide that it snapped to 92-100% of them: the grid was
    // the raw ticks, jitter and all, and its phase could sit a few tens of milliseconds off every
    // kick for the whole track. Clearing them makes each song refit its grid (see gridPhase.ts)
    // next time it's opened — saved block edits are untouched, only the timing grid + bpm refresh.
    requireDb().run("UPDATE songs SET phrase_times_sec = '[]'")
  })

  runOnce('invalidate_half_tempo_grids', () => {
    // Tracks whose real tempo is 200+ were read at half of it (a kick on every beat is just as
    // readable as one on every other beat, and the extractor preferred the slower one), so their
    // grid marked every second kick and their phrases came out twice as long. detectRhythm now
    // catches that; only the suspiciously slow ones need to refit, so the rest keep their grid.
    requireDb().run("UPDATE songs SET phrase_times_sec = '[]' WHERE bpm < 130")
  })

  runOnce('add_artist_and_tags_read_columns', () => {
    // Songs inserted before this migration have the file name as their title and no artist at all.
    // tags_read = 0 marks them for the one-time backfill that reads each file's real tags; doing it
    // per-row (rather than one global flag) makes the backfill resumable after a cancel.
    const columns = requireDb()
      .exec('PRAGMA table_info(songs)')[0]
      .values.map((row) => row[1] as string)
    if (!columns.includes('artist')) {
      requireDb().run("ALTER TABLE songs ADD COLUMN artist TEXT NOT NULL DEFAULT ''")
    }
    if (!columns.includes('tags_read')) {
      requireDb().run('ALTER TABLE songs ADD COLUMN tags_read INTEGER NOT NULL DEFAULT 0')
    }
  })

  runOnce('invalidate_uncorrected_phrase_grids', () => {
    // Grids cached before this migration were pure even-beat extrapolation with no re-anchoring to
    // real kicks, which can compound a slightly-off BPM estimate into real drift over a long track
    // (confirmed up to ~1s by the end on a real one) — see buildCorrectedBeatGrid in bpmGrid.ts.
    requireDb().run("UPDATE songs SET phrase_times_sec = '[]'")
  })
}

function runOnce(name: string, migration: () => void): void {
  const alreadyRan = requireDb().exec('SELECT 1 FROM schema_migrations WHERE name = ?', [name]).length > 0
  if (alreadyRan) return
  migration()
  requireDb().run('INSERT INTO schema_migrations (name) VALUES (?)', [name])
}

function persist(): void {
  if (!db || !dbPath) return
  writeFileSync(dbPath, Buffer.from(db.export()))
}

function requireDb(): Database {
  if (!db) throw new Error('Database not opened yet')
  return db
}

function rowToSong(row: Record<string, unknown>): SongRecord {
  return {
    id: row.id as number,
    filePath: row.file_path as string,
    title: row.title as string,
    artist: (row.artist as string) ?? '',
    tagsRead: Boolean(row.tags_read),
    bpm: row.bpm as number,
    durationMs: row.duration_ms as number,
    phraseTimesSec: JSON.parse(row.phrase_times_sec as string),
    blocks: JSON.parse(row.blocks as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

/** sql.js returns columns and rows separately; every read here wants them zipped into objects. */
function queryRows(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const result = requireDb().exec(sql, params as never)
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])))
}

export function listSongs(): SongRecord[] {
  return queryRows('SELECT * FROM songs ORDER BY updated_at DESC').map(rowToSong)
}

export function findSongByFilePath(filePath: string): SongRecord | undefined {
  return listSongs().find((song) => song.filePath === filePath)
}

export function insertSong(song: NewSongRecord): SongRecord {
  const now = new Date().toISOString()
  requireDb().run(
    `INSERT INTO songs (file_path, title, artist, tags_read, bpm, duration_ms, phrase_times_sec, blocks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      song.filePath,
      song.title,
      song.artist,
      song.tagsRead ? 1 : 0,
      song.bpm,
      song.durationMs,
      JSON.stringify(song.phraseTimesSec),
      JSON.stringify(song.blocks),
      now,
      now
    ]
  )
  persist()
  const created = findSongByFilePath(song.filePath)
  if (!created) throw new Error('Failed to read back inserted song')
  return created
}

export function updateSongAnalysis(id: number, update: SongAnalysisUpdate): void {
  requireDb().run('UPDATE songs SET bpm = ?, phrase_times_sec = ?, blocks = ?, updated_at = ? WHERE id = ?', [
    update.bpm,
    JSON.stringify(update.phraseTimesSec),
    JSON.stringify(update.blocks),
    new Date().toISOString(),
    id
  ])
  persist()
}

/** Stores an edited (or freshly read) title/artist, and marks the song's tags as read. */
export function updateSongTags(id: number, update: SongTagsUpdate): void {
  requireDb().run('UPDATE songs SET title = ?, artist = ?, tags_read = 1, updated_at = ? WHERE id = ?', [
    update.title,
    update.artist,
    new Date().toISOString(),
    id
  ])
  persist()
}

/** Same as updateSongTags for many songs at once, writing the database file only once — the
 *  backfill would otherwise re-serialize the whole library per song. */
export function updateSongTagsBulk(updates: { id: number; title: string; artist: string }[]): void {
  const now = new Date().toISOString()
  for (const update of updates) {
    requireDb().run('UPDATE songs SET title = ?, artist = ?, tags_read = 1, updated_at = ? WHERE id = ?', [
      update.title,
      update.artist,
      now,
      update.id
    ])
  }
  persist()
}

export function deleteSong(id: number): void {
  requireDb().run('DELETE FROM songs WHERE id = ?', [id])
  // sql.js has foreign keys off, so the links have to be cleaned up by hand.
  requireDb().run('DELETE FROM collection_songs WHERE song_id = ?', [id])
  persist()
}

function rowToCollection(row: Record<string, unknown>): Collection {
  return {
    id: row.id as number,
    name: row.name as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export function listCollections(): Collection[] {
  return queryRows('SELECT * FROM collections ORDER BY name COLLATE NOCASE').map(rowToCollection)
}

/** Creating a collection whose name already exists returns that one instead of failing, so dropping
 *  songs onto "+ Nueva colección" and typing an existing name just adds them there. */
export function createCollection(name: string): Collection {
  const now = new Date().toISOString()
  requireDb().run('INSERT OR IGNORE INTO collections (name, created_at, updated_at) VALUES (?, ?, ?)', [
    name,
    now,
    now
  ])
  persist()
  const created = queryRows('SELECT * FROM collections WHERE name = ?', [name]).map(rowToCollection)[0]
  if (!created) throw new Error('Failed to read back created collection')
  return created
}

export function renameCollection(id: number, name: string): void {
  requireDb().run('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    new Date().toISOString(),
    id
  ])
  persist()
}

/** Drops the collection and its links; the songs themselves stay in the library. */
export function deleteCollection(id: number): void {
  requireDb().run('DELETE FROM collections WHERE id = ?', [id])
  requireDb().run('DELETE FROM collection_songs WHERE collection_id = ?', [id])
  persist()
}

export function listCollectionMembers(): CollectionMember[] {
  return queryRows('SELECT collection_id, song_id FROM collection_songs').map((row) => ({
    collectionId: row.collection_id as number,
    songId: row.song_id as number
  }))
}

export function addSongsToCollection(collectionId: number, songIds: number[]): void {
  const now = new Date().toISOString()
  for (const songId of songIds) {
    requireDb().run(
      'INSERT OR IGNORE INTO collection_songs (collection_id, song_id, added_at) VALUES (?, ?, ?)',
      [collectionId, songId, now]
    )
  }
  persist()
}

export function removeSongsFromCollection(collectionId: number, songIds: number[]): void {
  for (const songId of songIds) {
    requireDb().run('DELETE FROM collection_songs WHERE collection_id = ? AND song_id = ?', [
      collectionId,
      songId
    ])
  }
  persist()
}
