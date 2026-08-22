import { useState } from 'react'
import { getDraggedSongIds, isSongDrag } from '../collections/dragData'
import { NoteIcon } from './icons'
import type { Collection } from '../../../shared/collection'

interface Props {
  collections: Collection[]
  counts: Map<number, number>
  totalSongs: number
  activeCollectionId: number | null
  onSelect: (collectionId: number | null) => void
  onDropSongs: (collectionId: number, songIds: number[]) => void
  onCreate: (name: string, songIds: number[]) => void
  onRename: (collectionId: number, name: string) => void
  onDelete: (collectionId: number) => void
  onImportFromEngine: () => void
}

/** The id a drop is currently hovering over — `'new'` for the "+ Nueva colección" row. */
type DropTarget = number | 'new' | null

export default function CollectionsSidebar({
  collections,
  counts,
  totalSongs,
  activeCollectionId,
  onSelect,
  onDropSongs,
  onCreate,
  onRename,
  onDelete,
  onImportFromEngine
}: Props): React.JSX.Element {
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  /** The collection being named right now, with the songs waiting to go into it (empty when the
   *  row was clicked rather than dropped on). Electron has no window.prompt, so the name is typed
   *  in place. */
  const [newDraft, setNewDraft] = useState<{ name: string; songIds: number[] } | null>(null)

  /** Only claims song drags, so a Finder file drop still falls through to App's dropzone. */
  function handleDragOver(event: React.DragEvent, target: DropTarget): void {
    if (!isSongDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDropTarget(target)
  }

  function takeDroppedSongIds(event: React.DragEvent): number[] | null {
    setDropTarget(null)
    if (!isSongDrag(event.dataTransfer)) return null
    event.preventDefault()
    event.stopPropagation()
    return getDraggedSongIds(event.dataTransfer)
  }

  function startNewCollection(songIds: number[]): void {
    setNewDraft({ name: songIds.length > 0 ? `Colección de ${songIds.length}` : '', songIds })
  }

  function commitNewCollection(): void {
    const draft = newDraft
    setNewDraft(null)
    if (draft && draft.name.trim()) onCreate(draft.name.trim(), draft.songIds)
  }

  function commitRename(collection: Collection): void {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (name && name !== collection.name) onRename(collection.id, name)
  }

  function handleDelete(collection: Collection): void {
    const confirmed = window.confirm(
      `¿Borrar la colección "${collection.name}"? Las canciones se quedan en la librería.`
    )
    if (confirmed) onDelete(collection.id)
  }

  return (
    <aside className="collections">
      <button
        className={`collections__item${activeCollectionId === null ? ' collections__item--active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <NoteIcon />
        <span className="collections__name">Todas las canciones</span>
        <span className="collections__count">{totalSongs}</span>
      </button>

      <h2 className="collections__heading">Colecciones</h2>

      {collections.length === 0 && (
        <p className="collections__empty">
          Arrastra canciones aquí abajo para crear tu primera colección.
        </p>
      )}

      <ul className="collections__list">
        {collections.map((collection) => (
          <li key={collection.id}>
            {renamingId === collection.id ? (
              <input
                className="collections__rename"
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => commitRename(collection)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename(collection)
                  if (event.key === 'Escape') setRenamingId(null)
                }}
              />
            ) : (
              <div
                className={[
                  'collections__item',
                  activeCollectionId === collection.id ? 'collections__item--active' : '',
                  dropTarget === collection.id ? 'collections__item--drop' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(collection.id)}
                onDoubleClick={() => {
                  setRenamingId(collection.id)
                  setRenameDraft(collection.name)
                }}
                onDragOver={(event) => handleDragOver(event, collection.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => {
                  const songIds = takeDroppedSongIds(event)
                  if (songIds) onDropSongs(collection.id, songIds)
                }}
                title="Doble clic para renombrar. Suelta canciones aquí para añadirlas."
              >
                <span className="collections__name">{collection.name}</span>
                <span className="collections__count">{counts.get(collection.id) ?? 0}</span>
                <button
                  className="collections__delete"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete(collection)
                  }}
                  title="Borrar colección"
                >
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {newDraft ? (
        <input
          className="collections__rename collections__rename--new"
          autoFocus
          placeholder="Nombre de la colección"
          value={newDraft.name}
          onChange={(event) => setNewDraft({ ...newDraft, name: event.target.value })}
          onBlur={commitNewCollection}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitNewCollection()
            if (event.key === 'Escape') setNewDraft(null)
          }}
        />
      ) : (
        <div
          className={`collections__new${dropTarget === 'new' ? ' collections__new--drop' : ''}`}
          onClick={() => startNewCollection([])}
          onDragOver={(event) => handleDragOver(event, 'new')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => {
            const songIds = takeDroppedSongIds(event)
            if (songIds) startNewCollection(songIds)
          }}
          title="Crea una colección — o suelta aquí las canciones seleccionadas para crearla con ellas"
        >
          + Nueva colección
        </div>
      )}

      <button
        className="collections__import"
        onClick={onImportFromEngine}
        title="Crea colecciones a partir de las listas de reproducción de tu biblioteca de Engine DJ"
      >
        Importar de Engine DJ
      </button>
    </aside>
  )
}
