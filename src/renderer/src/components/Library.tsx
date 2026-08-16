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

type SortKey = 'title' | 'bpm' | 'durationMs'
type Sort = { key: SortKey; direction: 'asc' | 'desc' }

function sortSongs(songs: SongRecord[], sort: Sort): SongRecord[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...songs].sort((a, b) => {
    if (sort.key === 'title') return a.title.localeCompare(b.title) * factor
    return (a[sort.key] - b[sort.key]) * factor
  })
}

export default function Library({ onOpenSong }: { onOpenSong: (song: OpenSongRequest) => void }): React.JSX.Element {
  const [songs, setSongs] = useState<SongRecord[]>([])
  const [addProgress, setAddProgress] = useState<{ current: number; total: number } | null>(null)
  const [writeProgress, setWriteProgress] = useState<{ current: number; total: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<Sort>({ key: 'title', direction: 'asc' })
  const [searchQuery, setSearchQuery] = useState('')

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

  function toggleSelected(id: number): void {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Clicking a new column sorts it ascending; clicking the active column flips its direction. */
  function toggleSort(key: SortKey): void {
    setSort((previous) =>
      previous.key === key ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    )
  }

  function sortIndicator(key: SortKey): string {
    if (sort.key !== key) return ''
    return sort.direction === 'asc' ? ' ▲' : ' ▼'
  }

  function toggleSelectAll(): void {
    const visibleIds = visibleSongs.map((song) => song.id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds((previous) => {
      const next = new Set(previous)
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
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

  /** Writes each selected song's formatted result into its mp3's ID3 comment tag (see
   *  SongAnalysisView's "Guardar en MP3"), so it shows up in Engine DJ and similar software. */
  async function handleBulkWriteComments(): Promise<void> {
    if (selectedIds.size === 0) return
    const targets = songs.filter((song) => selectedIds.has(song.id))
    const confirmed = window.confirm(
      `Se va a escribir el resultado en el comentario (ID3) de ${targets.length} archivo(s) mp3. Esto modifica los archivos en el disco (el resto de sus etiquetas, como carátula o rating, no se toca).`
    )
    if (!confirmed) return

    for (let i = 0; i < targets.length; i++) {
      setWriteProgress({ current: i + 1, total: targets.length })
      try {
        await window.api.writeSongComment(targets[i].filePath, formatBlocks(targets[i].blocks))
      } catch {
        // Skip files that fail to write (not an mp3, locked, read-only, etc.) and keep going.
      }
    }
    setWriteProgress(null)
  }

  async function handleExportCsv(): Promise<void> {
    await window.api.exportLibrary(songsToCsv(songs), 'drop-count.csv')
  }

  async function handleExportJson(): Promise<void> {
    await window.api.exportLibrary(songsToJson(songs), 'drop-count.json')
  }

  const query = searchQuery.trim().toLowerCase()
  const filteredSongs = query ? songs.filter((song) => song.title.toLowerCase().includes(query)) : songs
  const visibleSongs = sortSongs(filteredSongs, sort)

  return (
    <div className="library">
      <div className="library__toolbar">
        <span className="library__search">
          🔍
          <input
            type="text"
            placeholder="Buscar por título…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </span>
        <span className="library__count">
          {query ? `${visibleSongs.length} de ${songs.length}` : songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
        </span>
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
          <>
            <button
              onClick={handleBulkWriteComments}
              disabled={writeProgress !== null}
              title="Escribe el resultado en el comentario (ID3) de cada mp3 — visible en Engine DJ y software similar"
            >
              Escribir en MP3 ({selectedIds.size})
            </button>
            <button className="library__bulk-delete" onClick={handleBulkDelete}>
              Borrar seleccionadas ({selectedIds.size})
            </button>
          </>
        )}
        {addProgress && (
          <span className="library__progress">
            Analizando {addProgress.current}/{addProgress.total}…
          </span>
        )}
        {writeProgress && (
          <span className="library__progress">
            Escribiendo {writeProgress.current}/{writeProgress.total}…
          </span>
        )}
      </div>

      {songs.length === 0 ? (
        <p className="library__empty">
          Tu librería está vacía. Añade canciones o arrastra un archivo de audio.
        </p>
      ) : visibleSongs.length === 0 ? (
        <p className="library__empty">Ninguna canción coincide con "{searchQuery}".</p>
      ) : (
        <table className="library__table">
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ width: '40px' }} />
            <col style={{ width: '40%' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '90px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={visibleSongs.length > 0 && visibleSongs.every((song) => selectedIds.has(song.id))}
                  onChange={toggleSelectAll}
                  title="Seleccionar todas"
                />
              </th>
              <th className="library__index">#</th>
              <th className="library__sortable" onClick={() => toggleSort('title')}>
                Título{sortIndicator('title')}
              </th>
              <th className="library__sortable library__index" onClick={() => toggleSort('bpm')}>
                BPM{sortIndicator('bpm')}
              </th>
              <th>Resultado</th>
              <th className="library__sortable library__index" onClick={() => toggleSort('durationMs')}>
                Duración{sortIndicator('durationMs')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleSongs.map((song, i) => (
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
                <td className="library__index">{i + 1}</td>
                <td className="library__title">{song.title}</td>
                <td className="library__index">{Math.round(song.bpm)}</td>
                <td className="library__result">{formatBlocks(song.blocks)}</td>
                <td className="library__index">{formatDuration(song.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
