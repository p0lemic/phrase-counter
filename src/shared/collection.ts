/** A logical grouping of songs — a crate/playlist. A song can belong to any number of them. */
export interface Collection {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

/** One song-belongs-to-collection link. The renderer loads them all at once and joins in memory. */
export interface CollectionMember {
  collectionId: number
  songId: number
}
