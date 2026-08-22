import { useState } from 'react'
import {
  DEFAULT_COLUMN_WIDTHS,
  clampColumnWidth,
  parseColumnWidths,
  serializeColumnWidths,
  type ColumnKey
} from './columnWidths'

const STORAGE_KEY = 'drop-count:column-widths'

export interface ColumnWidths {
  widths: Record<ColumnKey, number>
  /** The column being dragged right now, so only its handle lights up. */
  resizingKey: ColumnKey | null
  /** Call from the header handle's onMouseDown; tracks the pointer until it's released. */
  startResize: (key: ColumnKey, event: React.MouseEvent) => void
  reset: (key: ColumnKey) => void
}

/** Column widths the user drags, remembered across restarts. They're a view preference, so they
 *  live in localStorage rather than in the library database. */
export function useColumnWidths(): ColumnWidths {
  const [widths, setWidths] = useState(() => parseColumnWidths(localStorage.getItem(STORAGE_KEY)))
  const [resizingKey, setResizingKey] = useState<ColumnKey | null>(null)

  function persist(next: Record<ColumnKey, number>): void {
    setWidths(next)
    localStorage.setItem(STORAGE_KEY, serializeColumnWidths(next))
  }

  function startResize(key: ColumnKey, event: React.MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = widths[key]
    // Tracked here rather than read back from state, so the save on mouse-up doesn't depend on a
    // re-render having landed — and so the updater stays pure under StrictMode's double calls.
    let latestWidth = startWidth

    function handleMove(move: MouseEvent): void {
      latestWidth = clampColumnWidth(startWidth + move.clientX - startX)
      setWidths((previous) => ({ ...previous, [key]: latestWidth }))
    }

    function handleUp(): void {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.classList.remove('is-resizing-column')
      setResizingKey(null)
      persist({ ...widths, [key]: latestWidth })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    // Keeps the cursor as a resize arrow and stops text selecting while dragging over the table.
    document.body.classList.add('is-resizing-column')
    setResizingKey(key)
  }

  function reset(key: ColumnKey): void {
    persist({ ...widths, [key]: DEFAULT_COLUMN_WIDTHS[key] })
  }

  return { widths, resizingKey, startResize, reset }
}
