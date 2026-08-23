import { FORMAT_IDS, type Cue, type FormatId, type ParsedCaptions } from './types'

const extensionFormats: Record<string, FormatId> = {
  srt: 'srt',
  vtt: 'vtt',
  sbv: 'sbv',
  lrc: 'lrc',
  ttml: 'ttml',
  xml: 'ttml',
  json: 'json',
  csv: 'csv',
  txt: 'txt',
}

function normalize(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

export function parseTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid timestamp: ${value}`)
    }
    return value
  }

  const normalized = value.trim().replace(',', '.')
  const unitValue = normalized.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i)
  if (unitValue) {
    const factors = { ms: 1, s: 1000, m: 60000, h: 3600000 }
    return Number(unitValue[1]) * factors[unitValue[2].toLowerCase() as keyof typeof factors]
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized) * 1000
  }

  const parts = normalized.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid timestamp: ${value}`)
  }

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]]
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
}

function parseTimedBlocks(content: string, format: 'srt' | 'vtt' | 'sbv'): Cue[] {
  const blocks = normalize(content).split(/\n{2,}/)
  const cues: Cue[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    if (format === 'vtt') {
      const marker = lines[0]?.trim().toUpperCase()
      if (marker === 'WEBVTT' || marker.startsWith('NOTE') || marker === 'STYLE' || marker === 'REGION') {
        continue
      }
    }

    const timingIndex = lines.findIndex((line) =>
      format === 'sbv' ? /^\s*[\d:.]+\s*,\s*[\d:.]+\s*$/.test(line) : line.includes('-->'),
    )
    if (timingIndex === -1) {
      continue
    }

    const timing = lines[timingIndex].trim()
    let startValue: string
    let endValue: string
    if (format === 'sbv') {
      ;[startValue, endValue] = timing.split(',').map((part) => part.trim())
    } else {
      const [start, endWithSettings] = timing.split('-->').map((part) => part.trim())
      startValue = start
      endValue = endWithSettings.split(/\s+/)[0]
    }

    const text = lines.slice(timingIndex + 1).join('\n').trim()
    const id = timingIndex > 0 ? lines[timingIndex - 1].trim() : undefined
    cues.push({
      id: id || undefined,
      start: parseTimestamp(startValue),
      end: parseTimestamp(endValue),
      text,
    })
  }

  return cues
}

function parseLrc(content: string): Cue[] {
  const entries: Array<Omit<Cue, 'end'>> = []
  for (const line of normalize(content).split('\n')) {
    const timestampPattern = /\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g
    const timestamps = [...line.matchAll(timestampPattern)]
    if (timestamps.length === 0) {
      continue
    }
    const text = line.replace(timestampPattern, '').trim()
    for (const match of timestamps) {
      entries.push({ start: parseTimestamp(`${match[1]}:${match[2]}`), text })
    }
  }

  entries.sort((a, b) => a.start - b.start)
  return entries.map((entry, index) => ({
    ...entry,
    end: entries[index + 1]?.start ?? entry.start + 3000,
  }))
}

function decodeXml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function getXmlAttribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
}

function parseTtml(content: string): Cue[] {
  const cues: Cue[] = []
  const paragraphPattern = /<(?:[\w-]+:)?p\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?p>/gi

  for (const match of normalize(content).matchAll(paragraphPattern)) {
    const attributes = match[1]
    const begin = getXmlAttribute(attributes, 'begin')
    const end = getXmlAttribute(attributes, 'end')
    const duration = getXmlAttribute(attributes, 'dur')
    if (!begin || (!end && !duration)) {
      continue
    }
    const start = parseTimestamp(begin)
    cues.push({
      id: getXmlAttribute(attributes, 'xml:id') ?? getXmlAttribute(attributes, 'id'),
      start,
      end: end ? parseTimestamp(end) : start + parseTimestamp(duration!),
      text: decodeXml(match[2]),
    })
  }

  return cues
}

function parseJson(content: string): Cue[] {
  let data: unknown
  try {
    data = JSON.parse(normalize(content))
  } catch {
    throw new Error('This file is not valid JSON.')
  }

  const rawCues = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && 'cues' in data
      ? (data as { cues: unknown }).cues
      : undefined
  if (!Array.isArray(rawCues)) {
    throw new Error('JSON captions must be an array or an object with a "cues" array.')
  }

  return rawCues.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Cue ${index + 1} is not an object.`)
    }
    const cue = raw as Record<string, unknown>
    if ((typeof cue.start !== 'string' && typeof cue.start !== 'number') ||
        (typeof cue.end !== 'string' && typeof cue.end !== 'number') ||
        typeof cue.text !== 'string') {
      throw new Error(`Cue ${index + 1} needs start, end, and text values.`)
    }
    return {
      id: typeof cue.id === 'string' ? cue.id : undefined,
      start: parseTimestamp(cue.start),
      end: parseTimestamp(cue.end),
      text: cue.text,
    }
  })
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  const input = normalize(content)

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if (character === '\n' && !quoted) {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  row.push(value)
  rows.push(row)
  return rows
}

function parseCsv(content: string): Cue[] {
  const [headerRow, ...rows] = parseCsvRows(content)
  const headers = headerRow.map((header) => header.trim().toLowerCase())
  const startIndex = headers.indexOf('start')
  const endIndex = headers.indexOf('end')
  const textIndex = headers.indexOf('text')
  const idIndex = headers.indexOf('id')
  if (startIndex === -1 || endIndex === -1 || textIndex === -1) {
    throw new Error('CSV captions need start, end, and text columns.')
  }

  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => ({
      id: idIndex >= 0 ? row[idIndex]?.trim() || undefined : undefined,
      start: parseTimestamp(row[startIndex]),
      end: parseTimestamp(row[endIndex]),
      text: row[textIndex] ?? '',
    }))
}

const TRANSCRIPT_TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`
/** A whole line that is only a timestamp, optionally wrapped in brackets. */
const TRANSCRIPT_TIME_LINE = new RegExp(String.raw`^[\[(]?\s*(${TRANSCRIPT_TIME})\s*[\])]?$`)
/**
 * One-line transcript entries: "[00:12] James: text", "00:12 James: text", "James (00:12): text",
 * "James 00:12 text". Speaker names are short (≤ 4 words) and never end a sentence.
 */
const SPEAKER = String.raw`([^\n:()\[\]]{1,40}?)`
const INLINE_PATTERNS = [
  new RegExp(String.raw`^[\[(]?\s*(${TRANSCRIPT_TIME})\s*[\])]?\s*[-–—]?\s*(?:${SPEAKER}\s*:\s*)?(.*)$`),
  new RegExp(String.raw`^${SPEAKER}\s*[\[(]\s*(${TRANSCRIPT_TIME})\s*[\])]\s*:?\s*(.*)$`),
]

interface TranscriptEntry {
  start: number
  speaker?: string
  text: string
}

/** A speaker name is short and contains no sentence punctuation; anything else is caption text. */
function cleanSpeaker(name: string | undefined): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed || trimmed.split(/\s+/).length > 3 || /[.!?,;]/.test(trimmed)) return undefined
  return trimmed
}

/** Rejoins a rejected "speaker" capture with the text so no words are lost. */
function withPrefix(prefix: string | undefined, text: string): string {
  return prefix && prefix.trim() ? `${prefix.trim()}: ${text.trim()}` : text.trim()
}

/**
 * Recognizes podcast/meeting transcript exports: blocks of "timestamp / speaker / text" (speaker
 * optional) or one-line "[time] Speaker: text" entries. Returns null when fewer than two thirds
 * of the blocks carry a timestamp, so ordinary prose keeps the plain-text path.
 */
function parseTranscriptEntries(content: string): TranscriptEntry[] | null {
  const blocks = normalize(content).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  if (blocks.length === 0) return null
  const entries: TranscriptEntry[] = []
  let timed = 0

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timeLine = lines[0]?.match(TRANSCRIPT_TIME_LINE)
    if (timeLine && lines.length >= 2) {
      // Block form: the line after the timestamp is a speaker when it is short and the block has text after it.
      const speaker = lines.length >= 3 ? cleanSpeaker(lines[1]) : undefined
      const text = lines.slice(speaker ? 2 : 1).join('\n')
      entries.push({ start: parseTimestamp(timeLine[1]), speaker, text })
      timed += 1
      continue
    }
    // Inline form: every line of the block may be its own entry.
    let matchedAny = false
    for (const line of lines) {
      const inline = line.match(INLINE_PATTERNS[0])
      const inlineSpeakerFirst = inline ? null : line.match(INLINE_PATTERNS[1])
      if (inline) {
        const speaker = cleanSpeaker(inline[2])
        entries.push({ start: parseTimestamp(inline[1]), speaker, text: speaker ? inline[3].trim() : withPrefix(inline[2], inline[3]) })
        matchedAny = true
      } else if (inlineSpeakerFirst) {
        const speaker = cleanSpeaker(inlineSpeakerFirst[1])
        entries.push({ start: parseTimestamp(inlineSpeakerFirst[2]), speaker, text: speaker ? inlineSpeakerFirst[3].trim() : withPrefix(inlineSpeakerFirst[1], inlineSpeakerFirst[3]) })
        matchedAny = true
      } else if (entries.length > 0 && matchedAny) {
        // Continuation line of the previous inline entry.
        entries[entries.length - 1].text += `\n${line}`
      } else {
        entries.push({ start: Number.NaN, text: line })
      }
    }
    if (matchedAny) timed += 1
  }

  // Need a clear majority of timestamped units (blocks, or lines in the inline form) and at least two.
  const timedEntries = entries.filter((entry) => Number.isFinite(entry.start)).length
  if (timedEntries < 2 || timed < Math.ceil(blocks.length * (2 / 3)) || timedEntries < Math.ceil(entries.length * (2 / 3))) return null
  return entries.filter((entry) => entry.text.length > 0)
}

/** True when the content looks like a timestamped transcript rather than plain paragraphs. */
export function looksLikeTranscript(content: string): boolean {
  return parseTranscriptEntries(content) !== null
}

function parseTranscript(entries: TranscriptEntry[]): Cue[] {
  // Untimed stragglers inherit the previous entry's time so ordering is preserved.
  let lastStart = 0
  const timedEntries = entries.map((entry) => {
    if (Number.isFinite(entry.start)) lastStart = entry.start
    return { ...entry, start: Number.isFinite(entry.start) ? entry.start : lastStart }
  })
  return timedEntries.map((entry, index) => {
    const nextStart = timedEntries[index + 1]?.start
    // Exports sometimes carry a later "start" slightly before the previous one; keep a positive duration.
    const end = nextStart !== undefined && nextStart > entry.start ? nextStart : entry.start + 3000
    return {
      start: entry.start,
      end,
      text: entry.speaker ? `${entry.speaker}: ${entry.text}` : entry.text,
    }
  })
}

function parseText(content: string): Cue[] {
  const transcript = parseTranscriptEntries(content)
  if (transcript) return parseTranscript(transcript)
  return normalize(content)
    .split(/\n{2,}|\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ start: index * 3000, end: (index + 1) * 3000, text }))
}

export function detectFormat(filename: string, content: string): FormatId {
  const extension = filename.split('.').pop()?.toLowerCase()
  if (extension && extensionFormats[extension]) {
    return extensionFormats[extension]
  }

  const sample = normalize(content).slice(0, 2000)
  if (/^WEBVTT\b/i.test(sample)) return 'vtt'
  if (/^\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(sample)) return 'srt'
  if (/<(?:tt|tt:tt)\b/i.test(sample) && /<p\b/i.test(sample)) return 'ttml'
  if (/^\s*\[\d{1,3}:\d{2}(?:[.:]\d+)?\]/m.test(sample)) return 'lrc'
  if (/^\s*[\d:.]+\s*,\s*[\d:.]+\s*$/m.test(sample)) return 'sbv'
  if (/^\s*(?:\[|\{)/.test(sample)) return 'json'
  if (/^\s*(?:id,)?start,end,text\b/i.test(sample)) return 'csv'
  return 'txt'
}

function validateCues(cues: Cue[]): Cue[] {
  if (cues.length === 0) {
    throw new Error('No caption cues were found in this file.')
  }
  for (const [index, cue] of cues.entries()) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end < cue.start) {
      throw new Error(`Cue ${index + 1} has an invalid time range.`)
    }
  }
  return cues
}

export function parseCaptions(content: string, filename = ''): ParsedCaptions {
  const format = detectFormat(filename, content)
  const parsers: Record<FormatId, (input: string) => Cue[]> = {
    srt: (input) => parseTimedBlocks(input, 'srt'),
    vtt: (input) => parseTimedBlocks(input, 'vtt'),
    sbv: (input) => parseTimedBlocks(input, 'sbv'),
    lrc: parseLrc,
    ttml: parseTtml,
    json: parseJson,
    csv: parseCsv,
    txt: parseText,
  }
  return { format, cues: validateCues(parsers[format](content)) }
}

export function isFormatId(value: string): value is FormatId {
  return FORMAT_IDS.includes(value as FormatId)
}
