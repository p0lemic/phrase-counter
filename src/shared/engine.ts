/** One Engine DJ playlist, with its parent chain already folded into the name. */
export interface EnginePlaylist {
  id: number
  name: string
  /** True for the playlists Engine shows at the top of its sidebar (no parent folder). */
  isRoot: boolean
  /** Ids into the library's `trackPaths`. Engine's own ordering is dropped — collections are sets. */
  trackIds: number[]
}

export interface EngineLibrary {
  /** The folder the data came from, so the UI can show which library is on screen. */
  libraryDir: string
  playlists: EnginePlaylist[]
  /** Absolute path per track id, deduplicated — playlists reference the same track many times over. */
  trackPaths: Record<number, string>
}
