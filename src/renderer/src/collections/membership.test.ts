import { describe, expect, it } from 'vitest'
import { countSongsByCollection, resolveDragIds, songsInCollection } from './membership'
import type { CollectionMember } from '../../../shared/collection'
import type { SongRecord } from '../../../shared/song'

function song(id: number, title: string): SongRecord {
  return {
    id,
    filePath: `/music/${title}.mp3`,
    title,
    artist: 'Un artista',
    tagsRead: true,
    bpm: 170,
    durationMs: 300_000,
    phraseTimesSec: [],
    blocks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const songs = [song(1, 'a'), song(2, 'b'), song(3, 'c')]

const members: CollectionMember[] = [
  { collectionId: 10, songId: 1 },
  { collectionId: 10, songId: 3 },
  { collectionId: 20, songId: 3 }
]

describe('songsInCollection', () => {
  it('returns every song when no collection is active', () => {
    expect(songsInCollection(songs, members, null)).toEqual(songs)
  })

  it('keeps only the songs linked to the active collection', () => {
    expect(songsInCollection(songs, members, 10).map((s) => s.id)).toEqual([1, 3])
  })

  it('preserves the order of the incoming song list', () => {
    const reversed = [...songs].reverse()
    expect(songsInCollection(reversed, members, 10).map((s) => s.id)).toEqual([3, 1])
  })

  it('returns nothing for a collection with no songs', () => {
    expect(songsInCollection(songs, members, 99)).toEqual([])
  })
})

describe('countSongsByCollection', () => {
  it('counts the songs of each collection', () => {
    const counts = countSongsByCollection(members)
    expect(counts.get(10)).toBe(2)
    expect(counts.get(20)).toBe(1)
  })

  it('reports a collection with no members as undefined, not zero', () => {
    expect(countSongsByCollection(members).get(99)).toBeUndefined()
  })
})

describe('resolveDragIds', () => {
  it('drags the whole selection when the dragged row is part of it', () => {
    expect(resolveDragIds(1, new Set([1, 2]))).toEqual([1, 2])
  })

  it('drags only the dragged row when it is not selected', () => {
    expect(resolveDragIds(3, new Set([1, 2]))).toEqual([3])
  })

  it('drags only the dragged row when nothing is selected', () => {
    expect(resolveDragIds(3, new Set())).toEqual([3])
  })
})
