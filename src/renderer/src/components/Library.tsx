import { useEffect, useState } from 'react'
import { analyzeSong } from '../audio-analysis/analyzeSong'
import { formatBlocks } from '../audio-analysis/formatBlocks'
import { songsToCsv, songsToJson } from '../audio-analysis/exportLibrary'
import type { SongRecord } from '../../../shared/song'

interface OpenSongRequest {
  filePath: string
  fileName: string
  songId: number
  initialBlocks: SongRecord['blocks']
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function Library({ onOpenSong }: { onOpenSong: (song: OpenSongRequest) => void }): React.JSX.Element {
  const [songs, setSongs] = useState<SongRecord[]>([])
  const [addProgress, setAddProgress] = useState<{ current: number; total: number } | null>(null)

  async function refresh(): Promise<void> {
    setSongs(await window.api.db.listSongs())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addPaths(paths: string[]): Promise<void> {
    const existingPaths = new Set(songs.map((song) => song.filePath))
    const newPaths = paths.filter((path) => !existingPaths.has(path))

    for (let i = 0; i < newPaths.length; i++) {
      setAddProgress({ current: i + 1, total: newPaths.length })
      try {
        const arrayBuffer = await window.api.readAudioFile(newPaths[i])
        const analysis = await analyzeSong(arrayBuffer)
        await window.api.db.insertSong({
          filePath: newPaths[i],
          title: basename(newPaths[i]),
          bpm: analysis.bpm,
          durationMs: Math.round(analysis.durationSec * 1000),
          blocks: analysis.blocks
        })
      } catch {
        // Skip files that fail to decode (unsupported codec, corrupt file, etc.) and keep going.
      }
    }

    setAddProgress(null)
    await refresh()
  }

  async function handleAddFiles(): Promise<void> {
    const paths = await window.api.openAudioFilesDialog()
    if (paths.length > 0) await addPaths(paths)
  }

  async function handleAddFolder(): Promise<void> {
    const paths = await window.api.openAudioFolderDialog()
    if (paths.length > 0) await addPaths(paths)
  }

  async function handleDelete(id: number, event: React.MouseEvent): Promise<void> {
    event.stopPropagation()
    await window.api.db.deleteSong(id)
    await refresh()
  }

  async function handleExportCsv(): Promise<void> {
    await window.api.exportLibrary(songsToCsv(songs), 'drop-count.csv')
  }

  async function handleExportJson(): Promise<void> {
    await window.api.exportLibrary(songsToJson(songs), 'drop-count.json')
  }

  return (
    <div className="library">
      <div className="library__toolbar">
        <button onClick={handleAddFiles}>+ Archivos</button>
        <button onClick={handleAddFolder}>+ Carpeta</button>
        {songs.length > 0 && (
          <>
            <button onClick={handleExportCsv}>Exportar CSV</button>
            <button onClick={handleExportJson}>Exportar JSON</button>
          </>
        )}
        {addProgress && (
          <span className="library__progress">
            Analizando {addProgress.current}/{addProgress.total}…
          </span>
        )}
      </div>

      {songs.length === 0 ? (
        <p className="library__empty">
          Tu librería está vacía. Añade canciones o arrastra un archivo de audio.
        </p>
      ) : (
        <table className="library__table">
          <thead>
            <tr>
              <th>Título</th>
              <th>BPM</th>
              <th>Resultado</th>
              <th>Duración</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr
                key={song.id}
                onClick={() =>
                  onOpenSong({
                    filePath: song.filePath,
                    fileName: song.title,
                    songId: song.id,
                    initialBlocks: song.blocks
                  })
                }
              >
                <td>{song.title}</td>
                <td>{Math.round(song.bpm)}</td>
                <td className="library__result">{formatBlocks(song.blocks)}</td>
                <td>{formatDuration(song.durationMs)}</td>
                <td>
                  <button className="library__delete" onClick={(e) => handleDelete(song.id, e)} title="Borrar de la librería">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
