import { beforeEach, describe, expect, it } from 'vitest'
import { createEngineGridIndex } from './engineGrids'
import type { EngineGrid } from '../../../shared/engine'

const grid = (bpm: number): EngineGrid => ({
  bpm,
  beatIntervalSec: 60 / bpm,
  beat0Sec: 0.1,
  phraseAnchorBeat: 0
})

describe('createEngineGridIndex', () => {
  let reads: number

  beforeEach(() => {
    reads = 0
  })

  const readLibrary = async (): Promise<Record<string, EngineGrid>> => {
    reads++
    return { '/music/one.mp3': grid(170) }
  }

  it('hands back the grid Engine has for a track', async () => {
    const index = createEngineGridIndex(readLibrary)
    expect(await index.gridFor('/music/one.mp3')).toEqual(grid(170))
  })

  it('has no grid for a track Engine has never seen', async () => {
    const index = createEngineGridIndex(readLibrary)
    expect(await index.gridFor('/music/unknown.mp3')).toBeUndefined()
  })

  it('reads the Engine library once however many songs ask for a grid', async () => {
    const index = createEngineGridIndex(readLibrary)

    await Promise.all([
      index.gridFor('/music/one.mp3'),
      index.gridFor('/music/two.mp3'),
      index.gridFor('/music/one.mp3')
    ])

    expect(reads).toBe(1)
  })

  it('analyses without a grid when there is no Engine library to read', async () => {
    const index = createEngineGridIndex(async () => {
      throw new Error('No se encontró la base de datos de Engine DJ')
    })

    expect(await index.gridFor('/music/one.mp3')).toBeUndefined()
  })

  it('gives up on Engine for the rest of the session rather than retrying every song', async () => {
    let attempts = 0
    const index = createEngineGridIndex(async () => {
      attempts++
      throw new Error('No se encontró la base de datos de Engine DJ')
    })

    await index.gridFor('/music/one.mp3')
    await index.gridFor('/music/two.mp3')

    expect(attempts).toBe(1)
  })

  it('counts how many of a batch Engine has a grid for', async () => {
    const index = createEngineGridIndex(readLibrary)

    const known = await index.countKnown(['/music/one.mp3', '/music/two.mp3', '/music/three.mp3'])

    expect(known).toBe(1)
  })

  it('names which of a batch Engine has a grid for', async () => {
    const index = createEngineGridIndex(readLibrary)
    index.prime({ '/music/three.mp3': grid(180) })

    const known = await index.pathsWithGrid(['/music/one.mp3', '/music/two.mp3', '/music/three.mp3'])

    expect([...known].sort()).toEqual(['/music/one.mp3', '/music/three.mp3'])
  })

  it('takes grids handed to it by a caller that already read the library', async () => {
    const index = createEngineGridIndex(readLibrary)
    index.prime({ '/music/three.mp3': grid(180) })

    expect(await index.gridFor('/music/three.mp3')).toEqual(grid(180))
    expect(reads).toBe(0)
  })
})
