import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  title?: string
}

/** A separator between groups of items. */
export const SEPARATOR = 'separator' as const

interface Props {
  label: string
  icon: React.ReactNode
  items: (MenuItem | typeof SEPARATOR)[]
  disabled?: boolean
}

/** Button that opens a small menu, collapsing a row of toolbar buttons into one. Closes on Escape,
 *  on a click anywhere outside, and after picking an item. */
export default function DropdownMenu({ label, icon, items, disabled }: Props): React.JSX.Element {
  const [isOpen, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="dropdown" ref={containerRef}>
      <button
        className={`dropdown__button${isOpen ? ' dropdown__button--open' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((open) => !open)}
      >
        {icon}
        {label}
        <svg className="dropdown__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="dropdown__menu">
          {items.map((item, index) =>
            item === SEPARATOR ? (
              <div key={`separator-${index}`} className="dropdown__separator" />
            ) : (
              <button
                key={item.label}
                className="dropdown__item"
                title={item.title}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
