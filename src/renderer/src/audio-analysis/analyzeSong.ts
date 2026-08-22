import { detectRhythm } from './essentiaRhythm'
import { beatTimesFromFit, buildCorrectedBeatGrid, phraseBoundariesSec } from './bpmGrid'
import {
  computePhraseEnergies,
  groupPhrasesIntoBlocks,
  KICK_BAND_HIGH_HZ,
  KICK_BAND_LOW_HZ
} from './energySegmentation'
import { bandpassFilter } from './filters'
import { bestPhaseOffsetSec, fitConstantTempoGrid, kickAttackEnvelope } from './gridPhase'
import { markBreakdowns } from './breakdownDetection'
import type { Block } from './formatBlocks'

/** 64 samples ≈ 1.5 ms at 44.1 kHz: fine enough to place a kick attack, coarse enough to stay cheap. */
const PHASE_HOP_SIZE = 64

export interface SongAnalysis {
  bpm: number
  durationSec: number
  monoSamples: Float32Array
  sampleRate: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
}

/** Everything after decoding: the expensive half, and the only part that can run in a worker
 *  (OfflineAudioContext, and so decoding, exists only on the main thread). */
export async function analyzeDecodedAudio(
  monoSamples: Float32Array,
  sampleRate: number,
  durationSec: number
): Promise<SongAnalysis> {
  const { bpm, kickTimesSec } = await detectRhythm(monoSamples)

  // The kick band drives two things: where the grid should sit, and how loud each phrase is.
  const kickBand = bandpassFilter(monoSamples, sampleRate, KICK_BAND_LOW_HZ, KICK_BAND_HIGH_HZ)

  // Makina keeps a locked, constant tempo, so the grid is one straight line fitted through every
  // detected tick — that keeps the tempo they agree on and drops the tens of milliseconds of
  // jitter each one carries. Fitting alone still leaves the line's phase wherever the ticks
  // happened to average out, which lands the whole grid consistently just before (or after) every
  // kick; sliding it as one piece onto the loudest kick attacks is what puts it on the beat.
  // Measured against real tracks, this captures 76-666% more kick-attack energy than re-anchoring
  // to the nearest tick beat by beat, which in practice just copied the raw ticks back.
  const fit = fitConstantTempoGrid(bpm, kickTimesSec)
  let beatBpm = bpm
  let beatTimesSec: number[]

  if (fit) {
    const attacks = kickAttackEnvelope(kickBand, PHASE_HOP_SIZE)
    const unaligned = beatTimesFromFit(fit, kickTimesSec[0], durationSec)
    const offsetSec = bestPhaseOffsetSec(
      unaligned,
      attacks,
      sampleRate,
      PHASE_HOP_SIZE,
      fit.intervalSec / 2
    )
    beatTimesSec = unaligned.map((beat) => beat + offsetSec).filter((beat) => beat >= 0)
    beatBpm = 60 / fit.intervalSec
  } else {
    // Too few ticks to fit a line through — fall back to the old nearest-tick grid.
    beatTimesSec = buildCorrectedBeatGrid(bpm, kickTimesSec, durationSec).kickTimesSec
  }

  const phraseTimesSec = phraseBoundariesSec(beatTimesSec)
  const phraseEnergies = computePhraseEnergies(kickBand, sampleRate, phraseTimesSec, durationSec)
  const blocks = markBreakdowns(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

  return { bpm: beatBpm, durationSec, monoSamples, sampleRate, phraseTimesSec, phraseEnergies, blocks }
}
