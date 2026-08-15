import { describe, expect, test } from 'vitest'
import { computeTapBpm } from './tapTempo'

describe('computeTapBpm', () => {
  test('returns null with fewer than two taps', () => {
    expect(computeTapBpm([])).toBeNull()
    expect(computeTapBpm([1000])).toBeNull()
  })

  test('computes BPM from the average interval between taps', () => {
    // 500ms apart = 120 BPM
    const taps = [0, 500, 1000, 1500, 2000]
    expect(computeTapBpm(taps)).toBeCloseTo(120, 5)
  })

  test('averages out slightly uneven human tapping', () => {
    const taps = [0, 490, 1010, 1495, 2005] // ~500ms apart, jittery
    expect(computeTapBpm(taps)).toBeCloseTo(120, 0)
  })
})
