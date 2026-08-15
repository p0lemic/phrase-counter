export interface BeatGrid {
  bpm: number
  kickIntervalSec: number
  kickTimesSec: number[]
}

/**
 * How tightly kick times cluster around a single phase of a candidate period, via the mean
 * resultant vector length of their phases-as-angles (1 = all kicks land on the same point in the
 * cycle, 0 = phases are scattered). Peaks at the true period and is naturally suppressed at
 * octave multiples/submultiples, since kicks alternating between two opposite phases cancel out.
 */
function periodicityScore(kickTimesSec: number[], periodSec: number): number {
  let sumCos = 0
  let sumSin = 0
  for (const t of kickTimesSec) {
    const phase = (2 * Math.PI * t) / periodSec
    sumCos += Math.cos(phase)
    sumSin += Math.sin(phase)
  }
  return Math.sqrt(sumCos * sumCos + sumSin * sumSin) / kickTimesSec.length
}

/**
 * Finds the BPM whose beat grid the kicks align to most consistently, searching a coarse pass
 * across the whole plausible range and then refining around the best candidate. More robust than
 * a plain median interval when a denser, unrelated low-frequency element (e.g. a rolling bassline)
 * gets picked up alongside the real kicks: that decoy rarely locks onto the true beat's phase as
 * tightly as the kicks themselves do, across the whole track.
 */
export function estimateBpm(kickTimesSec: number[], minBpm: number, maxBpm: number): number {
  function bestInRange(loBpm: number, hiBpm: number, stepBpm: number): number {
    let bestBpm = loBpm
    let bestScore = -Infinity
    for (let bpm = loBpm; bpm <= hiBpm; bpm += stepBpm) {
      const score = periodicityScore(kickTimesSec, 60 / bpm)
      if (score > bestScore) {
        bestScore = score
        bestBpm = bpm
      }
    }
    return bestBpm
  }

  const coarseBpm = bestInRange(minBpm, maxBpm, 0.5)
  return bestInRange(Math.max(minBpm, coarseBpm - 0.5), Math.min(maxBpm, coarseBpm + 0.5), 0.01)
}

/** How close an ideal grid point must be to a detected kick to snap to it, as a fraction of the beat period. */
const SNAP_TOLERANCE_FRACTION = 0.3

export function buildBeatGrid(
  kickTimesSec: number[],
  durationSec: number,
  minBpm = 120,
  maxBpm = 220
): BeatGrid {
  const bpm = estimateBpm(kickTimesSec, minBpm, maxBpm)
  const kickIntervalSec = 60 / bpm

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
