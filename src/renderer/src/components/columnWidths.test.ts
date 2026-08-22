import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COLUMN_WIDTHS,
  MIN_COLUMN_WIDTH,
  clampColumnWidth,
  parseColumnWidths,
  serializeColumnWidths
} from './columnWidths'

describe('clampColumnWidth', () => {
  it('leaves a sensible width alone', () => {
    expect(clampColumnWidth(240)).toBe(240)
  })

  it('never lets a column shrink past its minimum', () => {
    expect(clampColumnWidth(5)).toBe(MIN_COLUMN_WIDTH)
  })

  it('rounds to whole pixels', () => {
    expect(clampColumnWidth(240.6)).toBe(241)
  })
})

describe('parseColumnWidths', () => {
  it('falls back to the defaults when nothing was ever saved', () => {
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS)
  })

  it('falls back to the defaults when the stored value is not valid JSON', () => {
    expect(parseColumnWidths('{ not json')).toEqual(DEFAULT_COLUMN_WIDTHS)
  })

  it('keeps the stored width of a known column', () => {
    expect(parseColumnWidths('{"title": 400}').title).toBe(400)
  })

  it('fills in the defaults for columns that were never resized', () => {
    expect(parseColumnWidths('{"title": 400}').artist).toBe(DEFAULT_COLUMN_WIDTHS.artist)
  })

  it('ignores keys that are not columns', () => {
    expect(parseColumnWidths('{"nope": 400}')).toEqual(DEFAULT_COLUMN_WIDTHS)
  })

  it('ignores values that are not usable numbers', () => {
    expect(parseColumnWidths('{"title": "wide"}').title).toBe(DEFAULT_COLUMN_WIDTHS.title)
    expect(parseColumnWidths('{"title": null}').title).toBe(DEFAULT_COLUMN_WIDTHS.title)
  })

  it('clamps a stored width that would make the column unusable', () => {
    expect(parseColumnWidths('{"title": 1}').title).toBe(MIN_COLUMN_WIDTH)
  })

  it('survives a stored value that is not an object at all', () => {
    expect(parseColumnWidths('42')).toEqual(DEFAULT_COLUMN_WIDTHS)
  })

  it('round-trips through serialize', () => {
    const widths = { ...DEFAULT_COLUMN_WIDTHS, title: 420 }
    expect(parseColumnWidths(serializeColumnWidths(widths))).toEqual(widths)
  })
})

describe('DEFAULT_COLUMN_WIDTHS', () => {
  it('gives the row number room for a four-digit library', () => {
    // 1069 songs and counting: "1069" was being cut off at the old 40px.
    expect(DEFAULT_COLUMN_WIDTHS.index).toBeGreaterThanOrEqual(56)
  })
})
