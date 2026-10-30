import { unwrap } from './engineBlob'
import { decodeQuickCues, mainCueSamples } from './engineCues'
import type { EngineGrid } from '../shared/engine'

/** Bytes per beat grid marker: sample offset, beat number, beats to the next marker, and a field
 *  whose meaning we don't need. */
const MARKER_LENGTH = 24

/** Outside this a "tempo" is a decoding accident, not a track. */
const MIN_BPM = 40
const MAX_BPM = 250

/** How far off a beat the main cue may sit and still be treated as marking one. Real main cues
 *  land within a hundredth of a millisecond; anything looser was placed by ear mid-track. */
const ON_BEAT_TOLERANCE_MS = 5

interface Marker {
  sampleOffset: number
  beatNumber: number
}

/** Markers are little-endian, though the counts and the header around them are big-endian. */
function readMarkers(body: Buffer, offset: number): { markers: Marker[]; offset: number } {
  const count = Number(body.readBigUInt64BE(offset))
  let cursor = offset + 8
  const markers: Marker[] = []

  for (let index = 0; index < count; index++) {
    markers.push({
      sampleOffset: body.readDoubleLE(cursor),
      beatNumber: Number(body.readBigInt64LE(cursor + 8))
    })
    cursor += MARKER_LENGTH
  }

  return { markers, offset: cursor }
}

function lineThrough(markers: Marker[], sampleRate: number): Omit<EngineGrid, 'phraseAnchorBeat'> | null {
  if (markers.length < 2) return null

  const first = markers[0]
  const last = markers[markers.length - 1]
  const beats = last.beatNumber - first.beatNumber
  if (beats <= 0) return null

  const intervalSamples = (last.sampleOffset - first.sampleOffset) / beats
  const beatIntervalSec = intervalSamples / sampleRate
  if (!(beatIntervalSec > 0)) return null

  const bpm = 60 / beatIntervalSec
  if (bpm < MIN_BPM || bpm > MAX_BPM) return null

  return {
    bpm,
    beatIntervalSec,
    beat0Sec: (first.sampleOffset - first.beatNumber * intervalSamples) / sampleRate
  }
}

/** Which beat the main cue marks, or 0 when the track has no cue or its cue sits between beats. */
function phraseAnchorBeat(quickCues: Buffer | null, grid: Omit<EngineGrid, 'phraseAnchorBeat'>, sampleRate: number): number {
  if (!quickCues) return 0
  try {
    const cueSamples = mainCueSamples(decodeQuickCues(quickCues))
    if (cueSamples === null) return 0
    const beat = (cueSamples / sampleRate - grid.beat0Sec) / grid.beatIntervalSec
    const nearest = Math.round(beat)
    const offBeatMs = Math.abs(beat - nearest) * grid.beatIntervalSec * 1000
    return offBeatMs <= ON_BEAT_TOLERANCE_MS ? nearest : 0
  } catch {
    return 0
  }
}

/**
 * Reads a track's grid out of Engine's `PerformanceData.beatData` blob, returning null for
 * anything we can't trust: a track Engine never analysed, a grid too short to fix a tempo, a
 * tempo no track really has, or a blob that won't decode.
 *
 * Engine keeps two grids — the one its analysis produced and the one the DJ may have nudged. The
 * nudged one is what Engine itself plays to, and on the tracks where they differ the track's own
 * main cue lands exactly on the nudged grid while sitting 100-200 ms off the analysed one, so
 * that is the one we take.
 */
export function decodeBeatGrid(beatData: Buffer, quickCues: Buffer | null): EngineGrid | null {
  try {
    const body = unwrap(beatData)
    const sampleRate = body.readDoubleBE(0)
    // The library is not all 44.1 kHz — 1,490 of 24,317 tracks aren't — and every offset below is
    // counted in these samples, so the rate has to come from the blob rather than be assumed.
    if (!(sampleRate > 0)) return null
    // Byte 16 is Engine's "this grid has been analysed" flag; bytes 8-15 are the track's length.
    if (body.readUInt8(16) !== 1) return null

    const analysed = readMarkers(body, 17)
    const nudged = readMarkers(body, analysed.offset)

    const grid = lineThrough(nudged.markers, sampleRate) ?? lineThrough(analysed.markers, sampleRate)
    if (!grid) return null

    return { ...grid, phraseAnchorBeat: phraseAnchorBeat(quickCues, grid, sampleRate) }
  } catch {
    return null
  }
}
