import { useEffect, useMemo, useState } from 'react'
import { matchTrackPaths } from '../collections/engineImport'
import { SearchIcon } from './icons'
import type { EngineLibrary } from '../../../shared/engine'
import type { SongRecord } from '../../../shared/song'

/** One playlist the user picked, already resolved against our library. */
export interface EngineSelection {
  name: string
  songIds: number[]
  missingPaths: string[]
}

interface Props {
  songs: SongRecord[]
  onClose: () => void
  onImport: (selections: EngineSelection[]) => void
}

/** Engine has thousands of playlists (one per release, in some collections) — rendering them all
 *  would be a wall of checkboxes, so the list is capped and the search box does the narrowing. */
const MAX_VISIBLE = 200

interface PlaylistOption extends EngineSelection {
  id: number
  isRoot: boolean
  total: number
}

export default function EngineImportPanel({ songs, onClose, onImport }: Props): React.JSX.Element {
  const [library, setLibrary] = useState<EngineLibrary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  /** Engine nests a playlist per release inside some collections; only the top-level ones — the
   *  entries its own sidebar shows — are worth offering by default. */
  const [showNested, setShowNested] = useState(false)

  async function load(libraryDir?: string): Promise<void> {
    setError(null)
    setLibrary(null)
    try {
      setLibrary(await window.api.engine.readLibrary(libraryDir))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handlePickFolder(): Promise<void> {
    const libraryDir = await window.api.engine.pickLibraryDir()
    if (libraryDir) await load(libraryDir)
  }

  const options = useMemo<PlaylistOption[]>(() => {
    if (!library) return []
    return library.playlists
      .filter((playlist) => playlist.trackIds.length > 0)
      .map((playlist) => {
        const paths = playlist.trackIds.map((trackId) => library.trackPaths[trackId])
        const { songIds, missingPaths } = matchTrackPaths(paths, songs)
        return {
          id: playlist.id,
          name: playlist.name,
          isRoot: playlist.isRoot,
          songIds,
          missingPaths,
          total: songIds.length + missingPaths.length
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [library, songs])

  const search = query.trim().toLowerCase()
  const nestedCount = options.filter((option) => !option.isRoot).length
  const scoped = showNested ? options : options.filter((option) => option.isRoot)
  const matching = search ? scoped.filter((o) => o.name.toLowerCase().includes(search)) : scoped
  const visible = matching.slice(0, MAX_VISIBLE)
  const selected = options.filter((option) => selectedIds.has(option.id))
  const toAnalyze = selected.reduce((sum, option) => sum + option.missingPaths.length, 0)

  function toggle(id: number): void {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>Importar de Engine DJ</h2>
          <button className="modal__close" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {error ? (
          <div className="modal__body">
            <p className="library__empty">{error}</p>
            <button onClick={handlePickFolder}>Elegir carpeta "Engine Library"…</button>
          </div>
        ) : !library ? (
          <div className="modal__body">
            <p className="library__empty">Leyendo la biblioteca de Engine DJ…</p>
          </div>
        ) : (
          <>
            <div className="modal__toolbar">
              <span className="library__search">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Buscar lista…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
              <span className="library__count">
                {matching.length} lista{matching.length === 1 ? '' : 's'}
              </span>
              {nestedCount > 0 && (
                <label className="engine-list__toggle">
                  <input
                    type="checkbox"
                    checked={showNested}
                    onChange={(event) => setShowNested(event.target.checked)}
                  />
                  Ver también las sublistas ({nestedCount})
                </label>
              )}
              <span className="library__toolbar-gap" />
              <button onClick={handlePickFolder} title={library.libraryDir}>
                Otra carpeta…
              </button>
            </div>

            <div className="modal__body">
              <ul className="engine-list">
                {visible.map((option) => (
                  <li key={option.id}>
                    <label className="engine-list__row">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(option.id)}
                        onChange={() => toggle(option.id)}
                      />
                      <span className="engine-list__name">{option.name}</span>
                      <span className="engine-list__count">
                        {option.songIds.length} de {option.total} en tu librería
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {matching.length > visible.length && (
                <p className="engine-list__more">
                  Mostrando las {MAX_VISIBLE} listas más grandes de {matching.length}. Busca por nombre para
                  encontrar el resto.
                </p>
              )}
            </div>
          </>
        )}

        {library && !error && (
          <div className="modal__footer">
            <span className="library__count">
              {selected.length === 0
                ? 'Ninguna lista seleccionada'
                : `${selected.length} lista(s) · ${toAnalyze} canción(es) por analizar`}
            </span>
            <button onClick={onClose}>Cancelar</button>
            <button
              className="modal__primary"
              disabled={selected.length === 0}
              onClick={() =>
                onImport(
                  selected.map(({ name, songIds, missingPaths }) => ({ name, songIds, missingPaths }))
                )
              }
            >
              Importar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
