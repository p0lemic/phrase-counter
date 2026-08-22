import { describe, expect, it } from 'vitest'
import { matchTrackPaths } from './engineImport'
import type { SongRecord } from '../../../shared/song'

function song(id: number, filePath: string): SongRecord {
  return {
    id,
    filePath,
    title: filePath.split('/').pop() ?? filePath,
    artist: 'Un artista',
    tagsRead: true,
    bpm: 170,
    durationMs: 1000,
    phraseTimesSec: [],
    blocks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const library = [song(1, '/m/a.mp3'), song(2, '/m/b.mp3')]

describe('matchTrackPaths', () => {
  it('resolves paths already in the library to their song ids', () => {
    expect(matchTrackPaths(['/m/a.mp3', '/m/b.mp3'], library).songIds).toEqual([1, 2])
  })

  it('reports paths the library does not know as missing', () => {
    expect(matchTrackPaths(['/m/a.mp3', '/m/c.mp3'], library).missingPaths).toEqual(['/m/c.mp3'])
  })

  it('counts a path repeated in the playlist only once', () => {
    const result = matchTrackPaths(['/m/a.mp3', '/m/a.mp3', '/m/c.mp3', '/m/c.mp3'], library)
    expect(result.songIds).toEqual([1])
    expect(result.missingPaths).toEqual(['/m/c.mp3'])
  })

  it('returns empty results for an empty playlist', () => {
    expect(matchTrackPaths([], library)).toEqual({ songIds: [], missingPaths: [] })
  })
})
