import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { NewSongRecord, SongRecord } from '../shared/song'

const api = {
  readAudioFile: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('read-audio-file', filePath),
  db: {
    listSongs: (): Promise<SongRecord[]> => ipcRenderer.invoke('db:list-songs'),
    findSongByPath: (filePath: string): Promise<SongRecord | undefined> =>
      ipcRenderer.invoke('db:find-song-by-path', filePath),
    insertSong: (song: NewSongRecord): Promise<SongRecord> => ipcRenderer.invoke('db:insert-song', song),
    updateSongBlocks: (id: number, blocks: SongRecord['blocks']): Promise<void> =>
      ipcRenderer.invoke('db:update-song-blocks', id, blocks),
    deleteSong: (id: number): Promise<void> => ipcRenderer.invoke('db:delete-song', id)
  },
  openAudioFilesDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-audio-files'),
  openAudioFolderDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-audio-folder')
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
