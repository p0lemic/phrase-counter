export interface BeatGrid {
  bpm: number
  kickIntervalSec: number
  kickTimesSec: number[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** How close an ideal grid point must be to a detected kick to snap to it, as a fraction of the beat period. */
const SNAP_TOLERANCE_FRACTION = 0.3

export function buildBeatGrid(kickTimesSec: number[], durationSec: number): BeatGrid {
  const intervals = kickTimesSec.slice(1).map((t, i) => t - kickTimesSec[i])
  const kickIntervalSec = median(intervals)
  const bpm = 60 / kickIntervalSec

  const firstKickSec = kickTimesSec[0]
  const snapToleranceSec = kickIntervalSec * SNAP_TOLERANCE_FRACTION
  const grid: number[] = []
  let searchIndex = 0

  for (let t = firstKickSec; t <= durationSec; t += kickIntervalSec) {
    // kickTimesSec and the grid both advance monotonically, so the nearest
    // kick to this grid point is never before the nearest kick to the last one.
    while (
      searchIndex < kickTimesSec.length - 1 &&
      Math.abs(kickTimesSec[searchIndex + 1] - t) <= Math.abs(kickTimesSec[searchIndex] - t)
    ) {
      searchIndex++
    }

    const nearestKickSec = kickTimesSec[searchIndex]
    const distanceSec = Math.abs(nearestKickSec - t)
    grid.push(distanceSec <= snapToleranceSec ? nearestKickSec : t)
  }

  return { bpm, kickIntervalSec, kickTimesSec: grid }
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

/** Timestamps of every Nth kick (default 32, one full makina phrase), marking phrase-grid lines. */
export function phraseBoundariesSec(kickTimesSec: number[], kicksPerPhrase = 32): number[] {
  const boundaries: number[] = []
  for (let i = 0; i < kickTimesSec.length; i += kicksPerPhrase) {
    boundaries.push(kickTimesSec[i])
  }
  return boundaries
}
