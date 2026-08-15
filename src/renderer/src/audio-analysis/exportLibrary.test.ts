import { describe, expect, test } from 'vitest'
import { songsToCsv, songsToJson } from './exportLibrary'
import type { SongRecord } from '../../../shared/song'

const song: SongRecord = {
  id: 1,
  filePath: '/Users/javier/Music/Makina Feria.mp3',
  title: 'Makina Feria.mp3',
  bpm: 170.4,
  durationMs: 37433,
  blocks: [
    { phraseCount: 4, isBreakdown: false },
    { phraseCount: 6, isBreakdown: true }
  ],
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:05:00.000Z'
}

describe('songsToCsv', () => {
  test('includes a header row and one row per song with the formatted result', () => {
    const csv = songsToCsv([song])
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe('title,bpm,result,duration_sec,file_path')
    expect(lines[1]).toBe('Makina Feria.mp3,170,4+(6),37,/Users/javier/Music/Makina Feria.mp3')
  })

  test('quotes fields that contain a comma', () => {
    const csv = songsToCsv([{ ...song, title: 'Track, Remix' }])
    const lines = csv.trim().split('\n')

    expect(lines[1]).toContain('"Track, Remix"')
  })

  test('returns just the header for an empty library', () => {
    expect(songsToCsv([]).trim()).toBe('title,bpm,result,duration_sec,file_path')
  })
})

describe('songsToJson', () => {
  test('serializes songs with their formatted result included', () => {
    const json = songsToJson([song])
    const parsed = JSON.parse(json)

    expect(parsed).toEqual([
      {
        title: 'Makina Feria.mp3',
        bpm: 170.4,
        result: '4+(6)',
        durationSec: 37.433,
        filePath: '/Users/javier/Music/Makina Feria.mp3'
      }
    ])
  })
})
