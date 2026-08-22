export interface QueuedJob<T> {
  id: number
  /** A song the user opened by hand: it jumps the batch, which may be hundreds of songs long. */
  priority: boolean
  payload: T
}

/** Adds a job, keeping priority jobs ahead of the batch and arrival order within each group. */
export function enqueue<T>(queue: QueuedJob<T>[], job: QueuedJob<T>): QueuedJob<T>[] {
  if (!job.priority) return [...queue, job]

  const lastPriority = queue.findLastIndex((queued) => queued.priority)
  return [...queue.slice(0, lastPriority + 1), job, ...queue.slice(lastPriority + 1)]
}

/** Takes the next job off the front, returning it alongside the remaining queue. */
export function dequeue<T>(queue: QueuedJob<T>[]): [QueuedJob<T> | undefined, QueuedJob<T>[]] {
  return [queue[0], queue.slice(1)]
}
