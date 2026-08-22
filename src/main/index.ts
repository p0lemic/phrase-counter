import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import NodeID3 from 'node-id3'
import {
  addSongsToCollection,
  createCollection,
  deleteCollection,
  deleteSong,
  findSongByFilePath,
  insertSong,
  listCollectionMembers,
  listCollections,
  listSongs,
  openDatabase,
  updateSongTags,
  updateSongTagsBulk,
  removeSongsFromCollection,
  renameCollection,
  updateSongAnalysis,
  type NewSongRecord
} from './database'
import { DEFAULT_ENGINE_LIBRARY_DIR, readEngineLibrary } from './engineLibrary'
import { isEngineRunning, revertEngineSync, syncToEngine, type EngineSyncOptions } from './engineSync'
import type { EngineLibrary } from '../shared/engine'
import type { SongAnalysisUpdate, SongMetadata, SongTagsUpdate } from '../shared/song'

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
  key: null
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
    return {
      title: common.title ?? null,
      artist: common.artist ?? null,
      album: common.album ?? null,
      coverDataUrl,
      key: common.key ?? null
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

/** Writes title/artist into an mp3's ID3 tags, leaving every other tag (cover art, rating, our
 *  own block comment) untouched — same merge-in-JS approach as write-song-comment above.
 *  Returns false for formats node-id3 can't write, so the caller can keep the edit library-only. */
ipcMain.handle('write-song-tags', async (_event, filePath: string, tags: SongTagsUpdate): Promise<boolean> => {
  if (!filePath.toLowerCase().endsWith('.mp3')) return false
  try {
    const existingTags = await NodeID3.Promise.read(filePath)
    await NodeID3.Promise.write({ ...existingTags, title: tags.title, artist: tags.artist }, filePath)
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
ipcMain.handle('db:update-song-tags', (_event, id: number, update: SongTagsUpdate) =>
  updateSongTags(id, update)
)
ipcMain.handle('db:update-song-tags-bulk', (_event, updates: { id: number; title: string; artist: string }[]) =>
  updateSongTagsBulk(updates)
)
ipcMain.handle('db:delete-song', (_event, id: number) => deleteSong(id))

ipcMain.handle('db:list-collections', () => listCollections())
ipcMain.handle('db:create-collection', (_event, name: string) => createCollection(name))
ipcMain.handle('db:rename-collection', (_event, id: number, name: string) => renameCollection(id, name))
ipcMain.handle('db:delete-collection', (_event, id: number) => deleteCollection(id))
ipcMain.handle('db:list-collection-members', () => listCollectionMembers())
ipcMain.handle('db:add-songs-to-collection', (_event, collectionId: number, songIds: number[]) =>
  addSongsToCollection(collectionId, songIds)
)
ipcMain.handle('db:remove-songs-from-collection', (_event, collectionId: number, songIds: number[]) =>
  removeSongsFromCollection(collectionId, songIds)
)

ipcMain.handle('engine:read-library', (_event, libraryDir?: string): Promise<EngineLibrary> =>
  readEngineLibrary(libraryDir ?? DEFAULT_ENGINE_LIBRARY_DIR)
)

ipcMain.handle('engine:is-running', (): Promise<boolean> => isEngineRunning())

/** Takes song ids rather than whole records so the renderer doesn't ship its library over IPC —
 *  the main process already holds the same rows. */
function songsForIds(songIds: number[]): ReturnType<typeof listSongs> {
  const wanted = new Set(songIds)
  return listSongs().filter((song) => wanted.has(song.id))
}

ipcMain.handle(
  'engine:sync',
  (
    _event,
    songIds: number[],
    options: Omit<EngineSyncOptions, 'libraryDir'> & { libraryDir?: string }
  ) =>
    syncToEngine(songsForIds(songIds), {
      ...options,
      libraryDir: options.libraryDir ?? DEFAULT_ENGINE_LIBRARY_DIR
    })
)

ipcMain.handle('engine:revert-sync', (_event, songIds: number[], libraryDir?: string) =>
  revertEngineSync(songsForIds(songIds), libraryDir ?? DEFAULT_ENGINE_LIBRARY_DIR)
)

ipcMain.handle('dialog:pick-engine-library', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: DEFAULT_ENGINE_LIBRARY_DIR,
    message: 'Elige la carpeta "Engine Library"'
  })
  return result.canceled ? null : result.filePaths[0]
})

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

  // Empaquetada, el icono lo pone electron-builder (assets/icon.icns|ico); en
  // desarrollo hay que ponerlo a mano o sale el logo de Electron.
  if (is.dev) {
    const devIcon = join(app.getAppPath(), 'assets', 'icon.png')
    if (process.platform === 'darwin') {
      app.dock?.setIcon(devIcon)
    } else {
      mainWindow.setIcon(devIcon)
    }
  }

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
const testUserDataDir = is.dev ? process.env['DROP_COUNT_TEST_USERDATA_DIR'] : undefined
if (testUserDataDir) {
  app.setPath('userData', testUserDataDir)
}

const LIBRARY_DIR = 'phrase-counter'
const LIBRARY_FILE = 'phrase-counter.sqlite'

// Electron derives userData from the app name, which differs between `npm run dev` (package.json
// `name`) and the packaged app (productName) — so the two ended up with separate, silently
// diverging libraries. Pinning the folder gives both the same one.
if (!testUserDataDir) {
  app.setPath('userData', join(app.getPath('appData'), LIBRARY_DIR))
}

// Libraries left behind by the names this app has had before the folder was pinned. Copied over
// the first time, leaving the original in place as a backup. Skipped when running against a
// throwaway userData dir, which is meant to start empty.
const LEGACY_LIBRARIES: [dir: string, file: string][] = [
  ['Phrase Counter', 'phrase-counter.sqlite'],
  ['drop-count', 'drop-count.sqlite'],
  ['Drop Count', 'drop-count.sqlite']
]

function resolveLibraryPath(): string {
  const libraryPath = join(app.getPath('userData'), LIBRARY_FILE)
  if (existsSync(libraryPath) || testUserDataDir) return libraryPath

  for (const [dir, file] of LEGACY_LIBRARIES) {
    const legacyPath = join(app.getPath('appData'), dir, file)
    if (!existsSync(legacyPath)) continue
    mkdirSync(app.getPath('userData'), { recursive: true })
    copyFileSync(legacyPath, libraryPath)
    console.log(`[main] librería migrada desde ${legacyPath}`)
    break
  }
  return libraryPath
}

app.whenReady().then(async () => {
  await openDatabase(resolveLibraryPath())
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
