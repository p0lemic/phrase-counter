import { describe, expect, it } from 'vitest'
import { progressFillPercent } from './progressFill'

describe('progressFillPercent', () => {
  it('is empty before the first song finishes', () => {
    expect(progressFillPercent(0, 258)).toBe(0)
  })

  it('fills proportionally through the run', () => {
    expect(progressFillPercent(129, 258)).toBe(50)
  })

  it('is full on the last song', () => {
    expect(progressFillPercent(258, 258)).toBe(100)
  })

  it('never overflows if the count runs past the total', () => {
    expect(progressFillPercent(300, 258)).toBe(100)
  })

  it('stays at zero for an empty run instead of dividing by zero', () => {
    expect(progressFillPercent(0, 0)).toBe(0)
  })
})
