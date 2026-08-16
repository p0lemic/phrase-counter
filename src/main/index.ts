import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import NodeID3 from 'node-id3'
import {
  deleteSong,
  findSongByFilePath,
  insertSong,
  listSongs,
  openDatabase,
  updateSongAnalysis,
  type NewSongRecord
} from './database'
import type { SongAnalysisUpdate, SongMetadata } from '../shared/song'

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aiff', '.m4a', '.ogg']

function isAudioFile(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function scanFolderForAudioFiles(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const entryPath = join(folderPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await scanFolderForAudioFiles(entryPath)))
    } else if (entry.isFile() && isAudioFile(entryPath)) {
      results.push(entryPath)
    }
  }
  return results
}

ipcMain.handle('read-audio-file', async (_event, filePath: string): Promise<ArrayBuffer> => {
  if (!isAudioFile(filePath)) {
    throw new Error(`Not an audio file: ${filePath}`)
  }
  const buffer = await readFile(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
})

const EMPTY_METADATA: SongMetadata = {
  title: null,
  artist: null,
  album: null,
  coverDataUrl: null,
  key: null,
  ratingStars: null
}

ipcMain.handle('read-song-metadata', async (_event, filePath: string): Promise<SongMetadata> => {
  // music-metadata is ESM-only; this file builds to CJS, so it must be loaded via dynamic import.
  const { parseFile } = await import('music-metadata')
  try {
    const { common } = await parseFile(filePath, { skipCovers: false })
    const picture = common.picture?.[0]
    const coverDataUrl = picture
      ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
      : null
    const rating = common.rating?.find((r) => r.rating !== undefined)?.rating

    return {
      title: common.title ?? null,
      artist: common.artist ?? null,
      album: common.album ?? null,
      coverDataUrl,
      key: common.key ?? null,
      ratingStars: rating !== undefined ? Math.round(rating * 5) : null
    }
  } catch {
    // Missing/corrupt tags shouldn't block opening the song — just show nothing extra.
    return EMPTY_METADATA
  }
})

ipcMain.handle('write-song-comment', async (_event, filePath: string, comment: string): Promise<boolean> => {
  // ID3 (and this library) is an MP3 tag format — other formats we support (wav/flac/aiff/m4a/ogg)
  // use different tagging systems we don't write to.
  if (!filePath.toLowerCase().endsWith('.mp3')) return false
  try {
    // Read the existing tags and explicitly overwrite just the comment key ourselves, then write
    // the whole set back — rather than relying on update()'s own frame-matching to find and
    // replace the prior comment, which only actually replaces it when its language/description
    // happen to match what we write. Doing the merge here in plain JS guarantees the old comment
    // is gone and only ours remains, no matter what wrote it or how it was tagged, while every
    // other existing tag (title, cover art, rating, ...) passes through untouched.
    const existingTags = await NodeID3.Promise.read(filePath)
    // Despite its .d.ts claiming Promise<boolean>, write() actually resolves with undefined on
    // success (confirmed empirically) — not throwing is what signals success, not the resolved value.
    await NodeID3.Promise.write({ ...existingTags, comment: { language: 'eng', text: comment } }, filePath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('db:list-songs', () => listSongs())
ipcMain.handle('db:find-song-by-path', (_event, filePath: string) => findSongByFilePath(filePath))
ipcMain.handle('db:insert-song', (_event, song: NewSongRecord) => insertSong(song))
ipcMain.handle('db:update-song-analysis', (_event, id: number, update: SongAnalysisUpdate) =>
  updateSongAnalysis(id, update)
)
ipcMain.handle('db:delete-song', (_event, id: number) => deleteSong(id))

ipcMain.handle('dialog:open-audio-files', async (): Promise<string[]> => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS.map((ext) => ext.slice(1)) }]
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:open-audio-folder', async (): Promise<string[]> => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return []
  return scanFolderForAudioFiles(result.filePaths[0])
})

ipcMain.handle(
  'dialog:export-library',
  async (_event, content: string, defaultFileName: string): Promise<boolean> => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultFileName })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, content, 'utf-8')
    return true
  }
)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const debugFile = process.env['DROP_COUNT_DEBUG_FILE']
    const query = debugFile ? `?debugFile=${encodeURIComponent(debugFile)}` : ''
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + query)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Dev-only escape hatch to point the whole app (DB + Electron profile) at a throwaway folder
// during manual testing, so it never touches the user's real library at the default userData path.
if (is.dev && process.env['DROP_COUNT_TEST_USERDATA_DIR']) {
  app.setPath('userData', process.env['DROP_COUNT_TEST_USERDATA_DIR'])
}

app.whenReady().then(async () => {
  await openDatabase(join(app.getPath('userData'), 'drop-count.sqlite'))
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
