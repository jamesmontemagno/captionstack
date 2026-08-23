import type { EditableCue } from './edit'
import {
  handleWorkerRequest,
  type LoadedCaptions,
  type SerializedCaptions,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResult,
} from './pipeline'
import type { QualityReport } from './quality'
import type { FormatId } from './types'

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  /** Main-thread equivalent, used if the worker itself fails to start or crashes. */
  fallback: () => unknown | Promise<unknown>
}

let worker: Worker | null = null
let workerUnavailable = false
let nextId = 0
const pending = new Map<number, Pending>()

function settleWithFallback(entry: Pending) {
  try {
    entry.resolve(entry.fallback())
  } catch (caught) {
    entry.reject(caught)
  }
}

function abandonWorker() {
  worker?.terminate()
  worker = null
  workerUnavailable = true
  const entries = [...pending.values()]
  pending.clear()
  entries.forEach(settleWithFallback)
}

function getWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === 'undefined' || typeof window === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  } catch {
    workerUnavailable = true
    return null
  }
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    if (event.data.ok) entry.resolve(event.data.result)
    else entry.reject(new Error(event.data.error))
  })
  // A module-worker that fails to load (old browsers, blocked script) fires 'error' rather
  // than throwing from the constructor, so recover by finishing pending work on this thread.
  worker.addEventListener('error', abandonWorker)
  return worker
}


type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
type WorkerMessage = DistributiveOmit<WorkerRequest, 'id'>

function request<T extends WorkerResult>(message: WorkerMessage): Promise<T> {
  const fallback = () => handleWorkerRequest({ ...message, id: 0 } as WorkerRequest) as Promise<T>
  const target = getWorker()
  if (!target) {
    return new Promise<T>((resolve) => resolve(fallback()))
  }
  const id = (nextId += 1)
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, fallback })
    const payload: WorkerRequest = { ...message, id }
    target.postMessage(payload)
  })
}

export type CaptionSource = File | { content: string; filename: string }

/** Parses into editable cues on a worker thread when available, otherwise on this thread (SSR, tests, old browsers). */
export function loadCaptionsAsync(source: CaptionSource): Promise<LoadedCaptions> {
  if (source instanceof Blob) {
    return request({ type: 'parse-file', file: source as File })
  }
  return request({ type: 'parse-text', content: source.content, filename: source.filename })
}

export function analyzeCuesAsync(cues: EditableCue[]): Promise<QualityReport> {
  return request({ type: 'analyze', cues })
}

/** Converts editable cues to numeric timings and serializes them. Rejects if any timestamp is unparseable. */
export function serializeCaptionsAsync(cues: EditableCue[], format: FormatId): Promise<SerializedCaptions> {
  return request({ type: 'serialize', cues, format })
}

/** True when conversion work will run off the main thread. Exposed for tests and diagnostics. */
export function isWorkerAvailable(): boolean {
  return getWorker() !== null
}
