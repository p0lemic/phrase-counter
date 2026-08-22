import { deflateSync, inflateSync } from 'node:zlib'

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

/** Engine wraps its performance blobs as a big-endian uncompressed length followed by a zlib
 *  stream. The length prefix is redundant with what inflate produces, but Engine writes it and
 *  presumably reads it, so we reproduce it exactly. */
function unwrap(blob: Buffer): Buffer {
  if (blob.length < 4) throw new Error('blob de Engine demasiado corto')
  const declaredLength = blob.readUInt32BE(0)
  const body = inflateSync(blob.subarray(4))
  if (body.length !== declaredLength) {
    throw new Error(`longitud declarada ${declaredLength} != real ${body.length}`)
  }
  return body
}

function wrap(body: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.length)
  return Buffer.concat([prefix, deflateSync(body)])
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
