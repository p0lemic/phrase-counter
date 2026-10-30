import { useEffect, useRef, useState } from 'react'
import { decodeAudioBuffer } from '../audio-analysis/decode'
import { analysisConcurrency, getAnalysisPool } from '../audio-analysis/analysisPool'
import { engineGrids } from '../audio-analysis/engineGrids'
import { runConcurrently } from '../audio-analysis/runConcurrently'
import { formatBlocks } from '../audio-analysis/formatBlocks'
import { songsToCsv, songsToJson } from '../audio-analysis/exportLibrary'
import { linkedPathsToRegrid } from '../collections/engineImport'
import { resolveDragIds, songsInCollection } from '../collections/membership'
import { setDraggedSongIds } from '../collections/dragData'
import { useCollections } from '../collections/useCollections'
import { resolveSongTags } from '../tags/resolveSongTags'
import CollectionsSidebar from './CollectionsSidebar'
import DropdownMenu, { SEPARATOR } from './DropdownMenu'
import EditableCell from './EditableCell'
import { useColumnWidths } from './useColumnWidths'
import { nextSort, sortSongs, type Sort, type SortKey } from './sortSongs'
import type { ColumnKey } from './columnWidths'
import EngineImportPanel, { type EngineSelection } from './EngineImportPanel'
import EngineSyncPanel from './EngineSyncPanel'
import ProgressToast, { type Progress } from './ProgressToast'
import { CloseIcon, ExportIcon, PlusIcon, SearchIcon } from './icons'
import type { SongRecord, SongTagsUpdate } from '../../../shared/song'

interface OpenSongRequest {
  filePath: string
  fileName: string
}

/** What analyzing a file the library already holds does to what is stored for it:
 *  - `skip-analyzed`: leave an already-analyzed song exactly as it is (adding files, importing).
 *  - `regrid`: recompute grid and BPM, keeping blocks the user has edited by hand.
 *  - `replace`: recompute everything, manual block edits included (rescanning a folder). */
type ExistingSongPolicy = 'skip-analyzed' | 'regrid' | 'replace'

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function Library({
  onOpenSong,
  refreshToken
}: {
  onOpenSong: (song: OpenSongRequest) => void
  /** Bumped when a song view closes, so the table picks up whatever was edited in there. */
  refreshToken: number
}): React.JSX.Element {
  const [songs, setSongs] = useState<SongRecord[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<Sort | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null)
  const [isEngineImportOpen, setEngineImportOpen] = useState(false)
  const [isEngineSyncOpen, setEngineSyncOpen] = useState(false)
  /** Songs whose edit couldn't reach the file's tags — shown with a marker in the row. */
  const [libraryOnlyIds, setLibraryOnlyIds] = useState<Set<number>>(new Set())
  /** The song just edited: the table is sorted by the very fields being edited, so its row jumps
   *  somewhere else on save. Following it keeps the other field one double-click away. */
  const [focusedSongId, setFocusedSongId] = useState<number | null>(null)
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null)
  /** Flipped by the "Cancelar" button to stop a long analysis run between files. */
  const cancelRef = useRef(false)
  const collections = useCollections()
  const columns = useColumnWidths()

  async function refresh(): Promise<SongRecord[]> {
    const fresh = await window.api.db.listSongs()
    setSongs(fresh)
    const freshIds = new Set(fresh.map((song) => song.id))
    setSelectedIds((previous) => new Set([...previous].filter((id) => freshIds.has(id))))
    // Deleting songs also drops their collection links, so the sidebar counts need re-reading.
    await collections.refresh()
    return fresh
  }

  useEffect(() => {
    refresh().then(backfillTags)
  }, [])

  useEffect(() => {
    if (refreshToken > 0) refresh()
  }, [refreshToken])

  // Runs again once `songs` comes back from the save, which is when the row has already moved.
  useEffect(() => {
    if (focusedSongId === null) return
    focusedRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(() => setFocusedSongId(null), 2500)
    return () => clearTimeout(timer)
  }, [focusedSongId, songs])

  /** Songs stored before title/artist existed carry the file name as their title and no artist.
   *  This reads each one's real tags once — cheap next to analysis, since it never decodes audio —
   *  and `tagsRead` makes it resumable: cancelling only leaves the rest for the next launch. */
  async function backfillTags(allSongs: SongRecord[]): Promise<void> {
    const pending = allSongs.filter((song) => !song.tagsRead)
    if (pending.length === 0) return

    cancelRef.current = false
    const startedAt = Date.now()
    let batch: ({ id: number } & SongTagsUpdate)[] = []
    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) break
      const song = pending[i]
      setProgress({
        label: 'Leyendo etiquetas',
        current: i + 1,
        total: pending.length,
        fileName: basename(song.filePath),
        startedAt
      })
      batch.push({ id: song.id, ...(await resolveSongTags(song.filePath, basename(song.filePath))) })
      if (batch.length >= 50) {
        await window.api.db.updateSongTagsBulk(batch)
        batch = []
      }
    }
    if (batch.length > 0) await window.api.db.updateSongTagsBulk(batch)

    setProgress(null)
    await refresh()
  }

  /** Saves an edited title/artist to the library and into the file's own tags. Formats without
   *  writable tags (or a file we can't write) keep the edit library-side, flagged in the row. */
  async function saveTags(song: SongRecord, update: SongTagsUpdate): Promise<void> {
    setFocusedSongId(song.id)
    await window.api.db.updateSongTags(song.id, update)
    const writtenToFile = await window.api.writeSongTags(song.filePath, update)
    setLibraryOnlyIds((previous) => {
      const next = new Set(previous)
      if (writtenToFile) next.delete(song.id)
      else next.add(song.id)
      return next
    })
    await refresh()
  }

  /** Analyzes one file and stores it, returning the stored song. What happens to a file the library
   *  already knows is up to `policy` — note that "already in the library" isn't the same as
   *  "analyzed": a song whose grid was invalidated by a migration is still missing its analysis,
   *  and skipping it there is what left imported collections full of gridless songs.
   *  Returns undefined for files that fail to decode (unsupported codec, corrupt file, ...). */
  async function analyzeAndStore(filePath: string, policy: ExistingSongPolicy): Promise<SongRecord | undefined> {
    try {
      const existing = await window.api.db.findSongByPath(filePath)
      if (existing && policy === 'skip-analyzed' && existing.phraseTimesSec.length > 0) return existing

      const arrayBuffer = await window.api.readAudioFile(filePath)
      // Decoding stays here (OfflineAudioContext is main-thread only) but Chromium runs it off
      // the UI thread; the expensive half goes to a worker, several songs at a time.
      const decoded = await decodeAudioBuffer(arrayBuffer)
      const engineGrid = await engineGrids.gridFor(filePath)
      const analysis = await getAnalysisPool().submit({ ...decoded, engineGrid })
      const update = {
        bpm: analysis.bpm,
        phraseTimesSec: analysis.phraseTimesSec,
        // A regrid is about the timing, not the structure: whatever blocks the user has edited by
        // hand survive it, exactly as they do in "Recalcular rejillas".
        blocks: policy === 'regrid' && existing && existing.blocks.length > 0 ? existing.blocks : analysis.blocks,
        gridSource: analysis.gridSource
      }

      if (existing) {
        await window.api.db.updateSongAnalysis(existing.id, update)
        return { ...existing, ...update }
      }
      const tags = await resolveSongTags(filePath, basename(filePath))
      return await window.api.db.insertSong({
        filePath,
        ...tags,
        tagsRead: true,
        durationMs: Math.round(analysis.durationSec * 1000),
        ...update
      })
    } catch {
      return undefined
    }
  }

  /** Rebuilds the beat grid of what you're looking at: the songs you've ticked, or else the ones
   *  the table is showing (the open collection, narrowed by the search box). Saved block edits are
   *  kept — only the grid and the bpm are recomputed. */
  async function handleRebuildGrids(): Promise<void> {
    const targets = gridRebuildTargets
    if (targets.length === 0) return

    // Reading Engine's library takes a moment and the rebuild needs it anyway; doing it here means
    // the confirmation can say how many of these songs will get an exact grid instead of a guess.
    setProgress({
      label: 'Leyendo la biblioteca de Engine DJ',
      current: 0,
      total: targets.length,
      fileName: '',
      startedAt: Date.now()
    })
    const withEngineGrid = await engineGrids.countKnown(targets.map((song) => song.filePath))
    setProgress(null)

    const confirmed = window.confirm(
      `Se van a recalcular las rejillas de ${targets.length} canción(es) ${gridRebuildScope}. ` +
        `${withEngineGrid} de ellas están analizadas en Engine DJ y usarán su rejilla y su BPM, que ` +
        `son exactos; el resto se detectan como siempre. Puede tardar un rato — podrás cancelar a ` +
        `mitad y lo hecho se conserva. Los bloques que hayas editado a mano no se tocan.`
    )
    if (!confirmed) return

    cancelRef.current = false
    const startedAt = Date.now()
    let completed = 0
    await runConcurrently(
      targets,
      analysisConcurrency(),
      async (song) => {
        try {
          const arrayBuffer = await window.api.readAudioFile(song.filePath)
          const decoded = await decodeAudioBuffer(arrayBuffer)
          const engineGrid = await engineGrids.gridFor(song.filePath)
          const analysis = await getAnalysisPool().submit({ ...decoded, engineGrid })
          await window.api.db.updateSongAnalysis(song.id, {
            bpm: analysis.bpm,
            phraseTimesSec: analysis.phraseTimesSec,
            blocks: song.blocks.length > 0 ? song.blocks : analysis.blocks,
            gridSource: analysis.gridSource
          })
        } finally {
          completed++
          setProgress({
            label: 'Recalculando rejillas',
            current: completed,
            total: targets.length,
            fileName: basename(song.filePath),
            startedAt
          })
        }
      },
      () => cancelRef.current
    )

    setProgress(null)
    await refresh()
  }

  /** Re-analyzes every path: inserts new files, and (only when `overwriteExisting`) refreshes
   *  already-known ones — used both by "+ Carpeta"/"+ Archivos" (skip known files) and
   *  "Reescanear carpeta" (always refresh, discarding any manual block edits). */
  async function processPaths(paths: string[], overwriteExisting: boolean): Promise<void> {
    const existingPaths = new Set(songs.map((song) => song.filePath))
    const targetPaths = overwriteExisting ? paths : paths.filter((path) => !existingPaths.has(path))

    cancelRef.current = false
    const startedAt = Date.now()
    let completed = 0
    await runConcurrently(
      targetPaths,
      analysisConcurrency(),
      async (filePath) => {
        await analyzeAndStore(filePath, overwriteExisting ? 'replace' : 'skip-analyzed')
        completed++
        setProgress({
          label: 'Analizando canciones',
          current: completed,
          total: targetPaths.length,
          fileName: basename(filePath),
          startedAt
        })
      },
      () => cancelRef.current
    )

    setProgress(null)
    await refresh()
  }

  /** Turns the chosen Engine DJ playlists into collections: first links the songs we already have
   *  (instant), then analyzes the missing files one by one, adding each to its collection as it
   *  lands so a long run keeps making visible progress. */
  async function handleEngineImport(selections: EngineSelection[]): Promise<void> {
    setEngineImportOpen(false)

    // Linking a song we had already analyzed isn't the end of it: Engine's grid is exact where it
    // exists, and a song analyzed before we ever read Engine's library keeps a tempo and a phase
    // that are close but not the ones the controller plays to. The import goes back over those.
    // The panel primed these grids on the way in, so asking costs nothing here.
    const linkedIds = new Set(selections.flatMap((selection) => selection.songIds))
    const linkedSongs = songs.filter((song) => linkedIds.has(song.id))
    const withEngineGrid = await engineGrids.pathsWithGrid(linkedSongs.map((song) => song.filePath))

    const created: { collectionId: number; pendingPaths: string[] }[] = []
    for (const selection of selections) {
      const collection = await window.api.db.createCollection(selection.name)
      await window.api.db.addSongsToCollection(collection.id, selection.songIds)
      created.push({
        collectionId: collection.id,
        pendingPaths: [
          ...selection.missingPaths,
          ...linkedPathsToRegrid(selection.songIds, songs, withEngineGrid)
        ]
      })
    }
    await refresh()

    const pendingPaths = created.flatMap((collection) => collection.pendingPaths)
    const total = pendingPaths.length
    if (total === 0) return
    const regridding = total - selections.reduce((sum, selection) => sum + selection.missingPaths.length, 0)
    const exact = (await engineGrids.pathsWithGrid(pendingPaths)).size
    const analyze = window.confirm(
      `Colecciones creadas con las canciones que ya tenías.\n\nQuedan ${total} canción(es) por analizar` +
        `${regridding > 0 ? `, ${regridding} de ellas ya en tu librería pero con una rejilla que no es la de Engine` : ''}. ` +
        `${exact} usarán la rejilla y el BPM exactos de Engine DJ; el resto se detectan como siempre. ` +
        `Aceptar las analiza ahora (puede tardar mucho; podrás cancelar a mitad y lo hecho se conserva). ` +
        `Los bloques que hayas editado a mano no se tocan, pero sí se pierde cualquier ajuste manual de la ` +
        `rejilla. Cancelar deja las colecciones tal cual.`
    )
    if (!analyze) return

    cancelRef.current = false
    const startedAt = Date.now()
    let done = 0
    // A song can sit in two of the chosen playlists; the second time round it is already on
    // Engine's grid, so it only needs linking, not analyzing again.
    const analyzed = new Set<string>()
    for (const { collectionId, pendingPaths } of created) {
      // Added in batches so a long run doesn't rewrite the database file once per song.
      let pending: number[] = []
      await runConcurrently(
        pendingPaths,
        analysisConcurrency(),
        async (filePath) => {
          const song = await analyzeAndStore(filePath, analyzed.has(filePath) ? 'skip-analyzed' : 'regrid')
          analyzed.add(filePath)
          done++
          setProgress({
            label: 'Analizando canciones',
            current: done,
            total,
            fileName: basename(filePath),
            startedAt
          })
          if (song) pending.push(song.id)
          if (pending.length >= 25) {
            const batch = pending
            pending = []
            await window.api.db.addSongsToCollection(collectionId, batch)
          }
        },
        () => cancelRef.current
      )
      if (pending.length > 0) await window.api.db.addSongsToCollection(collectionId, pending)
      if (cancelRef.current) break
    }

    setProgress(null)
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

  function toggleSort(key: SortKey): void {
    setSort((previous) => nextSort(previous, key))
  }

  /** The grab strip on a header's right edge. Its own clicks never reach the header's sort. */
  function resizeHandle(key: ColumnKey): React.JSX.Element {
    return (
      <span
        className={`library__resize${columns.resizingKey === key ? ' library__resize--active' : ''}`}
        title="Arrastra para ajustar el ancho · doble clic para restaurarlo"
        onMouseDown={(event) => columns.startResize(key, event)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.stopPropagation()
          columns.reset(key)
        }}
      />
    )
  }

  function sortIndicator(key: SortKey): string {
    if (sort?.key !== key) return ''
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

    cancelRef.current = false
    const startedAt = Date.now()
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break
      setProgress({
        label: 'Escribiendo en MP3',
        current: i + 1,
        total: targets.length,
        fileName: basename(targets[i].filePath),
        startedAt
      })
      try {
        await window.api.writeSongComment(targets[i].filePath, formatBlocks(targets[i].blocks))
      } catch {
        // Skip files that fail to write (not an mp3, locked, read-only, etc.) and keep going.
      }
    }
    setProgress(null)
  }

  async function handleRemoveFromCollection(): Promise<void> {
    if (activeCollectionId === null || selectedIds.size === 0) return
    await collections.removeSongs(activeCollectionId, [...selectedIds])
    setSelectedIds(new Set())
  }

  /** The per-row ✕: unlinks one song from the open collection without touching the library. */
  async function removeSongFromCollection(songId: number): Promise<void> {
    if (activeCollectionId === null) return
    await collections.removeSongs(activeCollectionId, [songId])
    setSelectedIds((previous) => {
      if (!previous.has(songId)) return previous
      const next = new Set(previous)
      next.delete(songId)
      return next
    })
  }

  async function handleExportCsv(): Promise<void> {
    await window.api.exportLibrary(songsToCsv(songs), 'phrase-counter.csv')
  }

  async function handleExportJson(): Promise<void> {
    await window.api.exportLibrary(songsToJson(songs), 'phrase-counter.json')
  }

  const collectionSongs = songsInCollection(songs, collections.members, activeCollectionId)
  const query = searchQuery.trim().toLowerCase()
  const filteredSongs = query
    ? collectionSongs.filter(
        (song) =>
          song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)
      )
    : collectionSongs
  const visibleSongs = sortSongs(filteredSongs, sort)
  const activeCollection = collections.collections.find((c) => c.id === activeCollectionId)
  // What "Recalcular rejillas" acts on: the ticked songs, or else exactly what the table shows.
  const gridRebuildTargets =
    selectedIds.size > 0 ? songs.filter((song) => selectedIds.has(song.id)) : visibleSongs
  const gridRebuildScope =
    selectedIds.size > 0
      ? 'seleccionadas'
      : activeCollection
        ? `de «${activeCollection.name}»`
        : 'de la librería'
  const gridsPending = gridRebuildTargets.filter((song) => song.phraseTimesSec.length === 0).length

  return (
    <div className="library-layout">
      <CollectionsSidebar
        collections={collections.collections}
        counts={collections.counts}
        totalSongs={songs.length}
        activeCollectionId={activeCollectionId}
        onSelect={setActiveCollectionId}
        onDropSongs={(collectionId, songIds) => collections.addSongs(collectionId, songIds)}
        onCreate={(name, songIds) => collections.createWithSongs(name, songIds)}
        onRename={(collectionId, name) => collections.rename(collectionId, name)}
        onImportFromEngine={() => setEngineImportOpen(true)}
        onDelete={(collectionId) => {
          if (activeCollectionId === collectionId) setActiveCollectionId(null)
          collections.remove(collectionId)
        }}
      />
      <div className="library">
        <div className="library__toolbar">
          <span className="library__search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Buscar por título o autor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="library__search-clear"
                onClick={() => setSearchQuery('')}
                title="Borrar la búsqueda"
              >
                <CloseIcon />
              </button>
            )}
          </span>
          <span className="library__count">
            {query ? `${visibleSongs.length} de ${collectionSongs.length}` : collectionSongs.length}{' '}
            {collectionSongs.length === 1 ? 'canción' : 'canciones'}
          </span>
          <span className="library__toolbar-gap" />
          {gridRebuildTargets.length > 0 && (
            <button
              onClick={handleRebuildGrids}
              disabled={progress !== null}
              title={`Vuelve a calcular la rejilla de compases de las ${gridRebuildTargets.length} canción(es) ${gridRebuildScope}${gridsPending > 0 ? ` — ${gridsPending} no tienen rejilla` : ''}`}
            >
              Recalcular rejillas ({gridRebuildTargets.length})
              {gridsPending > 0 && <span className="library__pending-badge">{gridsPending}</span>}
            </button>
          )}
          <DropdownMenu
            label="Añadir"
            icon={<PlusIcon />}
            items={[
              { label: 'Archivos…', onSelect: handleAddFiles },
              { label: 'Carpeta…', onSelect: handleAddFolder },
              SEPARATOR,
              {
                label: 'Reescanear carpeta…',
                onSelect: handleRescanFolder,
                title:
                  'Vuelve a analizar todos los archivos de una carpeta, incluidos los que ya estén en la librería'
              }
            ]}
          />
          <DropdownMenu
            label="Exportar"
            icon={<ExportIcon />}
            disabled={songs.length === 0}
            items={[
              { label: 'CSV', onSelect: handleExportCsv },
              { label: 'JSON', onSelect: handleExportJson },
              SEPARATOR,
              {
                label: 'Enviar a Engine DJ…',
                onSelect: () => setEngineSyncOpen(true),
                title:
                  'Escribe la estructura en el título y en los hot cues de Engine — que es lo que sí se ve en la pantalla de la controladora'
              }
            ]}
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="selection-bar">
            <span className="selection-bar__count">
              {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
            </span>
            <span className="library__toolbar-gap" />
            <button
              onClick={handleBulkWriteComments}
              disabled={progress !== null}
              title="Escribe el resultado en el comentario (ID3) de cada mp3 — visible en Engine DJ y software similar"
            >
              Escribir en MP3
            </button>
            {activeCollection && (
              <button
                onClick={handleRemoveFromCollection}
                title={`Quita las canciones de "${activeCollection.name}" — siguen en la librería y en sus otras colecciones`}
              >
                Quitar de «{activeCollection.name}»
              </button>
            )}
            <button className="selection-bar__delete" onClick={handleBulkDelete}>
              Borrar
            </button>
            <button
              className="selection-bar__clear"
              onClick={() => setSelectedIds(new Set())}
              title="Quitar la selección"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {songs.length === 0 ? (
          <p className="library__empty">
            Tu librería está vacía. Añade canciones o arrastra un archivo de audio.
          </p>
        ) : collectionSongs.length === 0 ? (
          <p className="library__empty">
            "{activeCollection?.name}" está vacía. Arrastra aquí canciones desde "Todas las canciones".
          </p>
        ) : visibleSongs.length === 0 ? (
          <p className="library__empty">Ninguna canción coincide con "{searchQuery}".</p>
        ) : (
          <div className="library__table-scroll">
            <table className="library__table">
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: `${columns.widths.index}px` }} />
                <col style={{ width: `${columns.widths.artist}px` }} />
                <col style={{ width: `${columns.widths.title}px` }} />
                <col style={{ width: `${columns.widths.bpm}px` }} />
                <col style={{ width: `${columns.widths.result}px` }} />
                <col style={{ width: `${columns.widths.duration}px` }} />
                {activeCollection && <col style={{ width: '32px' }} />}
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
                  <th className="library__index">
                    #{resizeHandle('index')}
                  </th>
                  <th className="library__sortable" onClick={() => toggleSort('artist')}>
                    Autor{sortIndicator('artist')}
                    {resizeHandle('artist')}
                  </th>
                  <th className="library__sortable" onClick={() => toggleSort('title')}>
                    Título{sortIndicator('title')}
                    {resizeHandle('title')}
                  </th>
                  <th className="library__sortable library__index" onClick={() => toggleSort('bpm')}>
                    BPM{sortIndicator('bpm')}
                    {resizeHandle('bpm')}
                  </th>
                  <th>
                    Resultado{resizeHandle('result')}
                  </th>
                  <th className="library__sortable library__index" onClick={() => toggleSort('durationMs')}>
                    Duración{sortIndicator('durationMs')}
                    {resizeHandle('duration')}
                  </th>
                  {activeCollection && <th />}
                </tr>
              </thead>
              <tbody>
                {visibleSongs.map((song, i) => (
                  <tr
                    key={song.id}
                    ref={song.id === focusedSongId ? focusedRowRef : undefined}
                    className={song.id === focusedSongId ? 'library__row--focused' : undefined}
                    draggable
                    onDragStart={(event) => setDraggedSongIds(event.dataTransfer, resolveDragIds(song.id, selectedIds))}
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
                    <td className="library__title">
                      <EditableCell
                        value={song.artist}
                        placeholder="Sin autor"
                        onCommit={(artist) => saveTags(song, { title: song.title, artist })}
                      />
                    </td>
                    <td className="library__title">
                      <EditableCell
                        value={song.title}
                        placeholder="Sin título"
                        onCommit={(title) => saveTags(song, { title, artist: song.artist })}
                      />
                      {libraryOnlyIds.has(song.id) && (
                        <span
                          className="library__library-only"
                          title={
                            song.filePath.toLowerCase().endsWith('.mp3')
                              ? 'No se pudo escribir la etiqueta en el archivo — el cambio se guarda solo en Phrase Counter'
                              : 'Este formato no admite etiquetas escribibles — el cambio se guarda solo en Phrase Counter'
                          }
                        >
                          •
                        </span>
                      )}
                    </td>
                    <td className="library__index">{Math.round(song.bpm)}</td>
                    <td className="library__result">{formatBlocks(song.blocks)}</td>
                    <td className="library__index">{formatDuration(song.durationMs)}</td>
                    {activeCollection && (
                      <td className="library__row-remove-cell">
                        <button
                          className="library__row-remove"
                          title={`Quitar de «${activeCollection.name}» — la canción sigue en la librería`}
                          onClick={(event) => {
                            event.stopPropagation()
                            removeSongFromCollection(song.id)
                          }}
                        >
                          <CloseIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {progress && <ProgressToast progress={progress} onCancel={() => (cancelRef.current = true)} />}
      {isEngineImportOpen && (
        <EngineImportPanel
          songs={songs}
          onClose={() => setEngineImportOpen(false)}
          onImport={handleEngineImport}
        />
      )}
      {isEngineSyncOpen && (
        <EngineSyncPanel
          songs={gridRebuildTargets}
          scopeLabel={selectedIds.size > 0 ? 'seleccionada(s)' : 'a la vista'}
          onClose={() => setEngineSyncOpen(false)}
        />
      )}
    </div>
  )
}
