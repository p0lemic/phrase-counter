import { describe, expect, it } from 'vitest'
import { formatEta } from './formatEta'

describe('formatEta', () => {
  it('has nothing to estimate from before the first song finishes', () => {
    expect(formatEta(5_000, 0, 100)).toBeNull()
  })

  it('estimates from the pace so far', () => {
    // 10 songs in 20 s is 2 s each; 90 left is 180 s.
    expect(formatEta(20_000, 10, 100)).toBe('3 min')
  })

  it('counts in seconds when under a minute is left', () => {
    expect(formatEta(10_000, 10, 15)).toBe('5 s')
  })

  it('rounds minutes up, so the estimate never reads shorter than it is', () => {
    // 61 s left should not read as "1 min".
    expect(formatEta(10_000, 10, 71)).toBe('2 min')
  })

  it('says nothing once everything is done', () => {
    expect(formatEta(20_000, 100, 100)).toBeNull()
  })

  it('does not go negative if the count overshoots the total', () => {
    expect(formatEta(20_000, 101, 100)).toBeNull()
  })

  it('switches to hours for a very long run', () => {
    // 1 song per 60 s, 200 left.
    expect(formatEta(60_000, 1, 201)).toBe('3 h 20 min')
  })
})
