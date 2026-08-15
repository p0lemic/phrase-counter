import { decodeAudioBuffer } from './decode'
import { detectRhythm } from './essentiaRhythm'
import { phraseBoundariesSec } from './bpmGrid'
import { computePhraseEnergies, groupPhrasesIntoBlocks } from './energySegmentation'
import { markDrops } from './dropDetection'
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
  const phraseTimesSec = phraseBoundariesSec(kickTimesSec)
  const phraseEnergies = computePhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
  const blocks = markDrops(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

  return { bpm, durationSec, monoSamples, sampleRate, phraseTimesSec, phraseEnergies, blocks }
}
