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

/** Beat times for a fitted tempo, laid across the track. The grid starts at the fitted beat
 *  nearest where beat tracking first locked on, so a phase correction doesn't renumber the
 *  phrases — it only moves them onto the kicks. */
export function beatTimesFromFit(
  fit: { intervalSec: number; phaseSec: number },
  firstTickSec: number,
  durationSec: number
): number[] {
  const { intervalSec, phaseSec } = fit
  const start = phaseSec + Math.round((firstTickSec - phaseSec) / intervalSec) * intervalSec

  const beats: number[] = []
  for (let time = Math.max(start, 0); time <= durationSec; time += intervalSec) beats.push(time)
  return beats
}

/** How close (as a fraction of one beat interval) a real detected kick must be to the expected
 *  position to be trusted as a correction — tight enough to reject the noisy ticks essentia
 *  produces through a breakdown (no kick to lock onto), loose enough to still catch real tempo
 *  drift before it grows large. */
const CORRECTION_TOLERANCE_FRACTION = 0.25

/**
 * Builds the beat grid by extrapolating from the estimated BPM, but re-anchoring to a real
 * detected kick whenever one lands close to the expected position. A single global BPM estimate
 * can't perfectly capture a track's true tempo (encoding quirks, a hair of real tempo variation),
 * so pure extrapolation compounds that error into audible drift over a multi-minute track —
 * confirmed against a real track where it grew to nearly a full second by the end. Snapping back
 * to a real kick periodically corrects for it, while a gap with no nearby kick (e.g. a breakdown)
 * still extrapolates smoothly through it, so this doesn't reintroduce the raw per-tick jitter that
 * using essentia's ticks directly caused.
 */
export function buildCorrectedBeatGrid(bpm: number, kickTimesSec: number[], durationSec: number): BeatGrid {
  const kickIntervalSec = 60 / bpm
  if (kickTimesSec.length === 0) return { bpm, kickIntervalSec, kickTimesSec: [] }

  const toleranceSec = kickIntervalSec * CORRECTION_TOLERANCE_FRACTION
  const grid: number[] = []
  let position = kickTimesSec[0]
  let pointer = 0

  while (position <= durationSec) {
    // Walk forward to the kick nearest `position` (kicks are sorted, so once the next candidate
    // stops being closer, it never will be again). This has to be a genuine nearest-neighbor
    // search, not just "skip anything more than a tolerance behind": under a small systematic BPM
    // error (not jitter), every later kick stays that same distance behind indefinitely, and a
    // naive skip would discard all of them one by one, permanently losing the correction.
    while (
      pointer + 1 < kickTimesSec.length &&
      Math.abs(kickTimesSec[pointer + 1] - position) <= Math.abs(kickTimesSec[pointer] - position)
    ) {
      pointer++
    }

    const nearestKick = kickTimesSec[pointer]
    const beatSec = Math.abs(nearestKick - position) <= toleranceSec ? nearestKick : position

    grid.push(beatSec)
    position = beatSec + kickIntervalSec
  }

  return { bpm, kickIntervalSec, kickTimesSec: grid }
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
