import * as EssentiaWasmModule from 'essentia.js/dist/essentia-wasm.umd.js'
import * as EssentiaCoreModule from 'essentia.js/dist/essentia.js-core.umd.js'

export interface RhythmResult {
  bpm: number
  kickTimesSec: number[]
}

interface EmbindVector {
  delete: () => void
}

interface RhythmExtractorOutput {
  bpm: number
  ticks: EmbindVector
  estimates: EmbindVector
  bpmIntervals: EmbindVector
}

interface EssentiaInstance {
  arrayToVector: (array: Float32Array) => EmbindVector
  vectorToArray: (vector: EmbindVector) => Float32Array
  RhythmExtractor2013: (
    signal: EmbindVector,
    maxTempo: number,
    method: 'multifeature' | 'degara',
    minTempo: number
  ) => RhythmExtractorOutput
}

type EssentiaConstructor = new (wasmModule: unknown) => EssentiaInstance

// These are CJS/UMD builds with an ambiguous export shape (both `module.exports = X` and a named
// `exports.EssentiaWASM = X` appear in the same file) — different bundlers resolve that
// differently (Vite's esbuild-based dev pre-bundling vs. Vitest's transform disagree on which one
// wins), so we look up the real value defensively instead of trusting a single import form.
function unwrapCjsExport<T>(namespaceImport: unknown, namedKey: string): T {
  const namespace = namespaceImport as Record<string, unknown>
  return (namespace[namedKey] ?? namespace.default ?? namespace) as T
}

const EssentiaWASM = unwrapCjsExport<unknown>(EssentiaWasmModule, 'EssentiaWASM')
const Essentia = unwrapCjsExport<EssentiaConstructor>(EssentiaCoreModule, 'Essentia')

let essentiaPromise: Promise<EssentiaInstance> | null = null

function loadEssentia(): Promise<EssentiaInstance> {
  if (!essentiaPromise) {
    essentiaPromise = Promise.resolve(EssentiaWASM).then((wasmModule) => new Essentia(wasmModule))
  }
  return essentiaPromise
}

/**
 * Detects BPM and beat (kick) positions using Essentia's RhythmExtractor2013 (multi-feature
 * method): it combines several onset detection functions with dynamic-programming beat tracking,
 * which tracks the musically "felt" beat through the whole track rather than just the most
 * frequent low-frequency pulse — this is what correctly resolves "gallop"/triplet kick patterns
 * that fooled a simpler peak-picking + interval approach.
 *
 * Uses the "umd" WASM build (WASM inlined as base64) rather than the "web" build (fetches its
 * .wasm over the network): the web build hung indefinitely in Electron's renderer on a real
 * ~6-minute track, whereas the umd build completes reliably. The umd build does misdetect its
 * runtime as Node (`process.versions.node` is present in Electron's renderer even without
 * nodeIntegration) and take a code path with stubbed-out fs/path/crypto — harmless in practice
 * since RhythmExtractor2013 never actually needs them, confirmed by a 10x-in-a-row stress test
 * against the same long track with no failures once the vector memory leak below was fixed.
 */
async function extract(monoSamples: Float32Array, minBpm: number, maxBpm: number): Promise<RhythmResult> {
  const essentia = await loadEssentia()
  const vectorSignal = essentia.arrayToVector(monoSamples)
  const result = essentia.RhythmExtractor2013(vectorSignal, maxBpm, 'multifeature', minBpm)

  const kickTimesSec = Array.from(essentia.vectorToArray(result.ticks))
  const bpm = result.bpm

  // RhythmExtractor2013's input and its vector-valued outputs are all Emscripten/embind objects:
  // their backing memory lives on the WASM heap and isn't garbage-collected with the JS wrapper,
  // so it must be freed explicitly or it leaks on every call — enough of them in one session (e.g.
  // batch-adding a folder, or just a few long tracks) eventually aborts the WASM runtime.
  vectorSignal.delete()
  result.ticks.delete()
  result.estimates.delete()
  result.bpmIntervals.delete()

  return { bpm, kickTimesSec }
}

/** Below this, a track is suspected of having been read at half its real tempo. Nothing in this
 *  music sits here legitimately-and-fast: 200 bpm frenchcore reads as 100, 220 uptempo as 110. */
const OCTAVE_SUSPICION_BPM = 130

/** Second-pass floor. It has to clear the doubtful reading's double-or-nothing zone: asking for
 *  ≥130 on a 200 bpm track returns a nonsense 133 (measured), while ≥150 returns the real 199. */
const OCTAVE_RETRY_MIN_BPM = 150

/** How far from exactly twice the first reading the second may land and still count as the same
 *  beat counted differently. Ratios around 1.5 turn up often — those are a different reading of
 *  the metre, not an octave, and doubling them would be a guess. */
const OCTAVE_RATIO_TOLERANCE = 0.06

export async function detectRhythm(
  monoSamples: Float32Array,
  minBpm = 100,
  maxBpm = 250
): Promise<RhythmResult> {
  const slow = await extract(monoSamples, minBpm, maxBpm)
  if (slow.bpm >= OCTAVE_SUSPICION_BPM || OCTAVE_RETRY_MIN_BPM >= maxBpm) return slow

  // A kick on every beat at 200 bpm is just as readable as one on every other beat at 100, and the
  // extractor prefers the slower reading — which then puts a grid line on every second kick and
  // makes each phrase twice as long as it is. Asking again from a floor above the slow reading
  // settles it: if the answer is the same beat counted twice as often, take it, ticks and all.
  const fast = await extract(monoSamples, OCTAVE_RETRY_MIN_BPM, maxBpm)
  const isSameBeatDoubled = Math.abs(fast.bpm / slow.bpm - 2) <= OCTAVE_RATIO_TOLERANCE

  return isSameBeatDoubled && fast.bpm <= maxBpm ? fast : slow
}
