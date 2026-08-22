/**
 * Runs `worker` over every item with at most `limit` in flight at a time — the batch equivalent of
 * the old sequential loop, now that analysis happens in a pool of workers and one song at a time
 * would leave most of them idle.
 *
 * A worker that throws is skipped (a file that won't decode shouldn't stop the batch), and
 * `isCancelled` is checked before each new item, so cancelling lets what's in flight finish
 * instead of leaving half-written state behind.
 */
export async function runConcurrently<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  isCancelled: () => boolean = () => false
): Promise<void> {
  let cursor = 0

  async function lane(): Promise<void> {
    while (cursor < items.length) {
      if (isCancelled()) return
      const index = cursor++
      try {
        await worker(items[index], index)
      } catch {
        // Skipped: an unreadable or undecodable file shouldn't take the rest of the batch down.
      }
    }
  }

  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane)
  await Promise.all(lanes)
}
