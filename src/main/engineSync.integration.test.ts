import { afterAll, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { syncToEngine, engineDatabasePath, titleWithoutStructure } from './engineSync'
import { resolveTrackPath } from './engineImport'
import { decodeQuickCues, decodeSampleRate } from './engineCues'
import { formatBlocks } from '../shared/formatBlocks'
import type { SongRecord } from '../shared/song'

/**
 * Runs the real sync against a *copy* of a real Engine DJ library, which is the only way to know
 * the whole thing works end to end: sql.js coping with a multi-hundred-megabyte database, the path
 * matching, and cues landing where our phrase grid says they should.
 *
 * Opt in by pointing it at a library folder — it is skipped everywhere else, since it needs data
 * this repository cannot ship:
 *
 *   PHRASE_COUNTER_ENGINE_LIBRARY="$HOME/Music/Engine Library" \
 *   PHRASE_COUNTER_LIBRARY="$HOME/Library/Application Support/phrase-counter/phrase-counter.sqlite" \
 *   npx vitest run src/main/engineSync.integration.test.ts
 */
const engineLibrary = process.env['PHRASE_COUNTER_ENGINE_LIBRARY']
const ourLibrary = process.env['PHRASE_COUNTER_LIBRARY']
const enabled = Boolean(engineLibrary && ourLibrary && existsSync(engineDatabasePath(engineLibrary)))

const workDir = enabled ? mkdtempSync(join(tmpdir(), 'phrase-counter-engine-')) : null

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true })
})

async function openDb(path: string): Promise<import('sql.js').Database> {
  const SQL = await initSqlJs()
  return new SQL.Database(readFileSync(path))
}

/** A copy of the Engine database, so the real one is never touched. The library folder itself stays
 *  the real one: Engine's track paths are relative to it, and resolving them anywhere else matches
 *  nothing. */
let stagedCount = 0
function stageDatabase(): string {
  const stagedPath = join(workDir!, `m-${stagedCount++}.db`)
  mkdirSync(dirname(stagedPath), { recursive: true })
  copyFileSync(engineDatabasePath(engineLibrary!), stagedPath)
  return stagedPath
}

async function loadOurSongs(limit: number): Promise<SongRecord[]> {
  const db = await openDb(ourLibrary!)
  try {
    const result = db.exec(
      `SELECT file_path, title, artist, bpm, duration_ms, blocks, phrase_times_sec
       FROM songs ORDER BY id LIMIT ${limit}`
    )
    if (result.length === 0) return []
    return result[0].values.map((row) => ({
      id: 0,
      filePath: row[0] as string,
      title: (row[1] as string) ?? '',
      artist: (row[2] as string) ?? '',
      tagsRead: true,
      bpm: row[3] as number,
      durationMs: row[4] as number,
      blocks: JSON.parse(row[5] as string),
      phraseTimesSec: JSON.parse(row[6] as string),
      createdAt: '',
      updatedAt: ''
    }))
  } finally {
    db.close()
  }
}

describe.skipIf(!enabled)('syncToEngine against a real library copy', () => {
  it('writes comments, titles and cues, and puts the cues where the phrase grid says', async () => {
    const databasePath = stageDatabase()
    const songs = await loadOurSongs(300)
    expect(songs.length).toBeGreaterThan(0)

    const dryRun = await syncToEngine(songs, {
      libraryDir: engineLibrary!,
      databasePath,
      writeComment: true,
      writeTitle: true,
      writeCues: true,
      dryRun: true
    })
    expect(dryRun.matched).toBeGreaterThan(0)
    expect(dryRun.backupPath).toBeNull()

    const applied = await syncToEngine(songs, {
      libraryDir: engineLibrary!,
      databasePath,
      writeComment: true,
      writeTitle: true,
      writeCues: true,
      dryRun: false
    })
    expect(applied.matched).toBe(dryRun.matched)
    expect(applied.commentsWritten).toBe(dryRun.commentsWritten)

    // Read the staged database back and check what actually landed in it.
    const db = await openDb(databasePath)
    try {
      const byPath = new Map(songs.map((song) => [song.filePath, song]))
      let checkedCues = 0
      let checkedTitles = 0

      const rows = db.exec(
        `SELECT t.path, t.title, t.comment, p.quickCues, p.trackData
         FROM Track t JOIN PerformanceData p ON p.trackId = t.id
         WHERE t.comment IS NOT NULL AND t.comment <> ''`
      )
      for (const row of rows[0]?.values ?? []) {
        const resolved = resolveTrackPath(engineLibrary!, row[0] as string)
        const song = resolved ? byPath.get(resolved) : undefined
        if (!song) continue
        const structure = formatBlocks(song.blocks)
        if (!structure) continue

        expect(row[2]).toBe(structure)
        expect(titleWithoutStructure(row[1] as string)).not.toContain('[PC ')
        expect(row[1] as string).toContain(`[PC ${structure}]`)
        checkedTitles += 1

        const trackData = row[4]
        const quickCues = row[3]
        if (!(trackData instanceof Uint8Array) || !(quickCues instanceof Uint8Array)) continue
        const sampleRate = decodeSampleRate(Buffer.from(trackData))
        if (sampleRate === null) continue

        const { cues } = decodeQuickCues(Buffer.from(quickCues))
        const placed = cues.filter(Boolean)
        expect(placed.length).toBe(Math.min(song.blocks.length, 8))

        // Every cue must sit exactly on one of our phrase boundaries, to the sample.
        const expected = new Set(
          song.phraseTimesSec.map((seconds) => Math.round(seconds * sampleRate))
        )
        for (const cue of placed) expect(expected.has(cue!.positionSamples)).toBe(true)
        checkedCues += 1
      }

      expect(checkedTitles).toBeGreaterThan(0)
      expect(checkedCues).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  }, 600_000)

  it('is idempotent — syncing twice leaves one title suffix, not two', async () => {
    const databasePath = stageDatabase()
    const songs = await loadOurSongs(50)
    const options = {
      libraryDir: engineLibrary!,
      databasePath,
      writeComment: true,
      writeTitle: true,
      writeCues: false,
      dryRun: false
    }
    const first = await syncToEngine(songs, options)
    expect(first.matched).toBeGreaterThan(0)
    expect(first.titlesWritten).toBeGreaterThan(0)

    const second = await syncToEngine(songs, options)
    // Nothing left to change in the titles the first pass already wrote.
    expect(second.matched).toBe(first.matched)
    expect(second.titlesWritten).toBe(0)

    const db = await openDb(databasePath)
    try {
      const rows = db.exec("SELECT title FROM Track WHERE title LIKE '%[PC %'")
      for (const row of rows[0]?.values ?? []) {
        expect((row[0] as string).match(/\[PC /g)).toHaveLength(1)
      }
    } finally {
      db.close()
    }
  }, 600_000)
})
