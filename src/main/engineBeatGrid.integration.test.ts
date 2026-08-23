import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { readEngineLibrary } from './engineLibrary'
import { engineDatabasePath } from './engineSync'
import { phraseTimesFromEngineGrid } from '../shared/phraseGrid'
import type { EngineGrid } from '../shared/engine'

/**
 * Measures, against real libraries, how far our phrase lines sit from the beats Engine DJ plays
 * to — the whole point of reading Engine's grid in the first place.
 *
 * Opt in by pointing it at both libraries; it is skipped everywhere else, since it needs data this
 * repository cannot ship:
 *
 *   PHRASE_COUNTER_ENGINE_LIBRARY="$HOME/Music/Engine Library" \
 *   PHRASE_COUNTER_LIBRARY="$HOME/Library/Application Support/phrase-counter/phrase-counter.sqlite" \
 *   npx vitest run src/main/engineBeatGrid.integration.test.ts
 */
const engineLibrary = process.env['PHRASE_COUNTER_ENGINE_LIBRARY']
const ourLibrary = process.env['PHRASE_COUNTER_LIBRARY']
const enabled = Boolean(
  engineLibrary && ourLibrary && existsSync(engineDatabasePath(engineLibrary)) && existsSync(ourLibrary)
)

interface OurSong {
  filePath: string
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
}

async function loadOurSongs(): Promise<OurSong[]> {
  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(ourLibrary!))
  try {
    const result = db.exec('SELECT file_path, bpm, duration_ms, phrase_times_sec FROM songs')
    if (result.length === 0) return []
    return result[0].values.map((row) => ({
      filePath: row[0] as string,
      bpm: row[1] as number,
      durationSec: (row[2] as number) / 1000,
      phraseTimesSec: JSON.parse(row[3] as string) as number[]
    }))
  } finally {
    db.close()
  }
}

/** How far a phrase line sits from the nearest beat of Engine's grid, in milliseconds. */
function offBeatMs(timeSec: number, grid: EngineGrid): number {
  const beat = (timeSec - grid.beat0Sec) / grid.beatIntervalSec
  return Math.abs(beat - Math.round(beat)) * grid.beatIntervalSec * 1000
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

describe.skipIf(!enabled)('phrase grids against a real Engine library', () => {
  it('lands every phrase line on a beat Engine plays to', async () => {
    const engine = await readEngineLibrary(engineLibrary!)
    const songs = await loadOurSongs()
    const matched = songs.filter((song) => engine.grids[song.filePath] && song.phraseTimesSec.length > 0)

    expect(matched.length).toBeGreaterThan(50)

    const before: number[] = []
    const after: number[] = []
    for (const song of matched) {
      const grid = engine.grids[song.filePath]
      before.push(offBeatMs(song.phraseTimesSec[0], grid))
      for (const time of phraseTimesFromEngineGrid(grid, song.durationSec)) {
        after.push(offBeatMs(time, grid))
      }
    }

    // Detected grids miss Engine's beats by tens of milliseconds; rebuilt ones cannot miss at all,
    // since every line is generated from the grid itself.
    console.log(
      `${matched.length} canciones · desvío mediano antes ${median(before).toFixed(1)} ms, ` +
        `p90 ${[...before].sort((a, b) => a - b)[Math.floor(before.length * 0.9)].toFixed(1)} ms · ` +
        `después máx ${Math.max(...after).toFixed(6)} ms`
    )
    expect(Math.max(...after)).toBeLessThan(0.001)
  })

  it('spreads phrase lines a whole 32 beats apart', async () => {
    const engine = await readEngineLibrary(engineLibrary!)
    const grid = Object.values(engine.grids)[0]
    const times = phraseTimesFromEngineGrid(grid, 300)

    expect(times.length).toBeGreaterThan(5)
    for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeCloseTo(32 * grid.beatIntervalSec, 9)
    }
  })

  it('reads a grid for nearly every track in the library', async () => {
    const engine = await readEngineLibrary(engineLibrary!)
    const SQL = await initSqlJs()
    const db = new SQL.Database(readFileSync(join(engineLibrary!, 'Database2', 'm.db')))
    const analysed = db.exec('SELECT count(*) FROM PerformanceData WHERE beatData IS NOT NULL')[0]
      .values[0][0] as number
    db.close()

    // Every grid we drop is a track that falls back to our own detection, so this ratio is the
    // real reach of the feature.
    expect(Object.keys(engine.grids).length).toBeGreaterThan(analysed * 0.95)
  })
})
