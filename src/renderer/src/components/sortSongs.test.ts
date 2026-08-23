import { describe, expect, it } from 'vitest'
import { nextSort, sortSongs } from './sortSongs'
import type { SongRecord } from '../../../shared/song'

function song(id: number, artist: string, title: string, bpm = 170, durationMs = 1000): SongRecord {
  return {
    id,
    filePath: `/m/${id}.mp3`,
    title,
    artist,
    tagsRead: true,
    gridSource: 'detected',
    bpm,
    durationMs,
    phraseTimesSec: [],
    blocks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

// Deliberately out of every order: id, title and artist all disagree.
const songs = [song(3, 'Zeta', 'Alfa', 180, 300), song(1, 'Alfa', 'Zeta', 160, 100), song(2, 'Mu', 'Mu', 170, 200)]

describe('sortSongs with no sorting', () => {
  it('falls back to the order songs entered the library', () => {
    expect(sortSongs(songs, null).map((s) => s.id)).toEqual([1, 2, 3])
  })

  it('keeps that order no matter how the list arrives', () => {
    expect(sortSongs([...songs].reverse(), null).map((s) => s.id)).toEqual([1, 2, 3])
  })

  it('leaves the caller\'s array untouched', () => {
    const original = [...songs]
    sortSongs(songs, null)
    expect(songs).toEqual(original)
  })
})

describe('sortSongs by column', () => {
  it('sorts by title ascending', () => {
    expect(sortSongs(songs, { key: 'title', direction: 'asc' }).map((s) => s.title)).toEqual([
      'Alfa',
      'Mu',
      'Zeta'
    ])
  })

  it('sorts by artist descending', () => {
    expect(sortSongs(songs, { key: 'artist', direction: 'desc' }).map((s) => s.artist)).toEqual([
      'Zeta',
      'Mu',
      'Alfa'
    ])
  })

  it('sorts numeric columns as numbers', () => {
    expect(sortSongs(songs, { key: 'bpm', direction: 'asc' }).map((s) => s.bpm)).toEqual([160, 170, 180])
  })

  it('sorts duration descending', () => {
    expect(sortSongs(songs, { key: 'durationMs', direction: 'desc' }).map((s) => s.durationMs)).toEqual([
      300, 200, 100
    ])
  })
})

describe('nextSort', () => {
  it('starts a fresh column ascending', () => {
    expect(nextSort(null, 'title')).toEqual({ key: 'title', direction: 'asc' })
  })

  it('flips the active column to descending', () => {
    expect(nextSort({ key: 'title', direction: 'asc' }, 'title')).toEqual({
      key: 'title',
      direction: 'desc'
    })
  })

  it('clears the sorting on the third click, back to library order', () => {
    expect(nextSort({ key: 'title', direction: 'desc' }, 'title')).toBeNull()
  })

  it('switching column starts that one ascending', () => {
    expect(nextSort({ key: 'title', direction: 'desc' }, 'bpm')).toEqual({ key: 'bpm', direction: 'asc' })
  })
})
