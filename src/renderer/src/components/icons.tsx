/** Line icons on a 24px grid, stroked with currentColor so they follow the surrounding text color.
 *  Drawn rather than taken from an emoji font: these scale and recolor with the theme. */
function Icon({ children, size = 14 }: { children: React.ReactNode; size?: number }): React.JSX.Element {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function SearchIcon(): React.JSX.Element {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Icon>
  )
}

export function NoteIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </Icon>
  )
}

export function PlusIcon(): React.JSX.Element {
  return (
    <Icon size={13}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function ExportIcon(): React.JSX.Element {
  return (
    <Icon size={13}>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
      <path d="M4 19h16" />
    </Icon>
  )
}

export function CloseIcon(): React.JSX.Element {
  return (
    <Icon size={12}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}
