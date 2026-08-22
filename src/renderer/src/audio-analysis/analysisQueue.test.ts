import { describe, expect, it } from 'vitest'
import { dequeue, enqueue, type QueuedJob } from './analysisQueue'

function job(id: number, priority = false): QueuedJob<string> {
  return { id, priority, payload: `job-${id}` }
}

describe('enqueue', () => {
  it('keeps ordinary jobs in the order they arrive', () => {
    const queue = [job(1), job(2)].reduce(enqueue, [] as QueuedJob<string>[])
    expect(queue.map((j) => j.id)).toEqual([1, 2])
  })

  it('puts a priority job ahead of the waiting batch', () => {
    const queue = [job(1), job(2), job(3, true)].reduce(enqueue, [] as QueuedJob<string>[])
    expect(queue.map((j) => j.id)).toEqual([3, 1, 2])
  })

  it('keeps priority jobs among themselves in arrival order', () => {
    const queue = [job(1), job(2, true), job(3, true)].reduce(enqueue, [] as QueuedJob<string>[])
    expect(queue.map((j) => j.id)).toEqual([2, 3, 1])
  })

  it('does not mutate the queue it is given', () => {
    const original: QueuedJob<string>[] = [job(1)]
    enqueue(original, job(2))
    expect(original.map((j) => j.id)).toEqual([1])
  })
})

describe('dequeue', () => {
  it('takes the first job and returns the rest', () => {
    const [next, rest] = dequeue([job(1), job(2)])
    expect(next?.id).toBe(1)
    expect(rest.map((j) => j.id)).toEqual([2])
  })

  it('reports an empty queue without blowing up', () => {
    const [next, rest] = dequeue([])
    expect(next).toBeUndefined()
    expect(rest).toEqual([])
  })

  it('does not mutate the queue it is given', () => {
    const original = [job(1), job(2)]
    dequeue(original)
    expect(original).toHaveLength(2)
  })
})
