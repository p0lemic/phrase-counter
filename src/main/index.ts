import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  deleteSong,
  findSongByFilePath,
  insertSong,
  listSongs,
  openDatabase,
  updateSongBlocks,
  type NewSongRecord
} from './database'

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

ipcMain.handle('db:list-songs', () => listSongs())
ipcMain.handle('db:find-song-by-path', (_event, filePath: string) => findSongByFilePath(filePath))
ipcMain.handle('db:insert-song', (_event, song: NewSongRecord) => insertSong(song))
ipcMain.handle('db:update-song-blocks', (_event, id: number, blocks: NewSongRecord['blocks']) =>
  updateSongBlocks(id, blocks)
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

  if (is.dev) {
    mainWindow.webContents.on('console-message', (_event, _level, message) => {
      console.log('[renderer]', message)
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const debugFile = process.env['DROP_COUNT_DEBUG_FILE']
    const debugRatio = process.env['DROP_COUNT_DEBUG_RATIO']
    const params = new URLSearchParams()
    if (debugFile) params.set('debugFile', debugFile)
    if (debugRatio) params.set('debugRatio', debugRatio)
    const query = params.toString() ? `?${params.toString()}` : ''
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + query)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
