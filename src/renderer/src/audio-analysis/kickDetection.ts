export interface KickDetectionOptions {
  /** Slowest plausible tempo, used to size the adaptive-threshold window. */
  minBpm?: number
  /** Fastest plausible tempo; sets the minimum spacing between accepted kicks. */
  maxBpm?: number
}

interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

function highpassCoefficients(sampleRate: number, cutoffHz: number, q: number): BiquadCoefficients {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate
  const alpha = Math.sin(omega) / (2 * q)
  const cosOmega = Math.cos(omega)
  const a0 = 1 + alpha
  return {
    b0: (1 + cosOmega) / 2 / a0,
    b1: -(1 + cosOmega) / a0,
    b2: (1 + cosOmega) / 2 / a0,
    a1: (-2 * cosOmega) / a0,
    a2: (1 - alpha) / a0
  }
}

function lowpassCoefficients(sampleRate: number, cutoffHz: number, q: number): BiquadCoefficients {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate
  const alpha = Math.sin(omega) / (2 * q)
  const cosOmega = Math.cos(omega)
  const a0 = 1 + alpha
  return {
    b0: (1 - cosOmega) / 2 / a0,
    b1: (1 - cosOmega) / a0,
    b2: (1 - cosOmega) / 2 / a0,
    a1: (-2 * cosOmega) / a0,
    a2: (1 - alpha) / a0
  }
}

/** Direct-form-I biquad filter, applied in place across the whole buffer. */
function applyBiquad(samples: Float32Array, coeffs: BiquadCoefficients): Float32Array {
  const { b0, b1, b2, a1, a2 } = coeffs
  const out = new Float32Array(samples.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return out
}

/** Isolates the kick-drum band: a high-pass followed by a low-pass. */
function bandpass(samples: Float32Array, sampleRate: number, lowHz: number, highHz: number): Float32Array {
  const highPassed = applyBiquad(samples, highpassCoefficients(sampleRate, lowHz, Math.SQRT1_2))
  return applyBiquad(highPassed, lowpassCoefficients(sampleRate, highHz, Math.SQRT1_2))
}

/** Rectifies and smooths a signal into an amplitude envelope via a one-pole low-pass. */
function computeEnvelope(samples: Float32Array, sampleRate: number, smoothingMs: number): Float32Array {
  const tau = smoothingMs / 1000
  const alpha = 1 - Math.exp(-1 / (sampleRate * tau))
  const envelope = new Float32Array(samples.length)
  let y = 0
  for (let i = 0; i < samples.length; i++) {
    y += alpha * (Math.abs(samples[i]) - y)
    envelope[i] = y
  }
  return envelope
}

/** Sliding-window maximum via a monotonic deque, O(n) for the whole envelope. */
function slidingMax(values: Float32Array, windowSamples: number): Float32Array {
  const result = new Float32Array(values.length)
  const deque: number[] = [] // indices, values decreasing
  let head = 0

  for (let i = 0; i < values.length; i++) {
    while (deque.length > 0 && values[deque[deque.length - 1]] <= values[i]) {
      deque.pop()
    }
    // A long run of back-pops (e.g. after a silent breakdown followed by a
    // sudden onset) can empty the deque past where `head` was left pointing.
    if (head > deque.length) {
      head = deque.length
    }
    deque.push(i)
    while (deque[head] <= i - windowSamples) {
      head++
    }
    result[i] = values[deque[head]]
  }

  return result
}

export function detectKicks(
  samples: Float32Array,
  sampleRate: number,
  options: KickDetectionOptions = {}
): number[] {
  const { minBpm = 120, maxBpm = 220 } = options

  const kickBand = bandpass(samples, sampleRate, 40, 150)
  const envelope = computeEnvelope(kickBand, sampleRate, 10)

  const adaptiveWindowSamples = Math.round(sampleRate * (60 / minBpm) * 1.5)
  const threshold = slidingMax(envelope, adaptiveWindowSamples)
  const refractorySamples = Math.round(sampleRate * (60 / maxBpm))

  const kicks: number[] = []
  let lastKickSample = -Infinity

  for (let i = 1; i < envelope.length - 1; i++) {
    const isLocalPeak = envelope[i] >= envelope[i - 1] && envelope[i] >= envelope[i + 1]
    const isAboveThreshold = envelope[i] >= 0.35 * threshold[i] && threshold[i] > 0
    const isOutsideRefractory = i - lastKickSample >= refractorySamples

    if (isLocalPeak && isAboveThreshold && isOutsideRefractory) {
      kicks.push(i / sampleRate)
      lastKickSample = i
    }
  }

  return kicks
}
