import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSongTags } from './resolveSongTags'
import type { SongMetadata } from '../../../shared/song'

const EMPTY: SongMetadata = {
  title: null,
  artist: null,
  album: null,
  coverDataUrl: null,
  key: null
}

function stubMetadata(metadata: Partial<SongMetadata> | Error): void {
  const readSongMetadata =
    metadata instanceof Error
      ? vi.fn().mockRejectedValue(metadata)
      : vi.fn().mockResolvedValue({ ...EMPTY, ...metadata })
  vi.stubGlobal('window', { api: { readSongMetadata } })
}

afterEach(() => vi.unstubAllGlobals())

describe('resolveSongTags', () => {
  it('prefers the file tags when they are there', async () => {
    stubMetadata({ title: 'Storm', artist: 'Aleks & Could' })
    await expect(resolveSongTags('/m/whatever.mp3', 'whatever.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks & Could'
    })
  })

  it('falls back to the file name when the file has no tags', async () => {
    stubMetadata({})
    await expect(resolveSongTags('/m/x.mp3', 'Aleks & Could - Storm.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks & Could'
    })
  })

  it('treats a blank tag as missing rather than storing an empty title', async () => {
    stubMetadata({ title: '   ', artist: '' })
    await expect(resolveSongTags('/m/x.mp3', 'Aleks & Could - Storm.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks & Could'
    })
  })

  it('mixes sources per field, keeping a real tag and filling the missing one', async () => {
    stubMetadata({ artist: 'Aleks & Could' })
    await expect(resolveSongTags('/m/x.mp3', 'Someone - Storm.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks & Could'
    })
  })

  it('trims surrounding whitespace off the tags', async () => {
    stubMetadata({ title: ' Storm ', artist: ' Aleks ' })
    await expect(resolveSongTags('/m/x.mp3', 'x.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks'
    })
  })

  it('falls back to the file name when reading the tags throws', async () => {
    stubMetadata(new Error('corrupt file'))
    await expect(resolveSongTags('/m/x.mp3', 'Aleks - Storm.mp3')).resolves.toEqual({
      title: 'Storm',
      artist: 'Aleks'
    })
  })
})
