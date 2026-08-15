import { describe, expect, test } from 'vitest'
import { formatBlocks } from './formatBlocks'

describe('formatBlocks', () => {
  test('formats a single block without a breakdown', () => {
    const result = formatBlocks([{ phraseCount: 4, isBreakdown: false }])
    expect(result).toBe('4')
  })

  test('joins multiple non-breakdown blocks with plus signs', () => {
    const result = formatBlocks([
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 6, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false }
    ])
    expect(result).toBe('4+4+6+4')
  })

  test('wraps a breakdown block in parentheses', () => {
    const result = formatBlocks([
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 6, isBreakdown: true },
      { phraseCount: 4, isBreakdown: false }
    ])
    expect(result).toBe('4+4+(6)+4')
  })

  test('wraps multiple non-consecutive breakdown blocks independently', () => {
    const result = formatBlocks([
      { phraseCount: 4, isBreakdown: true },
      { phraseCount: 4, isBreakdown: false },
      { phraseCount: 8, isBreakdown: true }
    ])
    expect(result).toBe('(4)+4+(8)')
  })

  test('returns an empty string for no blocks', () => {
    expect(formatBlocks([])).toBe('')
  })
})
