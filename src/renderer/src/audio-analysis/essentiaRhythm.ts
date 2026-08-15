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
export async function detectRhythm(
  monoSamples: Float32Array,
  minBpm = 100,
  maxBpm = 250
): Promise<RhythmResult> {
  const essentia = await loadEssentia()
  const vectorSignal = essentia.arrayToVector(monoSamples)
  const result = essentia.RhythmExtractor2013(vectorSignal, maxBpm, 'multifeature', minBpm)

  const kickTimesSec = Array.from(essentia.vectorToArray(result.ticks))

  // RhythmExtractor2013's input and its vector-valued outputs are all Emscripten/embind objects:
  // their backing memory lives on the WASM heap and isn't garbage-collected with the JS wrapper,
  // so it must be freed explicitly or it leaks on every call — enough of them in one session (e.g.
  // batch-adding a folder, or just a few long tracks) eventually aborts the WASM runtime.
  vectorSignal.delete()
  result.ticks.delete()
  result.estimates.delete()
  result.bpmIntervals.delete()

  return { bpm: result.bpm, kickTimesSec }
}
