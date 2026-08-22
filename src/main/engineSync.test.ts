import { describe, expect, it } from 'vitest'
import { titleWithStructure, titleWithoutStructure } from './engineSync'

describe('titleWithStructure', () => {
  it('appends the structure behind a marker', () => {
    expect(titleWithStructure('Nightmare', '8+16+(4)+16+8')).toBe('Nightmare [PC 8+16+(4)+16+8]')
  })

  it('replaces a previous suffix instead of stacking another one', () => {
    const once = titleWithStructure('Nightmare', '8+16')
    const twice = titleWithStructure(once, '4+(2)+8')
    expect(twice).toBe('Nightmare [PC 4+(2)+8]')
    expect(titleWithStructure(twice, '4+(2)+8')).toBe(twice)
  })

  it('leaves brackets that are part of the real title alone', () => {
    expect(titleWithStructure('Saturno (Remix) [2000]', '8+8')).toBe(
      'Saturno (Remix) [2000] [PC 8+8]'
    )
    expect(titleWithStructure('Kurushi [Original Mix]', '4+4')).toBe(
      'Kurushi [Original Mix] [PC 4+4]'
    )
  })

  it('strips the suffix when there is no structure to write', () => {
    expect(titleWithStructure('Nightmare [PC 8+16]', '')).toBe('Nightmare')
  })
})

describe('titleWithoutStructure', () => {
  it('removes only our own suffix', () => {
    expect(titleWithoutStructure('Nightmare [PC 8+16+(4)]')).toBe('Nightmare')
    expect(titleWithoutStructure('Saturno [2000]')).toBe('Saturno [2000]')
    expect(titleWithoutStructure('Kurushi [Original Mix]')).toBe('Kurushi [Original Mix]')
  })

  it('is a no-op on a title that was never synced', () => {
    expect(titleWithoutStructure('Nightmare')).toBe('Nightmare')
  })

  it('round-trips with titleWithStructure', () => {
    const original = 'Klaxon (Extended) [1996]'
    expect(titleWithoutStructure(titleWithStructure(original, '2+(4)+8'))).toBe(original)
  })
})
