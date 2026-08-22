import { describe, expect, it } from 'vitest'
import { splitArtistTitle } from './fileNameTags'

describe('splitArtistTitle', () => {
  it('splits the usual "Autor - Título" filename', () => {
    expect(splitArtistTitle('Aleks & Could - Storm.mp3')).toEqual({
      artist: 'Aleks & Could',
      title: 'Storm'
    })
  })

  it('splits filenames that use underscores around the dash', () => {
    expect(splitArtistTitle('Kygo_-_Here_for_You_ft._Ella_Henderson.mp3')).toEqual({
      artist: 'Kygo',
      title: 'Here_for_You_ft._Ella_Henderson'
    })
  })

  it('splits on an en dash, which some downloads use', () => {
    expect(splitArtistTitle('Miami_Dub_Machine_–_Mawby_(The_Cube_Guys_Mix).mp3')).toEqual({
      artist: 'Miami_Dub_Machine',
      title: 'Mawby_(The_Cube_Guys_Mix)'
    })
  })

  it('splits on the first separator only, so the title keeps its own dashes', () => {
    expect(splitArtistTitle('Dr. Rude - Hardstyle - Original Mix.mp3')).toEqual({
      artist: 'Dr. Rude',
      title: 'Hardstyle - Original Mix'
    })
  })

  it('leaves the artist empty when there is no separator', () => {
    expect(splitArtistTitle('makinaza.mp3')).toEqual({ artist: '', title: 'makinaza' })
  })

  it('drops only the final extension', () => {
    expect(splitArtistTitle('Artist - Track 1.2 (Remix).flac')).toEqual({
      artist: 'Artist',
      title: 'Track 1.2 (Remix)'
    })
  })

  it('ignores a hyphen with no spaces around it, which is part of a word', () => {
    expect(splitArtistTitle('non-stop makina.mp3')).toEqual({ artist: '', title: 'non-stop makina' })
  })

  it('trims the whitespace around both halves', () => {
    expect(splitArtistTitle('Artist   -   Title.mp3')).toEqual({ artist: 'Artist', title: 'Title' })
  })
})
