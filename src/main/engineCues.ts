import { unwrap, wrap } from './engineBlob'

/** Engine stores exactly this many quick cues per track — always all eight, unused ones blanked. */
export const QUICK_CUE_COUNT = 8

/** An unset cue carries this position instead of a real one. */
const EMPTY_CUE_POSITION = -1

/** Bytes after the eight cue entries. Always 17 in practice (a double, a flag byte and another
 *  double — the main cue). We never build these ourselves, we carry them across untouched. */
const TRAILER_LENGTH = 17

/** The trailer written for a track that had no quickCues blob at all: main cue unset. */
const DEFAULT_TRAILER = Buffer.concat([
  doubleToBuffer(EMPTY_CUE_POSITION),
  Buffer.from([0]),
  doubleToBuffer(EMPTY_CUE_POSITION)
])

export interface QuickCue {
  label: string
  /** Offset into the track in samples — not seconds, and not always at 44.1 kHz. */
  positionSamples: number
  /** Packed ARGB, as Engine stores it. */
  colorArgb: number
}

export interface QuickCues {
  cues: (QuickCue | null)[]
  /** Opaque tail of the decoded body, preserved byte for byte on the way back out. */
  trailer: Buffer
}

function doubleToBuffer(value: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeDoubleBE(value)
  return buffer
}

export function decodeQuickCues(blob: Buffer): QuickCues {
  const body = unwrap(blob)
  const count = Number(body.readBigUInt64BE(0))
  if (count !== QUICK_CUE_COUNT) {
    throw new Error(`se esperaban ${QUICK_CUE_COUNT} cues, el blob declara ${count}`)
  }

  const cues: (QuickCue | null)[] = []
  let offset = 8

  for (let index = 0; index < QUICK_CUE_COUNT; index++) {
    const labelLength = body.readUInt8(offset)
    offset += 1
    // latin1, not utf8: Engine writes one byte per character and the length prefix counts bytes.
    const label = body.toString('latin1', offset, offset + labelLength)
    offset += labelLength
    const positionSamples = body.readDoubleBE(offset)
    offset += 8
    const colorArgb = body.readUInt32BE(offset)
    offset += 4
    cues.push(positionSamples < 0 ? null : { label, positionSamples, colorArgb })
  }

  return { cues, trailer: body.subarray(offset) }
}

export function encodeQuickCues({ cues, trailer }: QuickCues): Buffer {
  if (cues.length !== QUICK_CUE_COUNT) {
    throw new Error(`hacen falta exactamente ${QUICK_CUE_COUNT} entradas de cue`)
  }

  const header = Buffer.alloc(8)
  header.writeBigUInt64BE(BigInt(QUICK_CUE_COUNT))
  const parts: Buffer[] = [header]

  for (const cue of cues) {
    // A blanked slot still keeps whatever label was there; Engine writes an empty one, so do we.
    const label = Buffer.from(cue ? cue.label : '', 'latin1')
    const entry = Buffer.alloc(1 + label.length + 8 + 4)
    entry.writeUInt8(label.length, 0)
    label.copy(entry, 1)
    entry.writeDoubleBE(cue ? cue.positionSamples : EMPTY_CUE_POSITION, 1 + label.length)
    entry.writeUInt32BE(cue ? cue.colorArgb : 0, 1 + label.length + 8)
    parts.push(entry)
  }

  parts.push(trailer)
  return wrap(Buffer.concat(parts))
}

/**
 * The track's main cue — the point Engine drops the playhead on when you load the track — in
 * samples, or null when the track has none.
 *
 * It is the first double of the trailer we otherwise carry across untouched. Measured over a
 * 24,317-track library: 219 tracks have one, and 215 of those sit within a millisecond of a beat
 * of the track's own grid, so this is a position a DJ (or Engine) placed deliberately rather than
 * a byte that happens to look like a number.
 */
export function mainCueSamples({ trailer }: QuickCues): number | null {
  if (trailer.length < 8) return null
  const position = trailer.readDoubleBE(0)
  return Number.isFinite(position) && position >= 0 ? position : null
}

/** The blob to start from when a track has no performance data of its own yet. */
export function emptyQuickCues(): QuickCues {
  return { cues: new Array(QUICK_CUE_COUNT).fill(null), trailer: Buffer.from(DEFAULT_TRAILER) }
}

/** Engine's `trackData` blob opens with the track's sample rate as a big-endian double. Cue
 *  positions are counted in those samples, and the library is not all 44.1 kHz — reading it wrong
 *  puts every cue of a 48 kHz track ~9% out of place. */
export function decodeSampleRate(trackDataBlob: Buffer): number | null {
  try {
    const body = unwrap(trackDataBlob)
    if (body.length < 8) return null
    const sampleRate = body.readDoubleBE(0)
    return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null
  } catch {
    return null
  }
}

export { TRAILER_LENGTH }
