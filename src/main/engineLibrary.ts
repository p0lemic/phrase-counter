import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { flattenPlaylistNames, resolveTrackPath, type EnginePlaylistRow } from './engineImport'
import type { EngineLibrary, EnginePlaylist } from '../shared/engine'

export const DEFAULT_ENGINE_LIBRARY_DIR = join(homedir(), 'Music', 'Engine Library')

function rows(db: import('sql.js').Database, sql: string): unknown[][] {
  const result = db.exec(sql)
  return result.length === 0 ? [] : result[0].values
}

/** Reads Engine DJ's own SQLite library. Strictly read-only: the file is loaded into memory and
 *  never written back, so it's safe to run against the library Engine itself uses. The whole file
 *  (hundreds of MB on a big collection) is held only for the duration of this call. */
export async function readEngineLibrary(libraryDir: string): Promise<EngineLibrary> {
  const dbPath = join(libraryDir, 'Database2', 'm.db')
  if (!existsSync(dbPath)) {
    throw new Error(`No se encontró la base de datos de Engine DJ en ${dbPath}`)
  }

  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(dbPath))
  try {
    // Engine stamps every playlist entry with the database it came from. A library that has ever
    // seen a USB drive or another device carries their entries too, and their track ids index THAT
    // database — resolved against ours they land on unrelated songs. Only local entries are ours.
    const localDatabaseUuid = rows(db, 'SELECT uuid FROM Information')[0]?.[0] as string | undefined

    const playlistRows: EnginePlaylistRow[] = rows(db, 'SELECT id, parentListId, title FROM Playlist').map(
      (row) => ({ id: row[0] as number, parentListId: row[1] as number, title: (row[2] as string) ?? '' })
    )
    const names = flattenPlaylistNames(playlistRows)

    const pathByTrackId = new Map<number, string>()
    for (const row of rows(db, "SELECT id, path FROM Track WHERE path IS NOT NULL AND path <> ''")) {
      const resolved = resolveTrackPath(libraryDir, row[1] as string)
      if (resolved) pathByTrackId.set(row[0] as number, resolved)
    }

    const trackIdsByList = new Map<number, number[]>()
    for (const row of rows(db, 'SELECT listId, trackId, databaseUuid FROM PlaylistEntity WHERE trackId > 0')) {
      // Undefined uuid (a library too old to record one) means everything is local.
      if (localDatabaseUuid && row[2] !== localDatabaseUuid) continue
      const trackId = row[1] as number
      // Streaming entries and rows pointing at deleted tracks have no path to match against.
      if (!pathByTrackId.has(trackId)) continue
      const listId = row[0] as number
      const existing = trackIdsByList.get(listId)
      if (existing) existing.push(trackId)
      else trackIdsByList.set(listId, [trackId])
    }

    const playlists: EnginePlaylist[] = playlistRows.map((row) => ({
      id: row.id,
      name: names.get(row.id) ?? row.title,
      isRoot: row.parentListId === 0,
      trackIds: trackIdsByList.get(row.id) ?? []
    }))

    // Only the tracks some playlist actually references are worth sending to the renderer.
    const referenced = new Set(playlists.flatMap((playlist) => playlist.trackIds))
    const trackPaths: Record<number, string> = {}
    for (const trackId of referenced) trackPaths[trackId] = pathByTrackId.get(trackId) as string

    return { libraryDir, playlists, trackPaths }
  } finally {
    db.close()
  }
}
