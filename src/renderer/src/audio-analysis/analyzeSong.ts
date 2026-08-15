import { decodeAudioBuffer } from './decode'
import { detectKicks } from './kickDetection'
import { buildBeatGrid, phraseBoundariesSec } from './bpmGrid'
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
  const kickTimesSec = detectKicks(monoSamples, sampleRate)
  const grid = buildBeatGrid(kickTimesSec, durationSec)
  const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
  const phraseEnergies = computePhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
  const blocks = markDrops(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

  return { bpm: grid.bpm, durationSec, monoSamples, sampleRate, phraseTimesSec, phraseEnergies, blocks }
}
