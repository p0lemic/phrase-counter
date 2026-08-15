/** Estimates BPM from a sequence of tap timestamps (ms), averaging the gaps between them. */
export function computeTapBpm(tapTimestampsMs: number[]): number | null {
  if (tapTimestampsMs.length < 2) return null

  const intervalsMs = tapTimestampsMs.slice(1).map((t, i) => t - tapTimestampsMs[i])
  const averageIntervalMs = intervalsMs.reduce((sum, interval) => sum + interval, 0) / intervalsMs.length

  return 60000 / averageIntervalMs
}
