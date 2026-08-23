import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import {
  decodeQuickCues,
  decodeSampleRate,
  emptyQuickCues,
  mainCueSamples,
  encodeQuickCues,
  QUICK_CUE_COUNT,
  TRAILER_LENGTH
} from './engineCues'
import fixtures from './__fixtures__/engineQuickCues.json'

/** Real blobs lifted out of an Engine DJ 3.0.2 library, covering every combination of trailer
 *  length, sample rate and number of cues in use that library contained. They are what pins the
 *  format down — the rest of the sync writes whatever these say Engine expects. */
const samples = fixtures.map((fixture) => ({
  ...fixture,
  quickCues: Buffer.from(fixture.quickCues, 'base64'),
  trackData: Buffer.from(fixture.trackData, 'base64')
}))

/** The compressed bytes are free to differ — Engine reads them through zlib, and our deflate need
 *  not match theirs. The decompressed body is the part that has to survive exactly. */
function body(blob: Buffer): Buffer {
  return inflateSync(blob.subarray(4))
}

describe('quickCues codec', () => {
  it('has fixtures covering several sample rates and cue counts', () => {
    expect(samples.length).toBeGreaterThan(5)
    expect(new Set(samples.map((s) => s.sampleRate)).size).toBeGreaterThan(1)
    expect(new Set(samples.map((s) => s.cuesUsed)).size).toBeGreaterThan(1)
  })

  it.each(samples.map((s, i) => [i, s] as const))(
    'round-trips fixture %i byte for byte',
    (_index, sample) => {
      const decoded = decodeQuickCues(sample.quickCues)
      expect(body(encodeQuickCues(decoded))).toEqual(body(sample.quickCues))
    }
  )

  it.each(samples.map((s, i) => [i, s] as const))(
    'decodes fixture %i to the cue count it claims',
    (_index, sample) => {
      const { cues, trailer } = decodeQuickCues(sample.quickCues)
      expect(cues).toHaveLength(QUICK_CUE_COUNT)
      expect(cues.filter(Boolean)).toHaveLength(sample.cuesUsed)
      expect(trailer).toHaveLength(TRAILER_LENGTH)
    }
  )

  it('keeps positions inside the track and labels intact', () => {
    const withCues = samples.find((sample) => sample.cuesUsed === QUICK_CUE_COUNT)
    expect(withCues).toBeDefined()
    for (const cue of decodeQuickCues(withCues!.quickCues).cues) {
      expect(cue).not.toBeNull()
      expect(cue!.positionSamples).toBeGreaterThanOrEqual(0)
      expect(cue!.label.length).toBeGreaterThan(0)
    }
  })

  it('re-encodes cues we replaced ourselves', () => {
    const decoded = decodeQuickCues(samples[0].quickCues)
    const replaced = {
      ...decoded,
      cues: [
        { label: '8', positionSamples: 441000, colorArgb: 0xff1571e2 },
        { label: '(4)', positionSamples: 882000, colorArgb: 0xffef8130 },
        ...new Array(QUICK_CUE_COUNT - 2).fill(null)
      ]
    }
    const roundTripped = decodeQuickCues(encodeQuickCues(replaced))
    expect(roundTripped.cues[0]).toEqual(replaced.cues[0])
    expect(roundTripped.cues[1]).toEqual(replaced.cues[1])
    expect(roundTripped.cues[2]).toBeNull()
    expect(roundTripped.trailer).toEqual(decoded.trailer)
  })

  it('builds a blob Engine can read for a track that had none', () => {
    const built = encodeQuickCues(emptyQuickCues())
    const decoded = decodeQuickCues(built)
    expect(decoded.cues.every((cue) => cue === null)).toBe(true)
    expect(decoded.trailer).toHaveLength(TRAILER_LENGTH)
  })

  it('rejects a truncated blob rather than writing nonsense back', () => {
    expect(() => decodeQuickCues(Buffer.from([1, 2]))).toThrow()
  })
})

describe('mainCueSamples', () => {
  it('reports no main cue on a track that never had performance data', () => {
    expect(mainCueSamples(emptyQuickCues())).toBeNull()
  })

  it('reads back a main cue written into the trailer', () => {
    const cues = emptyQuickCues()
    cues.trailer.writeDoubleBE(529200, 0)
    expect(mainCueSamples(cues)).toBe(529200)
  })

  it('survives a trailer shorter than a double', () => {
    expect(mainCueSamples({ cues: [], trailer: Buffer.alloc(3) })).toBeNull()
  })
})

describe('decodeSampleRate', () => {
  it.each(samples.map((s, i) => [i, s] as const))(
    'reads fixture %i sample rate from trackData',
    (_index, sample) => {
      expect(decodeSampleRate(sample.trackData)).toBe(sample.sampleRate)
    }
  )

  it('returns null instead of throwing on a blob it cannot read', () => {
    expect(decodeSampleRate(Buffer.from([0, 0, 0, 0]))).toBeNull()
  })
})
