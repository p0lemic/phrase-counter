import { describe, expect, test } from 'vitest'
import { formatBlocks } from './formatBlocks'

describe('formatBlocks', () => {
  test('formats a single block without a drop', () => {
    const result = formatBlocks([{ phraseCount: 4, isDrop: false }])
    expect(result).toBe('4')
  })

  test('joins multiple non-drop blocks with plus signs', () => {
    const result = formatBlocks([
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false },
      { phraseCount: 6, isDrop: false },
      { phraseCount: 4, isDrop: false }
    ])
    expect(result).toBe('4+4+6+4')
  })

  test('wraps a drop block in parentheses', () => {
    const result = formatBlocks([
      { phraseCount: 4, isDrop: false },
      { phraseCount: 4, isDrop: false },
      { phraseCount: 6, isDrop: true },
      { phraseCount: 4, isDrop: false }
    ])
    expect(result).toBe('4+4+(6)+4')
  })

  test('wraps multiple non-consecutive drop blocks independently', () => {
    const result = formatBlocks([
      { phraseCount: 4, isDrop: true },
      { phraseCount: 4, isDrop: false },
      { phraseCount: 8, isDrop: true }
    ])
    expect(result).toBe('(4)+4+(8)')
  })

  test('returns an empty string for no blocks', () => {
    expect(formatBlocks([])).toBe('')
  })
})
