import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Collection, CollectionMember } from '../shared/collection'
import type {
  EngineLibrary,
  EngineRevertResult,
  EngineSyncRequest,
  EngineSyncResult
} from '../shared/engine'
import type {
  NewSongRecord,
  SongAnalysisUpdate,
  SongMetadata,
  SongRecord,
  SongTagsUpdate
} from '../shared/song'

const api = {
  readAudioFile: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('read-audio-file', filePath),
  readSongMetadata: (filePath: string): Promise<SongMetadata> => ipcRenderer.invoke('read-song-metadata', filePath),
  writeSongComment: (filePath: string, comment: string): Promise<boolean> =>
    ipcRenderer.invoke('write-song-comment', filePath, comment),
  /** Resolves false when the file's format has no writable tags (anything but mp3). */
  writeSongTags: (filePath: string, tags: SongTagsUpdate): Promise<boolean> =>
    ipcRenderer.invoke('write-song-tags', filePath, tags),
  db: {
    listSongs: (): Promise<SongRecord[]> => ipcRenderer.invoke('db:list-songs'),
    findSongByPath: (filePath: string): Promise<SongRecord | undefined> =>
      ipcRenderer.invoke('db:find-song-by-path', filePath),
    insertSong: (song: NewSongRecord): Promise<SongRecord> => ipcRenderer.invoke('db:insert-song', song),
    updateSongAnalysis: (id: number, update: SongAnalysisUpdate): Promise<void> =>
      ipcRenderer.invoke('db:update-song-analysis', id, update),
    updateSongTags: (id: number, update: SongTagsUpdate): Promise<void> =>
      ipcRenderer.invoke('db:update-song-tags', id, update),
    updateSongTagsBulk: (updates: ({ id: number } & SongTagsUpdate)[]): Promise<void> =>
      ipcRenderer.invoke('db:update-song-tags-bulk', updates),
    deleteSong: (id: number): Promise<void> => ipcRenderer.invoke('db:delete-song', id),
    listCollections: (): Promise<Collection[]> => ipcRenderer.invoke('db:list-collections'),
    createCollection: (name: string): Promise<Collection> => ipcRenderer.invoke('db:create-collection', name),
    renameCollection: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('db:rename-collection', id, name),
    deleteCollection: (id: number): Promise<void> => ipcRenderer.invoke('db:delete-collection', id),
    listCollectionMembers: (): Promise<CollectionMember[]> => ipcRenderer.invoke('db:list-collection-members'),
    addSongsToCollection: (collectionId: number, songIds: number[]): Promise<void> =>
      ipcRenderer.invoke('db:add-songs-to-collection', collectionId, songIds),
    removeSongsFromCollection: (collectionId: number, songIds: number[]): Promise<void> =>
      ipcRenderer.invoke('db:remove-songs-from-collection', collectionId, songIds)
  },
  engine: {
    /** Reads Engine DJ's library (read-only). Defaults to ~/Music/Engine Library. */
    readLibrary: (libraryDir?: string): Promise<EngineLibrary> =>
      ipcRenderer.invoke('engine:read-library', libraryDir),
    pickLibraryDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-engine-library'),
    /** Engine holds its database open while it runs, so a sync has to wait for it to close. */
    isRunning: (): Promise<boolean> => ipcRenderer.invoke('engine:is-running'),
    /** Writes our analysis into Engine's library. `dryRun` only counts what would change. */
    sync: (songIds: number[], options: EngineSyncRequest): Promise<EngineSyncResult> =>
      ipcRenderer.invoke('engine:sync', songIds, options),
    /** Strips the title suffixes and blanks the cues a sync wrote. */
    revertSync: (songIds: number[], libraryDir?: string): Promise<EngineRevertResult> =>
      ipcRenderer.invoke('engine:revert-sync', songIds, libraryDir)
  },
  openAudioFilesDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-audio-files'),
  openAudioFolderDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-audio-folder'),
  exportLibrary: (content: string, defaultFileName: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:export-library', content, defaultFileName)
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
