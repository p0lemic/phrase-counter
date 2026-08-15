export interface BeatGrid {
  bpm: number
  kickIntervalSec: number
  kickTimesSec: number[]
}

/** Builds an ideal, evenly-spaced grid from a manually-entered BPM and first-kick offset, bypassing kick detection. */
export function buildBeatGridFromBpm(bpm: number, firstKickSec: number, durationSec: number): BeatGrid {
  const kickIntervalSec = 60 / bpm
  const kickTimesSec: number[] = []
  for (let t = firstKickSec; t <= durationSec; t += kickIntervalSec) {
    kickTimesSec.push(t)
  }
  return { bpm, kickIntervalSec, kickTimesSec }
}

/**
 * Timestamps of every Nth kick (default 32, one full makina phrase), marking phrase-grid lines.
 * A trailing run of fewer than N kicks is outro/silence spillover, not a phrase, so it's omitted —
 * its audio still belongs to the last real phrase, which simply runs a little long.
 */
export function phraseBoundariesSec(kickTimesSec: number[], kicksPerPhrase = 32): number[] {
  const boundaries: number[] = []
  for (let i = 0; i + kicksPerPhrase <= kickTimesSec.length; i += kicksPerPhrase) {
    boundaries.push(kickTimesSec[i])
  }
  // A clip shorter than one full phrase still gets a single block for its whole span.
  if (boundaries.length === 0 && kickTimesSec.length > 0) {
    boundaries.push(kickTimesSec[0])
  }
  return boundaries
}
