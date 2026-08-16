import { decodeAudioBuffer } from './decode'
import { detectRhythm } from './essentiaRhythm'
import { buildCorrectedBeatGrid, phraseBoundariesSec } from './bpmGrid'
import { computeKickBandPhraseEnergies, groupPhrasesIntoBlocks } from './energySegmentation'
import { markBreakdowns } from './breakdownDetection'
import type { Block } from './formatBlocks'

export interface SongAnalysis {
  bpm: number
  durationSec: number
  monoSamples: Float32Array
  sampleRate: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
}

export async function analyzeSong(arrayBuffer: ArrayBuffer): Promise<SongAnalysis> {
  const { monoSamples, sampleRate, durationSec } = await decodeAudioBuffer(arrayBuffer)
  const { bpm, kickTimesSec } = await detectRhythm(monoSamples)
  // Makina keeps a locked, constant tempo, so the grid extrapolates evenly-spaced beats from the
  // estimated BPM rather than trusting essentia's individually-tracked tick positions directly —
  // those jitter (worst through breakdowns, where there's no kick to lock onto). But the single
  // global BPM estimate is never perfectly exact either (confirmed on a real track: pure
  // extrapolation drifted almost a full second off by the end), so the grid periodically re-snaps
  // to a real kick when one lands close to the expected position, correcting that drift while
  // still extrapolating smoothly through gaps where no kick is nearby.
  const grid = buildCorrectedBeatGrid(bpm, kickTimesSec, durationSec)
  const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
  const phraseEnergies = computeKickBandPhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
  const blocks = markBreakdowns(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

  return { bpm, durationSec, monoSamples, sampleRate, phraseTimesSec, phraseEnergies, blocks }
}
