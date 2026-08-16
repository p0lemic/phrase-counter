import { useEffect, useState } from 'react'
import { analyzeSong } from '../audio-analysis/analyzeSong'
import { formatBlocks } from '../audio-analysis/formatBlocks'
import { songsToCsv, songsToJson } from '../audio-analysis/exportLibrary'
import type { SongRecord } from '../../../shared/song'

interface OpenSongRequest {
  filePath: string
  fileName: string
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  async function refresh(): Promise<void> {
    const fresh = await window.api.db.listSongs()
    setSongs(fresh)
    const freshIds = new Set(fresh.map((song) => song.id))
    setSelectedIds((previous) => new Set([...previous].filter((id) => freshIds.has(id))))
  }

  useEffect(() => {
    refresh()
  }, [])

  /** Re-analyzes every path: inserts new files, and (only when `overwriteExisting`) refreshes
   *  already-known ones — used both by "+ Carpeta"/"+ Archivos" (skip known files) and
   *  "Reescanear carpeta" (always refresh, discarding any manual block edits). */
  async function processPaths(paths: string[], overwriteExisting: boolean): Promise<void> {
    const existingPaths = new Set(songs.map((song) => song.filePath))
    const targetPaths = overwriteExisting ? paths : paths.filter((path) => !existingPaths.has(path))

    for (let i = 0; i < targetPaths.length; i++) {
      setAddProgress({ current: i + 1, total: targetPaths.length })
      const filePath = targetPaths[i]
      try {
        const arrayBuffer = await window.api.readAudioFile(filePath)
        const analysis = await analyzeSong(arrayBuffer)
        const existing = await window.api.db.findSongByPath(filePath)

        if (existing) {
          await window.api.db.updateSongAnalysis(existing.id, {
            bpm: analysis.bpm,
            phraseTimesSec: analysis.phraseTimesSec,
            blocks: analysis.blocks
          })
        } else {
          await window.api.db.insertSong({
            filePath,
            title: basename(filePath),
            bpm: analysis.bpm,
            durationMs: Math.round(analysis.durationSec * 1000),
            phraseTimesSec: analysis.phraseTimesSec,
            blocks: analysis.blocks
          })
        }
      } catch {
        // Skip files that fail to decode (unsupported codec, corrupt file, etc.) and keep going.
      }
    }

    setAddProgress(null)
    await refresh()
  }

  async function handleAddFiles(): Promise<void> {
    const paths = await window.api.openAudioFilesDialog()
    if (paths.length > 0) await processPaths(paths, false)
  }

  async function handleAddFolder(): Promise<void> {
    const paths = await window.api.openAudioFolderDialog()
    if (paths.length > 0) await processPaths(paths, false)
  }

  async function handleRescanFolder(): Promise<void> {
    const paths = await window.api.openAudioFolderDialog()
    if (paths.length === 0) return
    const confirmed = window.confirm(
      `Se van a reanalizar ${paths.length} archivo(s) de esta carpeta. Las canciones que ya estén en la librería recuperarán el resultado automático, perdiendo cualquier ajuste manual de bloques.`
    )
    if (!confirmed) return
    await processPaths(paths, true)
  }

  async function handleDelete(id: number, event: React.MouseEvent): Promise<void> {
    event.stopPropagation()
    await window.api.db.deleteSong(id)
    await refresh()
  }

  function toggleSelected(id: number): void {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(): void {
    setSelectedIds((previous) => (previous.size === songs.length ? new Set() : new Set(songs.map((song) => song.id))))
  }

  async function handleBulkDelete(): Promise<void> {
    if (selectedIds.size === 0) return
    const confirmed = window.confirm(
      `¿Borrar ${selectedIds.size} canción(es) de la librería? Los archivos de audio no se borran.`
    )
    if (!confirmed) return
    await Promise.all([...selectedIds].map((id) => window.api.db.deleteSong(id)))
    setSelectedIds(new Set())
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
        <button onClick={handleRescanFolder} title="Vuelve a analizar todos los archivos de una carpeta, incluidos los que ya estén en la librería">
          Reescanear carpeta
        </button>
        {songs.length > 0 && (
          <>
            <button onClick={handleExportCsv}>Exportar CSV</button>
            <button onClick={handleExportJson}>Exportar JSON</button>
          </>
        )}
        {selectedIds.size > 0 && (
          <button className="library__bulk-delete" onClick={handleBulkDelete}>
            Borrar seleccionadas ({selectedIds.size})
          </button>
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
              <th>
                <input
                  type="checkbox"
                  checked={selectedIds.size === songs.length}
                  onChange={toggleSelectAll}
                  title="Seleccionar todas"
                />
              </th>
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
                onClick={() => onOpenSong({ filePath: song.filePath, fileName: song.title })}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(song.id)}
                    onChange={() => toggleSelected(song.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
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
