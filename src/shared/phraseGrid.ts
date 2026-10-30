import type { EngineGrid } from './engine'

/** Beats per makina phrase. Shared by both ways of building the phrase grid. */
const BEATS_PER_PHRASE = 32

/**
 * Phrase-grid lines straight off Engine DJ's own beat grid, bypassing kick detection entirely.
 *
 * Engine's grid is an exact straight line and its beat 0 is the beat its bar numbering counts
 * from, so the phrase lines are simply every 32nd beat from the anchor — no tempo fitting, no
 * phase search, and no drift to accumulate. Matches `phraseBoundariesSec` on what counts as a
 * phrase: one only exists where a full 32 beats fit before the end of the track.
 */
export function phraseTimesFromEngineGrid(grid: EngineGrid, durationSec: number): number[] {
  const { beatIntervalSec, beat0Sec, phraseAnchorBeat } = grid
  return phraseTimesFromPhase(beat0Sec + phraseAnchorBeat * beatIntervalSec, beatIntervalSec, durationSec)
}

/**
 * Phrase lines across the whole track in the phase that `anchorSec` sits in.
 *
 * The anchor fixes the grid's phase, not where it begins. A DJ's main cue is as likely to sit on
 * the drop as on the first phrase, so the grid walks back from it in whole phrases to the start of
 * the track — landing on the first line at or after 0, since a line before the audio starts has no
 * waveform to sit on. Also what the one-bar shift re-lays the grid with.
 */
export function phraseTimesFromPhase(
  anchorSec: number,
  beatIntervalSec: number,
  durationSec: number
): number[] {
  const phraseSec = BEATS_PER_PHRASE * beatIntervalSec
  let time = anchorSec - Math.floor(anchorSec / phraseSec) * phraseSec

  const times: number[] = []
  while (time + phraseSec <= durationSec) {
    times.push(time)
    time += phraseSec
  }

  // A clip shorter than one full phrase still gets a single block for its whole span.
  if (times.length === 0 && anchorSec >= 0 && anchorSec <= durationSec) times.push(anchorSec)
  return times
}
