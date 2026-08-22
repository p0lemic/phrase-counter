/** The resizable columns of the library table. The checkbox and the per-row ✕ are fixed. */
export type ColumnKey = 'index' | 'artist' | 'title' | 'bpm' | 'result' | 'duration'

export const MIN_COLUMN_WIDTH = 48

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  // Wide enough for a four-digit row number — 40px cut "1069" off at a thousand songs.
  index: 60,
  artist: 260,
  title: 320,
  bpm: 70,
  result: 260,
  duration: 90
}

const COLUMN_KEYS = Object.keys(DEFAULT_COLUMN_WIDTHS) as ColumnKey[]

export function clampColumnWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width))
}

/** Reads back the saved widths, defaulting anything missing, unknown or nonsensical — the value
 *  comes from localStorage, which an older version (or a stray edit) may have left in any shape. */
export function parseColumnWidths(raw: string | null): Record<ColumnKey, number> {
  const widths = { ...DEFAULT_COLUMN_WIDTHS }
  if (!raw) return widths

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return widths
  }
  if (typeof stored !== 'object' || stored === null) return widths

  for (const key of COLUMN_KEYS) {
    const value = (stored as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) widths[key] = clampColumnWidth(value)
  }
  return widths
}

export function serializeColumnWidths(widths: Record<ColumnKey, number>): string {
  return JSON.stringify(widths)
}
