import { execFile } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import initSqlJs, { type Database } from 'sql.js'
import { resolveTrackPath } from './engineImport'
import { decodeQuickCues, decodeSampleRate, emptyQuickCues, encodeQuickCues } from './engineCues'
import { planQuickCues } from './engineCuePlan'
import { formatBlocks } from '../shared/formatBlocks'
import type { SongRecord } from '../shared/song'
import type {
  EngineRevertResult,
  EngineSyncRequest,
  EngineSyncResult
} from '../shared/engine'

const execFileAsync = promisify(execFile)

/** Marks the structure we append to Engine's copy of the title. Without a marker, stripping the
 *  old suffix before writing a new one would need a regex over bare brackets, which would happily
 *  eat a real `[2000]` or `[Original Mix]` off someone's track title. */
const TITLE_MARKER = 'PC'
const TITLE_SUFFIX_PATTERN = new RegExp(`\\s*\\[${TITLE_MARKER} [^\\]]*\\]\\s*$`)

export interface EngineSyncOptions extends Omit<EngineSyncRequest, 'libraryDir'> {
  /** The library folder Engine's relative track paths are resolved against. */
  libraryDir: string
  /** Database to write, when it isn't the one inside `libraryDir` — a copy under test. Track paths
   *  still resolve against `libraryDir`, since they were written relative to the real library. */
  databasePath?: string
}

/** Engine keeps `m.db` open while it runs and writes it on its own schedule; replacing the file
 *  underneath it loses whatever it has in memory, or worse. */
export async function isEngineRunning(): Promise<boolean> {
  try {
    // -x so "Engine DJ" doesn't also match some unrelated process that merely mentions it.
    const { stdout } = await execFileAsync('pgrep', ['-x', 'Engine DJ'])
    return stdout.trim().length > 0
  } catch {
    // pgrep exits non-zero when nothing matched, which is the answer we want.
    return false
  }
}

export function engineDatabasePath(libraryDir: string): string {
  return join(libraryDir, 'Database2', 'm.db')
}

/** Adds (or refreshes) the structure on Engine's copy of the title. Idempotent: re-syncing a track
 *  replaces its suffix instead of stacking another one on the end. */
export function titleWithStructure(title: string, structure: string): string {
  const base = title.replace(TITLE_SUFFIX_PATTERN, '')
  return structure ? `${base} [${TITLE_MARKER} ${structure}]` : base
}

export function titleWithoutStructure(title: string): string {
  return title.replace(TITLE_SUFFIX_PATTERN, '')
}

function queryAll(db: Database, sql: string): unknown[][] {
  const result = db.exec(sql)
  return result.length === 0 ? [] : result[0].values
}

/** Engine's own copy of a track, as far as this sync cares. */
interface EngineTrack {
  id: number
  title: string
}

function buildTrackIndex(db: Database, libraryDir: string): Map<string, EngineTrack> {
  const byPath = new Map<string, EngineTrack>()
  for (const row of queryAll(db, "SELECT id, path, title FROM Track WHERE path IS NOT NULL AND path <> ''")) {
    const resolved = resolveTrackPath(libraryDir, row[1] as string)
    if (resolved) byPath.set(resolved, { id: row[0] as number, title: (row[2] as string) ?? '' })
  }
  return byPath
}

function sampleRateFor(db: Database, trackId: number): number | null {
  const stmt = db.prepare('SELECT trackData FROM PerformanceData WHERE trackId = :id')
  try {
    stmt.bind({ ':id': trackId })
    if (!stmt.step()) return null
    const blob = stmt.get()[0]
    return blob instanceof Uint8Array ? decodeSampleRate(Buffer.from(blob)) : null
  } finally {
    stmt.free()
  }
}

function existingQuickCues(db: Database, trackId: number): ReturnType<typeof decodeQuickCues> {
  const stmt = db.prepare('SELECT quickCues FROM PerformanceData WHERE trackId = :id')
  try {
    stmt.bind({ ':id': trackId })
    if (stmt.step()) {
      const blob = stmt.get()[0]
      if (blob instanceof Uint8Array && blob.length > 0) {
        try {
          return decodeQuickCues(Buffer.from(blob))
        } catch {
          // A blob we can't parse is one we shouldn't half-rewrite — start from a clean set instead.
        }
      }
    }
  } finally {
    stmt.free()
  }
  return emptyQuickCues()
}

function run(db: Database, sql: string, params: Record<string, unknown>): void {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params as never)
    stmt.step()
  } finally {
    stmt.free()
  }
}

/** sql.js hands back the whole database as bytes, so the write replaces the file wholesale. Going
 *  through a temp file and an atomic rename means a crash mid-write leaves the original intact. */
function writeDatabaseAtomically(dbPath: string, bytes: Uint8Array): void {
  const tempPath = `${dbPath}.phrase-counter.tmp`
  try {
    writeFileSync(tempPath, bytes)
    const handle = openSync(tempPath, 'r+')
    try {
      fsyncSync(handle)
    } finally {
      closeSync(handle)
    }
    renameSync(tempPath, dbPath)
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath)
    throw error
  }
}

function backupDatabase(dbPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${dbPath}.${stamp}.backup`
  copyFileSync(dbPath, backupPath)
  return backupPath
}

/**
 * Pushes our analysis into Engine DJ's library so it shows up on the controller: the structure into
 * the comment and the track title, and a labelled hot cue on each block boundary.
 *
 * Engine's database is treated as a derived view — our own library stays the source of truth, and
 * a sync can be run again at any time. The title suffix in particular is written only here and not
 * into the mp3, so the file keeps a clean title for every other program.
 */
export async function syncToEngine(
  songs: SongRecord[],
  options: EngineSyncOptions
): Promise<EngineSyncResult> {
  const dbPath = options.databasePath ?? engineDatabasePath(options.libraryDir)
  if (!existsSync(dbPath)) {
    throw new Error(`No se encontró la base de datos de Engine DJ en ${dbPath}`)
  }
  if (!options.dryRun && (await isEngineRunning())) {
    throw new Error('Cierra Engine DJ antes de sincronizar: tiene la base de datos abierta.')
  }

  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(dbPath))
  const result: EngineSyncResult = {
    matched: 0,
    unmatched: 0,
    commentsWritten: 0,
    titlesWritten: 0,
    cuesWritten: 0,
    cuesTruncated: 0,
    cuesSkippedNoSampleRate: 0,
    backupPath: null,
    dryRun: options.dryRun
  }

  try {
    const byPath = buildTrackIndex(db, options.libraryDir)
    db.run('BEGIN TRANSACTION')

    for (const song of songs) {
      const track = byPath.get(song.filePath)
      if (!track) {
        result.unmatched += 1
        continue
      }
      result.matched += 1
      const structure = formatBlocks(song.blocks)
      if (!structure) continue

      if (options.writeComment) {
        result.commentsWritten += 1
        if (!options.dryRun) {
          run(db, 'UPDATE Track SET comment = :comment WHERE id = :id', {
            ':comment': structure,
            ':id': track.id
          })
        }
      }

      if (options.writeTitle) {
        const nextTitle = titleWithStructure(track.title, structure)
        if (nextTitle !== track.title) {
          result.titlesWritten += 1
          if (!options.dryRun) {
            run(db, 'UPDATE Track SET title = :title WHERE id = :id', {
              ':title': nextTitle,
              ':id': track.id
            })
          }
        }
      }

      if (options.writeCues) {
        const sampleRate = sampleRateFor(db, track.id)
        if (sampleRate === null) {
          // Engine fills trackData in when it analyses a track; until then we have no idea what a
          // sample position means for this file, and a guess would put every cue in the wrong place.
          result.cuesSkippedNoSampleRate += 1
        } else {
          if (song.blocks.length > 8) result.cuesTruncated += 1
          result.cuesWritten += 1
          if (!options.dryRun) {
            const current = existingQuickCues(db, track.id)
            const blob = encodeQuickCues({
              ...current,
              cues: planQuickCues(song.blocks, song.phraseTimesSec, sampleRate)
            })
            run(
              db,
              `INSERT INTO PerformanceData (trackId, quickCues) VALUES (:id, :blob)
               ON CONFLICT(trackId) DO UPDATE SET quickCues = :blob`,
              { ':id': track.id, ':blob': blob }
            )
          }
        }
      }
    }

    if (options.dryRun) {
      db.run('ROLLBACK')
      return result
    }

    db.run('COMMIT')
    result.backupPath = backupDatabase(dbPath)
    writeDatabaseAtomically(dbPath, db.export())
    return result
  } finally {
    db.close()
  }
}

/** Undoes what a sync wrote: strips the title suffixes and blanks the cues we placed. Engine's own
 *  comments are left alone — we can't tell ours from one the user typed. */
export async function revertEngineSync(
  songs: SongRecord[],
  libraryDir: string
): Promise<EngineRevertResult> {
  const dbPath = engineDatabasePath(libraryDir)
  if (await isEngineRunning()) {
    throw new Error('Cierra Engine DJ antes de revertir: tiene la base de datos abierta.')
  }

  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(dbPath))
  let titlesReverted = 0
  let cuesCleared = 0

  try {
    const byPath = buildTrackIndex(db, libraryDir)
    db.run('BEGIN TRANSACTION')

    for (const song of songs) {
      const track = byPath.get(song.filePath)
      if (!track) continue

      const stripped = titleWithoutStructure(track.title)
      if (stripped !== track.title) {
        titlesReverted += 1
        run(db, 'UPDATE Track SET title = :title WHERE id = :id', {
          ':title': stripped,
          ':id': track.id
        })
      }

      const current = existingQuickCues(db, track.id)
      const blob = encodeQuickCues({ ...current, cues: emptyQuickCues().cues })
      cuesCleared += 1
      run(db, 'UPDATE PerformanceData SET quickCues = :blob WHERE trackId = :id', {
        ':blob': blob,
        ':id': track.id
      })
    }

    db.run('COMMIT')
    const backupPath = backupDatabase(dbPath)
    writeDatabaseAtomically(dbPath, db.export())
    return { titlesReverted, cuesCleared, backupPath }
  } finally {
    db.close()
  }
}
