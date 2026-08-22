import { useCallback, useEffect, useState } from 'react'
import { countSongsByCollection } from './membership'
import type { Collection, CollectionMember } from '../../../shared/collection'

export interface CollectionsApi {
  collections: Collection[]
  members: CollectionMember[]
  /** Song count per collection id — collections with no songs are absent from the map. */
  counts: Map<number, number>
  refresh: () => Promise<void>
  addSongs: (collectionId: number, songIds: number[]) => Promise<void>
  removeSongs: (collectionId: number, songIds: number[]) => Promise<void>
  /** Creates the collection (or reuses one with that name) and drops the songs into it. */
  createWithSongs: (name: string, songIds: number[]) => Promise<Collection>
  rename: (id: number, name: string) => Promise<void>
  remove: (id: number) => Promise<void>
}

/** Owns the collections + their song links, reloading both after every change. Both lists are small
 *  enough to keep whole in memory, so filtering and counting happen here rather than over IPC. */
export function useCollections(): CollectionsApi {
  const [collections, setCollections] = useState<Collection[]>([])
  const [members, setMembers] = useState<CollectionMember[]>([])

  const refresh = useCallback(async () => {
    const [freshCollections, freshMembers] = await Promise.all([
      window.api.db.listCollections(),
      window.api.db.listCollectionMembers()
    ])
    setCollections(freshCollections)
    setMembers(freshMembers)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addSongs = useCallback(
    async (collectionId: number, songIds: number[]) => {
      if (songIds.length === 0) return
      await window.api.db.addSongsToCollection(collectionId, songIds)
      await refresh()
    },
    [refresh]
  )

  const removeSongs = useCallback(
    async (collectionId: number, songIds: number[]) => {
      if (songIds.length === 0) return
      await window.api.db.removeSongsFromCollection(collectionId, songIds)
      await refresh()
    },
    [refresh]
  )

  const createWithSongs = useCallback(
    async (name: string, songIds: number[]) => {
      const collection = await window.api.db.createCollection(name)
      if (songIds.length > 0) await window.api.db.addSongsToCollection(collection.id, songIds)
      await refresh()
      return collection
    },
    [refresh]
  )

  const rename = useCallback(
    async (id: number, name: string) => {
      await window.api.db.renameCollection(id, name)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number) => {
      await window.api.db.deleteCollection(id)
      await refresh()
    },
    [refresh]
  )

  return {
    collections,
    members,
    counts: countSongsByCollection(members),
    refresh,
    addSongs,
    removeSongs,
    createWithSongs,
    rename,
    remove
  }
}
