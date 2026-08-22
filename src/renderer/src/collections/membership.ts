import type { CollectionMember } from '../../../shared/collection'
import type { SongRecord } from '../../../shared/song'

/** Filters songs down to one collection; `null` means "Todas las canciones" and filters nothing. */
export function songsInCollection(
  songs: SongRecord[],
  members: CollectionMember[],
  collectionId: number | null
): SongRecord[] {
  if (collectionId === null) return songs
  const songIds = new Set(members.filter((m) => m.collectionId === collectionId).map((m) => m.songId))
  return songs.filter((song) => songIds.has(song.id))
}

/** Song count per collection, for the sidebar badges. Collections with no songs are absent. */
export function countSongsByCollection(members: CollectionMember[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const member of members) {
    counts.set(member.collectionId, (counts.get(member.collectionId) ?? 0) + 1)
  }
  return counts
}

/** Dragging a selected row carries the whole selection; dragging an unselected one carries just it. */
export function resolveDragIds(draggedId: number, selectedIds: Set<number>): number[] {
  return selectedIds.has(draggedId) ? [...selectedIds] : [draggedId]
}
