import { describe, expect, it } from 'vitest'
import { flattenPlaylistNames, resolveTrackPath } from './engineImport'

describe('flattenPlaylistNames', () => {
  const rows = [
    { id: 1, parentListId: 0, title: 'Dance' },
    { id: 2, parentListId: 1, title: 'TEMAZOS' },
    { id: 3, parentListId: 0, title: 'Progressive' },
    { id: 4, parentListId: 3, title: 'TEMAZOS' },
    { id: 5, parentListId: 2, title: 'Sub' }
  ]

  it('leaves a root playlist name alone', () => {
    expect(flattenPlaylistNames(rows).get(1)).toBe('Dance')
  })

  it('prefixes a nested playlist with its parent chain', () => {
    expect(flattenPlaylistNames(rows).get(5)).toBe('Dance / TEMAZOS / Sub')
  })

  it('keeps same-titled playlists apart by their parents', () => {
    const names = flattenPlaylistNames(rows)
    expect(names.get(2)).toBe('Dance / TEMAZOS')
    expect(names.get(4)).toBe('Progressive / TEMAZOS')
  })

  it('treats a playlist whose parent is missing as a root one', () => {
    expect(flattenPlaylistNames([{ id: 9, parentListId: 404, title: 'Huérfana' }]).get(9)).toBe('Huérfana')
  })

  it('does not hang on a parent cycle', () => {
    const cyclic = [
      { id: 1, parentListId: 2, title: 'A' },
      { id: 2, parentListId: 1, title: 'B' }
    ]
    expect(flattenPlaylistNames(cyclic).get(1)).toBe('B / A')
  })
})

describe('resolveTrackPath', () => {
  it('resolves a path stored relative to the Engine library folder', () => {
    expect(resolveTrackPath('/Users/dj/Music/Engine Library', '../../Desktop/Musica/a.mp3')).toBe(
      '/Users/dj/Desktop/Musica/a.mp3'
    )
  })

  it('collapses redundant segments', () => {
    expect(resolveTrackPath('/lib', 'Music/./sub/../a.mp3')).toBe('/lib/Music/a.mp3')
  })

  it('leaves an already absolute path alone', () => {
    expect(resolveTrackPath('/lib', '/Volumes/USB/a.mp3')).toBe('/Volumes/USB/a.mp3')
  })

  it('reports an empty path as unusable', () => {
    expect(resolveTrackPath('/lib', '')).toBeNull()
  })
})
