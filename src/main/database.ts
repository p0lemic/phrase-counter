import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import initSqlJs, { type Database } from 'sql.js'
import type { NewSongRecord, SongAnalysisUpdate, SongRecord } from '../shared/song'

export type { NewSongRecord, SongRecord }

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
    bpm: row.bpm as number,
    durationMs: row.duration_ms as number,
    phraseTimesSec: JSON.parse(row.phrase_times_sec as string),
    blocks: JSON.parse(row.blocks as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export function listSongs(): SongRecord[] {
  const result = requireDb().exec('SELECT * FROM songs ORDER BY updated_at DESC')
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map((row) => rowToSong(Object.fromEntries(columns.map((col, i) => [col, row[i]]))))
}

export function findSongByFilePath(filePath: string): SongRecord | undefined {
  return listSongs().find((song) => song.filePath === filePath)
}

export function insertSong(song: NewSongRecord): SongRecord {
  const now = new Date().toISOString()
  requireDb().run(
    `INSERT INTO songs (file_path, title, bpm, duration_ms, phrase_times_sec, blocks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      song.filePath,
      song.title,
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

export function deleteSong(id: number): void {
  requireDb().run('DELETE FROM songs WHERE id = ?', [id])
  persist()
}
