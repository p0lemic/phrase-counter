import { dequeue, enqueue, type QueuedJob } from './analysisQueue'
import type { AnalysisRequest, AnalysisResponse } from './analysisWorker'
import type { Block } from './formatBlocks'

export interface AnalysisInput {
  monoSamples: Float32Array
  sampleRate: number
  durationSec: number
}

export interface AnalysisOutput {
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Análisis cancelado')
    this.name = 'AnalysisCancelledError'
  }
}

/** Each worker peaks around 350 MB on a 5-7 minute track (measured), so the ceiling is memory,
 *  not cores: six of them already put the renderer near 2 GB. */
const MAX_WORKERS = 6

function poolSize(): number {
  const cores = navigator.hardwareConcurrency || 4
  // Leaving two cores keeps the UI thread and Chromium's audio decoding responsive.
  return Math.max(2, Math.min(cores - 2, MAX_WORKERS))
}

interface Slot {
  worker: Worker
  jobId: number | null
}

type Job = AnalysisInput & { keepSamples: boolean }

interface Pending {
  resolve: (output: AnalysisOutput) => void
  reject: (error: Error) => void
}

/**
 * Runs the analysis pipeline across a pool of workers. Analysis is a ~11 s blocking WASM call per
 * song (essentia's RhythmExtractor2013 accounts for ~94% of it), so running it on the main thread
 * froze the window and let only one song through at a time; a pool of workers both frees the UI
 * and analyzes several songs at once, without touching the algorithm or its results.
 */
class AnalysisPool {
  private slots: Slot[] = []
  private queue: QueuedJob<Job>[] = []
  private pending = new Map<number, Pending>()
  private nextJobId = 1

  /** `keepSamples` copies the buffer instead of transferring it, for the caller that still needs
   *  the samples afterwards (the song view redraws its waveform and recomputes energies from
   *  them). The batch doesn't, and transferring tens of MB beats copying them. */
  submit(
    input: AnalysisInput,
    options: { priority?: boolean; keepSamples?: boolean } = {}
  ): Promise<AnalysisOutput> {
    const job: QueuedJob<Job> = {
      id: this.nextJobId++,
      priority: options.priority ?? false,
      payload: { ...input, keepSamples: options.keepSamples ?? false }
    }

    return new Promise<AnalysisOutput>((resolve, reject) => {
      this.pending.set(job.id, { resolve, reject })
      this.queue = enqueue(this.queue, job)
      this.pump()
    })
  }

  /** Clears what's waiting and kills what's running — essentia's call can't be interrupted from
   *  the inside, so a job already in flight only stops by terminating its worker. */
  cancelAll(): void {
    const queued = this.queue
    this.queue = []
    for (const job of queued) this.settle(job.id, (pending) => pending.reject(new AnalysisCancelledError()))

    for (const slot of this.slots) {
      // Every worker is terminated, idle ones included: the slots array is emptied below, so a
      // survivor would be an orphan thread holding its ~350 MB essentia heap for nothing.
      slot.worker.terminate()
      if (slot.jobId === null) continue
      const cancelledId = slot.jobId
      slot.jobId = null
      this.settle(cancelledId, (pending) => pending.reject(new AnalysisCancelledError()))
    }
    this.slots = []
  }

  private settle(jobId: number, apply: (pending: Pending) => void): void {
    const pending = this.pending.get(jobId)
    if (!pending) return
    this.pending.delete(jobId)
    apply(pending)
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const slot = this.idleSlot()
      if (!slot) return

      const [job, rest] = dequeue(this.queue)
      if (!job) return
      this.queue = rest
      this.dispatch(slot, job)
    }
  }

  /** Workers are spawned lazily: opening a single song shouldn't start six essentia runtimes. */
  private idleSlot(): Slot | undefined {
    const idle = this.slots.find((slot) => slot.jobId === null)
    if (idle) return idle
    if (this.slots.length >= poolSize()) return undefined

    const slot: Slot = { worker: this.spawn(), jobId: null }
    this.slots.push(slot)
    return slot
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const response = event.data
      const slot = this.slots.find((candidate) => candidate.worker === worker)
      if (slot) slot.jobId = null

      this.settle(response.jobId, (pending) =>
        response.ok
          ? pending.resolve({
              bpm: response.bpm,
              durationSec: response.durationSec,
              phraseTimesSec: response.phraseTimesSec,
              phraseEnergies: response.phraseEnergies,
              blocks: response.blocks
            })
          : pending.reject(new Error(response.error))
      )
      this.pump()
    }

    // A worker that dies (an aborted WASM runtime, say) takes its job down with it; the slot is
    // dropped so the next job spawns a fresh one instead of waiting on a corpse.
    worker.onerror = (event) => {
      console.error('[analysis] worker caído:', event.message)
      const slot = this.slots.find((candidate) => candidate.worker === worker)
      const failedId = slot?.jobId ?? null
      this.slots = this.slots.filter((candidate) => candidate.worker !== worker)
      worker.terminate()
      if (failedId !== null) {
        this.settle(failedId, (pending) => pending.reject(new Error(event.message || 'Worker de análisis caído')))
      }
      this.pump()
    }

    return worker
  }

  private dispatch(slot: Slot, job: QueuedJob<Job>): void {
    slot.jobId = job.id
    const request: AnalysisRequest = {
      jobId: job.id,
      monoSamples: job.payload.monoSamples,
      sampleRate: job.payload.sampleRate,
      durationSec: job.payload.durationSec
    }
    // Transferred rather than copied where we can: these buffers are tens of MB each.
    slot.worker.postMessage(request, job.payload.keepSamples ? [] : [job.payload.monoSamples.buffer])
  }
}

/** How many songs are worth having in flight at once, for callers driving a batch. */
export function analysisConcurrency(): number {
  return poolSize()
}

let pool: AnalysisPool | undefined

export function getAnalysisPool(): AnalysisPool {
  if (!pool) pool = new AnalysisPool()
  return pool
}
