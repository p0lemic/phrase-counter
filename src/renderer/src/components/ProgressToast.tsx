import { useMemo } from 'react'
import { formatEta } from './formatEta'
import { progressFillPercent } from './progressFill'

export interface Progress {
  /** What's happening — "Analizando canciones", "Escribiendo en MP3"… */
  label: string
  current: number
  total: number
  /** File being worked on right now, so a long run visibly moves even when the count crawls. */
  fileName: string
  /** When the run started, for the estimate — these batches run for minutes. */
  startedAt: number
}

/** Floating progress readout, bottom-right. It used to sit in the toolbar, where a long analysis
 *  run competed for space with every other action. */
export default function ProgressToast({
  progress,
  onCancel
}: {
  progress: Progress
  onCancel: () => void
}): React.JSX.Element {
  // Recomputed only when the count moves. Reading the clock on every render instead made the
  // estimate climb while nothing finished and snap back when something did — with several songs
  // analyzed at once, completions arrive in bursts and it swung between wildly different numbers.
  const eta = useMemo(
    () => formatEta(Date.now() - progress.startedAt, progress.current, progress.total),
    [progress.current, progress.total, progress.startedAt]
  )

  return (
    <div className="progress-toast">
      <div className="progress-toast__header">
        <span className="progress-toast__label">{progress.label}</span>
        <span className="progress-toast__count">
          {progress.current}/{progress.total}
          {eta && <span className="progress-toast__eta"> · ~{eta}</span>}
        </span>
      </div>
      <div className="progress-toast__track">
        <div
          className="progress-toast__fill"
          style={{ width: `${progressFillPercent(progress.current, progress.total)}%` }}
        />
      </div>
      <div className="progress-toast__footer">
        <span className="progress-toast__file">{progress.fileName}</span>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
