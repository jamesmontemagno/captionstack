import { useCallback, useRef, useState } from 'react'
import {
  formats,
  loadCaptionsAsync,
  serializeCaptionsAsync,
  type EditableCue,
  type FormatId,
} from './converter'
import { createZip } from './converter/zip'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED = new Set(formats.map((format) => format.extension.slice(1)).concat('xml'))

export type BatchStatus = 'reading' | 'ready' | 'error'

export interface BatchItem {
  id: string
  name: string
  size: number
  status: BatchStatus
  sourceFormat?: FormatId
  cues?: EditableCue[]
  error?: string
}

export function cleanBaseName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
}

/** Returns a user-facing reason the file can't be converted, or null when it should be read. */
export function rejectReason(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return 'Larger than the 10 MB limit.'
  if (file.size === 0) return 'This file is empty.'
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (extension && !ACCEPTED.has(extension)) return `.${extension} files aren’t a supported caption format.`
  return null
}

let nextId = 0

export function useBatch() {
  const [items, setItems] = useState<BatchItem[]>([])
  // Files are kept outside state; they are only needed while reading.
  const filesRef = useRef(new Map<string, File>())

  const update = useCallback((id: string, changes: Partial<BatchItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const additions: BatchItem[] = files.map((file) => {
      const id = `batch-${(nextId += 1)}`
      const reason = rejectReason(file)
      if (!reason) filesRef.current.set(id, file)
      return reason
        ? { id, name: file.name, size: file.size, status: 'error', error: reason }
        : { id, name: file.name, size: file.size, status: 'reading' }
    })
    setItems((current) => [...current, ...additions])

    for (const item of additions) {
      const file = filesRef.current.get(item.id)
      if (!file) continue
      loadCaptionsAsync(file)
        .then((loaded) => update(item.id, { status: 'ready', sourceFormat: loaded.format, cues: loaded.cues }))
        .catch((caught: unknown) =>
          update(item.id, { status: 'error', error: caught instanceof Error ? caught.message : 'This file could not be read.' }),
        )
        .finally(() => filesRef.current.delete(item.id))
    }
  }, [update])

  const removeItem = useCallback((id: string) => {
    filesRef.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const clear = useCallback(() => {
    filesRef.current.clear()
    setItems([])
  }, [])

  const readyCount = items.filter((item) => item.status === 'ready').length
  const errorCount = items.filter((item) => item.status === 'error').length
  const isReading = items.some((item) => item.status === 'reading')

  return { items, addFiles, removeItem, clear, readyCount, errorCount, isReading }
}

export function zipFileName(format: FormatId, count: number): string {
  return `captionstack-${count}-files-${format}.zip`
}

/** Serializes every ready item to the target format and packs them into a ZIP blob. */
export async function buildBatchZip(items: BatchItem[], format: FormatId): Promise<Blob> {
  const extension = formats.find((candidate) => candidate.id === format)?.extension ?? `.${format}`
  const ready = items.filter((item) => item.status === 'ready' && item.cues)
  const entries = await Promise.all(
    ready.map(async (item) => ({
      name: `${cleanBaseName(item.name) || 'captions'}${extension}`,
      data: (await serializeCaptionsAsync(item.cues!, format)).output,
    })),
  )
  return new Blob([createZip(entries)], { type: 'application/zip' })
}
