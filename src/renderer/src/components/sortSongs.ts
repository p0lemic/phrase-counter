import type { SongRecord } from '../../../shared/song'

export type SortKey = 'artist' | 'title' | 'bpm' | 'durationMs'
export interface Sort {
  key: SortKey
  direction: 'asc' | 'desc'
}

/** Orders the table. `null` means no sorting: the order songs entered the library, which is the
 *  only order that doesn't move a row out from under you while you're editing its title or artist.
 *  (The database hands songs back by updated_at, which an edit changes — so that can't be it.) */
export function sortSongs(songs: SongRecord[], sort: Sort | null): SongRecord[] {
  if (sort === null) return [...songs].sort((a, b) => a.id - b.id)

  const factor = sort.direction === 'asc' ? 1 : -1
  return [...songs].sort((a, b) => {
    if (sort.key === 'title' || sort.key === 'artist') {
      return a[sort.key].localeCompare(b[sort.key]) * factor
    }
    return (a[sort.key] - b[sort.key]) * factor
  })
}

/** Clicking a header cycles it: ascending, descending, then back to no sorting at all. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current === null || current.key !== key) return { key, direction: 'asc' }
  return current.direction === 'asc' ? { key, direction: 'desc' } : null
}
