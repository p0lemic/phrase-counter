import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { decodeBeatGrid } from './engineBeatGrid'
import { decodeQuickCues, decodeSampleRate, mainCueSamples } from './engineCues'
import fixtures from './__fixtures__/engineBeatGrids.json'

/** Real blobs lifted out of an Engine DJ 3.0.2 library, picked to cover every shape that library
 *  contained: 22.05/44.1/48 kHz, tracks whose adjusted grid has been nudged away from the analysed
 *  one, tracks with a main cue on beat 0, on a later beat, and with none at all. */
const samples = fixtures.map((fixture) => ({
  ...fixture,
  beatData: Buffer.from(fixture.beatData, 'base64'),
  trackData: Buffer.from(fixture.trackData, 'base64'),
  quickCues: fixture.quickCues === null ? null : Buffer.from(fixture.quickCues, 'base64')
}))

const gridOf = (fixture: (typeof samples)[number]) => decodeBeatGrid(fixture.beatData, fixture.quickCues)

/** Builds a beatData blob from scratch, for the malformed cases no real track exhibits. */
function buildBeatData(options: {
  sampleRate?: number
  isSet?: number
  markers?: { sampleOffset: number; beatNumber: number }[]
}): Buffer {
  const { sampleRate = 44100, isSet = 1, markers = [] } = options
  const header = Buffer.alloc(17)
  header.writeDoubleBE(sampleRate, 0)
  header.writeDoubleBE(sampleRate * 100, 8)
  header.writeUInt8(isSet, 16)

  const grid = (): Buffer => {
    const count = Buffer.alloc(8)
    count.writeBigUInt64BE(BigInt(markers.length))
    const entries = markers.map(({ sampleOffset, beatNumber }) => {
      const entry = Buffer.alloc(24)
      entry.writeDoubleLE(sampleOffset, 0)
      entry.writeBigInt64LE(BigInt(beatNumber), 8)
      return entry
    })
    return Buffer.concat([count, ...entries])
  }

  const body = Buffer.concat([header, grid(), grid(), Buffer.alloc(9)])
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.length)
  return Buffer.concat([prefix, deflateSync(body)])
}

/** Engine writes a quickCues blob for every analysed track; what varies is whether the main cue
 *  inside it is set. Tracks without one are the common case — 24,096 of 24,317. */
const hasMainCue = (fixture: (typeof samples)[number]): boolean =>
  fixture.quickCues !== null && mainCueSamples(decodeQuickCues(fixture.quickCues)) !== null

describe('fixtures', () => {
  it('cover several sample rates, nudged grids and main cue placements', () => {
    const sampleRates = new Set(samples.map((sample) => decodeSampleRate(sample.trackData)))
    expect(sampleRates.size).toBeGreaterThanOrEqual(3)
    expect(samples.filter(hasMainCue).length).toBeGreaterThan(3)
    expect(samples.filter((sample) => !hasMainCue(sample)).length).toBeGreaterThan(3)
  })
})

describe('decodeBeatGrid', () => {
  it("reads the tempo Engine itself recorded in Track.bpmAnalyzed", () => {
    for (const sample of samples) {
      const grid = gridOf(sample)
      expect(grid, sample.name).not.toBeNull()
      // bpmAnalyzed comes from a different table than the blob, so agreeing to six decimals pins
      // down the sample rate, the marker offsets and the beat numbers all at once.
      expect(grid!.bpm, sample.name).toBeCloseTo(sample.bpmAnalyzed, 6)
    }
  })

  it('derives the beat interval from the tempo', () => {
    for (const sample of samples) {
      const grid = gridOf(sample)!
      expect(grid.beatIntervalSec, sample.name).toBeCloseTo(60 / sample.bpmAnalyzed, 9)
    }
  })

  it('places beat 0 within the first couple of seconds of the track', () => {
    for (const sample of samples) {
      const grid = gridOf(sample)!
      expect(grid.beat0Sec, sample.name).toBeGreaterThanOrEqual(-0.001)
      expect(grid.beat0Sec, sample.name).toBeLessThan(2.5)
    }
  })

  it('uses the nudged grid, not the analysed one: main cues land exactly on a beat', () => {
    for (const sample of samples.filter(hasMainCue)) {
      const cueSamples = mainCueSamples(decodeQuickCues(sample.quickCues!))!
      const grid = gridOf(sample)!
      const cueSec = cueSamples / decodeSampleRate(sample.trackData)!
      const beat = (cueSec - grid.beat0Sec) / grid.beatIntervalSec
      const offBeatMs = Math.abs(beat - Math.round(beat)) * grid.beatIntervalSec * 1000
      // Off the analysed grid these same cues sit 106-212 ms out; on the nudged one they are exact.
      expect(offBeatMs, sample.name).toBeLessThan(1)
    }
  })

  it('anchors phrases on the beat the main cue sits on', () => {
    // Floorfilla - The Hypno: its main cue is a full bar into the track, not on beat 0.
    const grid = gridOf(samples.find((sample) => sample.trackId === 1692)!)!
    expect(grid.phraseAnchorBeat).toBe(4)
  })

  it('anchors phrases on beat 0 when the track has no main cue', () => {
    for (const sample of samples.filter((candidate) => !hasMainCue(candidate))) {
      expect(gridOf(sample)!.phraseAnchorBeat, sample.name).toBe(0)
    }
  })

  it('rejects a grid Engine never analysed', () => {
    const blob = buildBeatData({
      isSet: 0,
      markers: [
        { sampleOffset: 0, beatNumber: 0 },
        { sampleOffset: 44100, beatNumber: 2 }
      ]
    })
    expect(decodeBeatGrid(blob, null)).toBeNull()
  })

  it('rejects a grid with a single marker, which fixes no tempo', () => {
    const blob = buildBeatData({ markers: [{ sampleOffset: 0, beatNumber: 0 }] })
    expect(decodeBeatGrid(blob, null)).toBeNull()
  })

  it('rejects a tempo no track really has', () => {
    const blob = buildBeatData({
      markers: [
        { sampleOffset: 0, beatNumber: 0 },
        { sampleOffset: 44100, beatNumber: 300 }
      ]
    })
    expect(decodeBeatGrid(blob, null)).toBeNull()
  })

  it('rejects a blob it cannot read at all', () => {
    expect(decodeBeatGrid(Buffer.from([1, 2, 3]), null)).toBeNull()
  })

  it('falls back to beat 0 when the main cue blob is unreadable', () => {
    const sample = samples.find((candidate) => candidate.quickCues !== null)!
    const grid = decodeBeatGrid(sample.beatData, Buffer.from([9, 9, 9]))
    expect(grid!.phraseAnchorBeat).toBe(0)
  })
})
