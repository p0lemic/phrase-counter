import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import initSqlJs, { type Database } from 'sql.js'
import type { NewSongRecord, SongRecord } from '../shared/song'

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
      blocks TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  persist()
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
    `INSERT INTO songs (file_path, title, bpm, duration_ms, blocks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [song.filePath, song.title, song.bpm, song.durationMs, JSON.stringify(song.blocks), now, now]
  )
  persist()
  const created = findSongByFilePath(song.filePath)
  if (!created) throw new Error('Failed to read back inserted song')
  return created
}

export function updateSongBlocks(id: number, blocks: SongRecord['blocks']): void {
  requireDb().run('UPDATE songs SET blocks = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(blocks),
    new Date().toISOString(),
    id
  ])
  persist()
}

export function deleteSong(id: number): void {
  requireDb().run('DELETE FROM songs WHERE id = ?', [id])
  persist()
}
