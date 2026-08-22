/** How full the progress bar is, 0-100. Clamped so a miscounted run can't overflow the track. */
export function progressFillPercent(current: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
}
