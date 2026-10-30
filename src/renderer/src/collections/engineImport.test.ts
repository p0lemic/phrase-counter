import { describe, expect, it } from 'vitest'
import { linkedPathsToRegrid, matchTrackPaths } from './engineImport'
import type { SongRecord } from '../../../shared/song'

function song(id: number, filePath: string, overrides: Partial<SongRecord> = {}): SongRecord {
  return {
    id,
    filePath,
    title: filePath.split('/').pop() ?? filePath,
    artist: 'Un artista',
    tagsRead: true,
    gridSource: 'detected',
    bpm: 170,
    durationMs: 1000,
    phraseTimesSec: [],
    blocks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
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

describe('linkedPathsToRegrid', () => {
  const analyzed = (id: number, path: string, gridSource: SongRecord['gridSource']): SongRecord =>
    song(id, path, { gridSource, phraseTimesSec: [0, 11.3] })

  it('re-analyzes a song of ours whose grid we detected but Engine has one for', () => {
    const songs = [analyzed(1, '/m/a.mp3', 'detected')]
    expect(linkedPathsToRegrid([1], songs, new Set(['/m/a.mp3']))).toEqual(['/m/a.mp3'])
  })

  it('leaves a song that already uses Engine\'s grid alone', () => {
    const songs = [analyzed(1, '/m/a.mp3', 'engine')]
    expect(linkedPathsToRegrid([1], songs, new Set(['/m/a.mp3']))).toEqual([])
  })

  it('leaves a detected grid alone when Engine has never analyzed the track', () => {
    const songs = [analyzed(1, '/m/a.mp3', 'detected')]
    expect(linkedPathsToRegrid([1], songs, new Set())).toEqual([])
  })

  it('still picks up a song with no grid at all, Engine grid or not', () => {
    const songs = [song(1, '/m/a.mp3'), song(2, '/m/b.mp3')]
    expect(linkedPathsToRegrid([1, 2], songs, new Set(['/m/a.mp3']))).toEqual(['/m/a.mp3', '/m/b.mp3'])
  })

  it('ignores ids the library no longer holds', () => {
    expect(linkedPathsToRegrid([9], [analyzed(1, '/m/a.mp3', 'detected')], new Set(['/m/a.mp3']))).toEqual([])
  })
})
