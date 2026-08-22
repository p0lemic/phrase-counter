export interface ShiftedGrid {
  phraseTimesSec: number[]
  /** How much the grid actually moved — less than asked for when it ran into an edge of the track. */
  appliedSec: number
}

/**
 * Slides the whole phrase grid earlier or later without changing the tempo.
 *
 * Beat detection can lock onto the right tempo yet start on the wrong foot when a track has a bit
 * of silence or a fade-in before the first kick, and then every phrase line sits the same distance
 * off the beat for the entire song. Moving the grid as one piece fixes that: the spacing between
 * lines — and therefore the phrase count of every block — is untouched, so manual block edits
 * survive the adjustment.
 */
export function shiftPhraseGrid(phraseTimesSec: number[], deltaSec: number, durationSec: number): ShiftedGrid {
  if (phraseTimesSec.length === 0) return { phraseTimesSec, appliedSec: 0 }

  // The grid may only move as far as its outermost lines allow: a line before 0 or past the end of
  // the track has no waveform to sit on.
  const maxBackwardSec = -phraseTimesSec[0]
  const maxForwardSec = durationSec - phraseTimesSec[phraseTimesSec.length - 1]
  if (maxBackwardSec > maxForwardSec) return { phraseTimesSec, appliedSec: 0 }

  const appliedSec = Math.min(Math.max(deltaSec, maxBackwardSec), maxForwardSec)
  if (appliedSec === 0) return { phraseTimesSec, appliedSec: 0 }

  return { phraseTimesSec: phraseTimesSec.map((time) => time + appliedSec), appliedSec }
}

/** The running offset, for the readout next to the nudge buttons: "+45 ms", "−12 ms", "0 ms". */
export function formatGridOffset(offsetSec: number): string {
  const milliseconds = Math.round(offsetSec * 1000)
  if (milliseconds === 0) return '0 ms'
  return `${milliseconds > 0 ? '+' : '−'}${Math.abs(milliseconds)} ms`
}
