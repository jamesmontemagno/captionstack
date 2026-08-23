import { toCues, toEditableCues, type EditableCue } from './edit'
import { parseCaptions } from './parse'
import { analyzeCues, type QualityReport } from './quality'
import { serializeCaptions } from './serialize'
import type { FormatId } from './types'

/**
 * The unit operations the app needs, shaped so every input and output is structured-cloneable.
 * They run inside the Web Worker when one is available and on the main thread otherwise.
 */

export interface LoadedCaptions {
  format: FormatId
  cues: EditableCue[]
}

export interface SerializedCaptions {
  output: string
  /** End time of the last cue in milliseconds; 0 for an empty list. */
  duration: number
}

export type WorkerRequest =
  | { id: number; type: 'parse-file'; file: File }
  | { id: number; type: 'parse-text'; content: string; filename: string }
  | { id: number; type: 'analyze'; cues: EditableCue[] }
  | { id: number; type: 'serialize'; cues: EditableCue[]; format: FormatId }

export type WorkerResult = LoadedCaptions | QualityReport | SerializedCaptions

export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | { id: number; ok: false; error: string }

export function loadCaptions(content: string, filename: string): LoadedCaptions {
  const parsed = parseCaptions(content, filename)
  return { format: parsed.format, cues: toEditableCues(parsed.cues) }
}

export function serializeEditableCues(cues: EditableCue[], format: FormatId): SerializedCaptions {
  const numeric = toCues(cues)
  return {
    output: serializeCaptions(numeric, format),
    duration: numeric.reduce((latest, cue) => Math.max(latest, cue.end), 0),
  }
}

export async function handleWorkerRequest(request: WorkerRequest): Promise<WorkerResult> {
  switch (request.type) {
    case 'parse-file':
      return loadCaptions(await request.file.text(), request.file.name)
    case 'parse-text':
      return loadCaptions(request.content, request.filename)
    case 'analyze':
      return analyzeCues(request.cues)
    case 'serialize':
      return serializeEditableCues(request.cues, request.format)
  }
}
