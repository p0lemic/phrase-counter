import { useState } from 'react'

interface Props {
  value: string
  /** Shown greyed out when the value is empty — e.g. a song whose file carries no artist tag. */
  placeholder: string
  onCommit: (value: string) => void
  title?: string
}

/** A table cell you edit in place: double-click opens it, blur or Enter saves, Escape cancels.
 *  Double-click rather than a single one because the row's own click opens the song — and clicks
 *  inside the cell stop there, so an edit never opens the song behind it. */
export default function EditableCell({ value, placeholder, onCommit, title }: Props): React.JSX.Element {
  const [isEditing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit(): void {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }

  if (isEditing) {
    return (
      <input
        className="editable-cell__input"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className="editable-cell"
      title={title ?? 'Doble clic para editar'}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={() => {
        setDraft(value)
        setEditing(true)
      }}
    >
      {value || <span className="editable-cell__placeholder">{placeholder}</span>}
    </span>
  )
}
