/** Rough time left for a batch, from the pace so far. Null while there's nothing to extrapolate
 *  from (no song finished yet) or nothing left to do. Rounded up: an estimate that reads shorter
 *  than the truth is worse than one that reads longer. */
export function formatEta(elapsedMs: number, completed: number, total: number): string | null {
  const remaining = total - completed
  if (completed <= 0 || remaining <= 0) return null

  const remainingSec = Math.ceil(((elapsedMs / completed) * remaining) / 1000)
  if (remainingSec < 60) return `${remainingSec} s`

  const minutes = Math.ceil(remainingSec / 60)
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}
