/** Our own drag MIME type: it's what tells an internal song drag apart from a Finder file drop,
 *  which matters because the whole library sits inside App's file dropzone. dataTransfer.getData()
 *  is unreadable during dragover, but the type list isn't — hence a dedicated type instead of a flag
 *  inside the payload. */
export const SONG_IDS_MIME = 'application/x-drop-count-song-ids'

export function setDraggedSongIds(dataTransfer: DataTransfer, songIds: number[]): void {
  dataTransfer.setData(SONG_IDS_MIME, JSON.stringify(songIds))
  dataTransfer.effectAllowed = 'copy'
}

export function isSongDrag(dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes(SONG_IDS_MIME)
}

export function getDraggedSongIds(dataTransfer: DataTransfer): number[] {
  const raw = dataTransfer.getData(SONG_IDS_MIME)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []
  } catch {
    return []
  }
}
