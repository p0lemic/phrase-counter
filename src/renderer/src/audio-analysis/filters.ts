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

/** Direct-form-I biquad filter, applied across the whole buffer. */
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

/** Isolates a frequency band (e.g. the kick-drum range) via a high-pass followed by a low-pass. */
export function bandpassFilter(samples: Float32Array, sampleRate: number, lowHz: number, highHz: number): Float32Array {
  const highPassed = applyBiquad(samples, highpassCoefficients(sampleRate, lowHz, Math.SQRT1_2))
  return applyBiquad(highPassed, lowpassCoefficients(sampleRate, highHz, Math.SQRT1_2))
}
