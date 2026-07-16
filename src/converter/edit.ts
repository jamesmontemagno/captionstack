import { parseTimestamp } from './parse'
import { formatTimestamp } from './serialize'
import type { Cue } from './types'

export interface EditableCue {
  id: string
  originalId?: string
  start: string
  end: string
  text: string
}

export interface CueError {
  start?: string
  end?: string
  overlap?: string
}

const DEFAULT_CUE_DURATION = 2000

let counter = 0

function createId(): string {
  counter += 1
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `cue-${counter}-${Date.now().toString(36)}`
}

function tryParse(value: string): number | null {
  try {
    return parseTimestamp(value)
  } catch {
    return null
  }
}

export function toEditableCues(cues: Cue[]): EditableCue[] {
  return cues.map((cue) => ({
    id: createId(),
    originalId: cue.id,
    start: formatTimestamp(cue.start),
    end: formatTimestamp(cue.end),
    text: cue.text,
  }))
}

export function toCues(cues: EditableCue[]): Cue[] {
  return cues.map((cue) => ({
    id: cue.originalId,
    start: parseTimestamp(cue.start),
    end: parseTimestamp(cue.end),
    text: cue.text,
  }))
}

export function validateCues(cues: EditableCue[]): Map<string, CueError> {
  const errors = new Map<string, CueError>()
  const parsedStarts: Array<number | null> = []
  const parsedEnds: Array<number | null> = []

  cues.forEach((cue) => {
    const error: CueError = {}
    const start = tryParse(cue.start)
    const end = tryParse(cue.end)
    parsedStarts.push(start)
    parsedEnds.push(end)

    if (start === null) {
      error.start = 'Enter a valid time (for example 00:00:01.000).'
    } else if (start < 0) {
      error.start = 'Start time cannot be negative.'
    }

    if (end === null) {
      error.end = 'Enter a valid time (for example 00:00:03.000).'
    } else if (start !== null && end <= start) {
      error.end = 'End time must come after the start time.'
    }

    if (error.start || error.end) {
      errors.set(cue.id, error)
    }
  })

  for (let index = 1; index < cues.length; index += 1) {
    const start = parsedStarts[index]
    const previousEnd = parsedEnds[index - 1]
    if (start !== null && previousEnd !== null && start < previousEnd) {
      const existing = errors.get(cues[index].id) ?? {}
      existing.overlap = 'This cue overlaps the previous cue.'
      errors.set(cues[index].id, existing)
    }
  }

  return errors
}

export function hasErrors(errors: Map<string, CueError>): boolean {
  return errors.size > 0
}

function newCue(start: number, end: number, text = ''): EditableCue {
  return {
    id: createId(),
    start: formatTimestamp(Math.max(0, start)),
    end: formatTimestamp(Math.max(0, end)),
    text,
  }
}

export function addCue(cues: EditableCue[], index: number): EditableCue[] {
  const previous = cues[index]
  const next = cues[index + 1]
  const previousEnd = previous ? tryParse(previous.end) : null
  const start = previousEnd ?? 0
  const nextStart = next ? tryParse(next.start) : null
  const end = nextStart !== null && nextStart > start ? nextStart : start + DEFAULT_CUE_DURATION
  const created = newCue(start, end)
  const result = [...cues]
  result.splice(index + 1, 0, created)
  return result
}

export function removeCue(cues: EditableCue[], index: number): EditableCue[] {
  return cues.filter((_, position) => position !== index)
}

export function moveCue(cues: EditableCue[], index: number, direction: -1 | 1): EditableCue[] {
  const target = index + direction
  if (target < 0 || target >= cues.length) {
    return cues
  }
  const result = [...cues]
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

function splitText(text: string): [string, string] {
  const newlineIndex = text.indexOf('\n')
  if (newlineIndex !== -1) {
    return [text.slice(0, newlineIndex).trim(), text.slice(newlineIndex + 1).trim()]
  }
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const middle = Math.ceil(words.length / 2)
    return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')]
  }
  return [text.trim(), '']
}

export function splitCue(cues: EditableCue[], index: number): EditableCue[] {
  const cue = cues[index]
  if (!cue) {
    return cues
  }
  const start = tryParse(cue.start)
  const end = tryParse(cue.end)
  if (start === null || end === null || end <= start) {
    return cues
  }
  const midpoint = Math.round((start + end) / 2)
  const [firstText, secondText] = splitText(cue.text)
  const first: EditableCue = {
    ...cue,
    end: formatTimestamp(midpoint),
    text: firstText,
  }
  const second = newCue(midpoint, end, secondText)
  const result = [...cues]
  result.splice(index, 1, first, second)
  return result
}

export function mergeCue(cues: EditableCue[], index: number): EditableCue[] {
  const current = cues[index]
  const next = cues[index + 1]
  if (!current || !next) {
    return cues
  }
  const currentStart = tryParse(current.start)
  const nextStart = tryParse(next.start)
  const currentEnd = tryParse(current.end)
  const nextEnd = tryParse(next.end)
  const starts = [currentStart, nextStart].filter((value): value is number => value !== null)
  const ends = [currentEnd, nextEnd].filter((value): value is number => value !== null)
  const mergedText = [current.text.trim(), next.text.trim()].filter(Boolean).join('\n')
  const merged: EditableCue = {
    ...current,
    start: starts.length ? formatTimestamp(Math.min(...starts)) : current.start,
    end: ends.length ? formatTimestamp(Math.max(...ends)) : current.end,
    text: mergedText,
  }
  const result = [...cues]
  result.splice(index, 2, merged)
  return result
}

export function updateCue(
  cues: EditableCue[],
  index: number,
  changes: Partial<Pick<EditableCue, 'start' | 'end' | 'text'>>,
): EditableCue[] {
  return cues.map((cue, position) => (position === index ? { ...cue, ...changes } : cue))
}
