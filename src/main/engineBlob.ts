import { deflateSync, inflateSync } from 'node:zlib'

/** Engine wraps every performance blob as a big-endian uncompressed length followed by a zlib
 *  stream. The length prefix is redundant with what inflate produces, but Engine writes it and
 *  presumably reads it, so we reproduce it exactly. */
export function unwrap(blob: Buffer): Buffer {
  if (blob.length < 4) throw new Error('blob de Engine demasiado corto')
  const declaredLength = blob.readUInt32BE(0)
  const body = inflateSync(blob.subarray(4))
  if (body.length !== declaredLength) {
    throw new Error(`longitud declarada ${declaredLength} != real ${body.length}`)
  }
  return body
}

export function wrap(body: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.length)
  return Buffer.concat([prefix, deflateSync(body)])
}
