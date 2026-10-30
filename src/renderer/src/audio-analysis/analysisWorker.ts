import { analyzeDecodedAudio } from './analyzeSong'
import type { Block } from './formatBlocks'
import type { EngineGrid } from '../../../shared/engine'
import type { GridSource } from '../../../shared/song'

export interface AnalysisRequest {
  jobId: number
  monoSamples: Float32Array
  sampleRate: number
  durationSec: number
  /** Engine DJ's own grid for this track, when its library has one. */
  engineGrid?: EngineGrid
}

/** What comes back. The decoded samples deliberately stay in the worker: the batch doesn't need
 *  them, and shipping 56 MB per song back to the main thread would undo the point of this. */
export interface AnalysisSuccess {
  jobId: number
  ok: true
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
  gridSource: GridSource
}

export interface AnalysisFailure {
  jobId: number
  ok: false
  error: string
}

export type AnalysisResponse = AnalysisSuccess | AnalysisFailure

self.onmessage = async (event: MessageEvent<AnalysisRequest>): Promise<void> => {
  const { jobId, monoSamples, sampleRate, durationSec, engineGrid } = event.data
  try {
    const analysis = await analyzeDecodedAudio(monoSamples, sampleRate, durationSec, engineGrid)
    const response: AnalysisSuccess = {
      jobId,
      ok: true,
      bpm: analysis.bpm,
      durationSec: analysis.durationSec,
      phraseTimesSec: analysis.phraseTimesSec,
      phraseEnergies: analysis.phraseEnergies,
      blocks: analysis.blocks,
      gridSource: analysis.gridSource
    }
    self.postMessage(response)
  } catch (error) {
    const response: AnalysisFailure = {
      jobId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
    self.postMessage(response)
  }
}
