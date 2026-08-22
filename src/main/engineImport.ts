import { isAbsolute, normalize, resolve } from 'node:path'

export interface EnginePlaylistRow {
  id: number
  parentListId: number
  title: string
}

/** Engine nests playlists under parents and only makes titles unique per parent — two different
 *  "TEMAZOS" are normal. Our collections have a globally unique name, so each one carries its
 *  parent chain: "Dance / TEMAZOS". */
export function flattenPlaylistNames(rows: EnginePlaylistRow[]): Map<number, string> {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const names = new Map<number, string>()

  for (const row of rows) {
    const parts: string[] = []
    // A corrupt library could have a parent loop; `seen` keeps that from spinning forever.
    const seen = new Set<number>()
    let current: EnginePlaylistRow | undefined = row
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      parts.unshift(current.title)
      current = byId.get(current.parentListId)
    }
    names.set(row.id, parts.join(' / '))
  }

  return names
}

/** Engine stores each track's path relative to the library folder (`../../Desktop/Musica/x.mp3`).
 *  Returns null for the rows that carry no usable path, such as streaming entries. */
export function resolveTrackPath(libraryDir: string, trackPath: string): string | null {
  if (!trackPath.trim()) return null
  return isAbsolute(trackPath) ? normalize(trackPath) : resolve(libraryDir, trackPath)
}
