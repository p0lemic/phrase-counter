export interface TempoFit {
  intervalSec: number
  /** Time of the beat with index 0 — the grid is `phaseSec + n * intervalSec`. */
  phaseSec: number
}

/**
 * Fits one constant-tempo line through every detected tick by least squares.
 *
 * Essentia's ticks each carry tens of milliseconds of jitter, and the old grid re-anchored to
 * whichever one was nearest — with a tolerance of a quarter beat, that meant snapping to
 * essentially all of them, so the grid inherited the jitter it was meant to remove (measured:
 * 92-100% of beats snapped on every track tried). Fitting a single line keeps the tempo the ticks
 * agree on while dropping the wobble around it.
 */
export function fitConstantTempoGrid(bpm: number, tickTimesSec: number[]): TempoFit | null {
  if (tickTimesSec.length < 2) return null

  const nominalInterval = 60 / bpm
  const anchor = tickTimesSec[0]
  // Each tick is numbered by the beat it's closest to, then the line is fitted over those pairs.
  const beatIndices = tickTimesSec.map((tick) => Math.round((tick - anchor) / nominalInterval))

  const count = tickTimesSec.length
  const sumIndex = beatIndices.reduce((sum, index) => sum + index, 0)
  const sumTime = tickTimesSec.reduce((sum, time) => sum + time, 0)
  const sumIndexSquared = beatIndices.reduce((sum, index) => sum + index * index, 0)
  const sumIndexTime = beatIndices.reduce((sum, index, i) => sum + index * tickTimesSec[i], 0)

  const denominator = count * sumIndexSquared - sumIndex * sumIndex
  if (denominator === 0) return null

  const intervalSec = (count * sumIndexTime - sumIndex * sumTime) / denominator
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return null

  return { intervalSec, phaseSec: (sumTime - intervalSec * sumIndex) / count }
}

/** Per-frame rise in loudness: where a kick hits, this spikes. Fed the kick-band signal, its peaks
 *  are the kick attacks the grid should land on. */
export function kickAttackEnvelope(bandPassedSamples: Float32Array, hopSize: number): Float32Array {
  const frameCount = Math.floor(bandPassedSamples.length / hopSize)
  const loudness = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame++) {
    let sumOfSquares = 0
    for (let i = frame * hopSize; i < (frame + 1) * hopSize; i++) {
      sumOfSquares += bandPassedSamples[i] * bandPassedSamples[i]
    }
    loudness[frame] = Math.sqrt(sumOfSquares / hopSize)
  }

  const attacks = new Float32Array(frameCount)
  for (let frame = 1; frame < frameCount; frame++) {
    attacks[frame] = Math.max(0, loudness[frame] - loudness[frame - 1])
  }
  return attacks
}

const PHASE_SEARCH_STEP_SEC = 0.002

/**
 * How far the whole grid should slide to sit on the kicks, in seconds (add it to every beat).
 *
 * A tempo estimate can be right while its phase is wrong — the grid then lands consistently just
 * before or just after every kick, which is what "the grid starts before the first beat and drags
 * all song" looks like. Sliding the grid as one piece and keeping the offset that captures the
 * most attack energy fixes that without touching the tempo. The search is capped at half a beat
 * either way, so it can only settle the grid on its own beat, never hop onto the next one.
 */
export function bestPhaseOffsetSec(
  gridTimesSec: number[],
  attackEnvelope: Float32Array,
  sampleRate: number,
  hopSize: number,
  maxOffsetSec: number
): number {
  if (gridTimesSec.length === 0 || attackEnvelope.length === 0) return 0

  const framesPerSecond = sampleRate / hopSize
  let bestOffset = 0
  let bestScore = -1

  for (let offset = -maxOffsetSec; offset <= maxOffsetSec; offset += PHASE_SEARCH_STEP_SEC) {
    let score = 0
    for (const beat of gridTimesSec) {
      const frame = Math.round((beat + offset) * framesPerSecond)
      if (frame >= 0 && frame < attackEnvelope.length) score += attackEnvelope[frame]
    }
    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }

  // An envelope with no attacks at all scores zero everywhere; leave the grid where it was.
  return bestScore > 0 ? bestOffset : 0
}
