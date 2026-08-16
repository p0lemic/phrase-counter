import { decodeAudioBuffer } from './decode'
import { detectRhythm } from './essentiaRhythm'
import { buildBeatGridFromBpm, phraseBoundariesSec } from './bpmGrid'
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
  // Makina keeps a locked, constant tempo, so the grid is built as perfectly even beats from the
  // first detected kick — trusting essentia's individually-tracked tick positions instead would
  // let their jitter (worst through breakdowns, where there's no kick to lock onto) drift the
  // phrase lines out of sync with the music over the length of the track.
  const grid = buildBeatGridFromBpm(bpm, kickTimesSec[0] ?? 0, durationSec)
  const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
  const phraseEnergies = computeKickBandPhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
  const blocks = markBreakdowns(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

  return { bpm, durationSec, monoSamples, sampleRate, phraseTimesSec, phraseEnergies, blocks }
}
