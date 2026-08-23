import type { Cue, FormatId } from './types'

function pad(value: number, length = 2): string {
  return Math.floor(value).toString().padStart(length, '0')
}

export function formatTimestamp(milliseconds: number, separator: ',' | '.' = '.'): string {
  const totalSeconds = Math.max(0, milliseconds) / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000) % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeCsv(value: string | number): string {
  const stringValue = String(value)
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue
}

function serializeSrt(cues: Cue[]): string {
  return cues
    .map((cue, index) =>
      `${index + 1}\n${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}\n${cue.text}`,
    )
    .join('\n\n')
}

function serializeVtt(cues: Cue[]): string {
  const body = cues
    .map((cue) => {
      const identifier = cue.id ? `${cue.id}\n` : ''
      return `${identifier}${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`
    })
    .join('\n\n')
  return `WEBVTT\n\n${body}`
}

function serializeSbv(cues: Cue[]): string {
  return cues
    .map((cue) => `${formatTimestamp(cue.start)},${formatTimestamp(cue.end)}\n${cue.text}`)
    .join('\n\n')
}

function serializeLrc(cues: Cue[]): string {
  return cues
    .map((cue) => {
      const totalSeconds = cue.start / 1000
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `[${pad(minutes)}:${seconds.toFixed(2).padStart(5, '0')}]${cue.text.replace(/\n/g, ' ')}`
    })
    .join('\n')
}

function serializeTtml(cues: Cue[]): string {
  const paragraphs = cues
    .map((cue, index) => {
      const text = escapeXml(cue.text).replace(/\n/g, '<br/>')
      return `      <p xml:id="${escapeXml(cue.id ?? `cue-${index + 1}`)}" begin="${formatTimestamp(cue.start)}" end="${formatTimestamp(cue.end)}">${text}</p>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
${paragraphs}
    </div>
  </body>
</tt>`
}

function serializeJson(cues: Cue[]): string {
  return JSON.stringify(
    {
      version: 1,
      cues: cues.map((cue, index) => ({
        id: cue.id ?? String(index + 1),
        start: cue.start,
        end: cue.end,
        text: cue.text,
      })),
    },
    null,
    2,
  )
}

function serializeCsv(cues: Cue[]): string {
  const rows = cues.map((cue, index) =>
    [cue.id ?? index + 1, formatTimestamp(cue.start), formatTimestamp(cue.end), cue.text]
      .map(escapeCsv)
      .join(','),
  )
  return ['id,start,end,text', ...rows].join('\n')
}

function serializeText(cues: Cue[]): string {
  return cues.map((cue) => cue.text).join('\n\n')
}

export function serializeCaptions(cues: Cue[], format: FormatId): string {
  const serializers: Record<FormatId, (input: Cue[]) => string> = {
    srt: serializeSrt,
    vtt: serializeVtt,
    sbv: serializeSbv,
    lrc: serializeLrc,
    ttml: serializeTtml,
    json: serializeJson,
    csv: serializeCsv,
    txt: serializeText,
  }
  return `${serializers[format](cues)}\n`
}

export interface OutputSegments {
  /** Text before the first cue (e.g. the WEBVTT line, CSV header, XML wrapper opening). */
  header: string
  /** One chunk per cue, in cue order, exactly as it appears in the output. */
  cues: string[]
  /** Text after the last cue (closing XML tags, JSON brackets). */
  footer: string
}

/**
 * Splits serialized output into header / per-cue chunks / footer so a viewer can map each
 * chunk back to a cue. Every serializer emits cues in order with a format-specific delimiter,
 * so this only needs the delimiter and the header/footer shape for each format.
 */
export function splitOutput(output: string, format: FormatId, cueCount: number): OutputSegments {
  const body = output.replace(/\n$/, '')
  const unmapped: OutputSegments = { header: body, cues: [], footer: '' }
  if (cueCount === 0) return unmapped
  const segments = splitByFormat(body, format)
  // If a chunk boundary was ambiguous (e.g. a blank line inside cue text), don't guess.
  return segments.cues.length === cueCount ? segments : unmapped
}

const TIMESTAMP = String.raw`\d{2}:\d{2}:\d{2}[.,]\d{3}`

function splitByFormat(body: string, format: FormatId): OutputSegments {
  switch (format) {
    case 'srt':
      return { header: '', cues: body.split(new RegExp(String.raw`\n\n(?=\d+\n${TIMESTAMP} --> )`)), footer: '' }
    case 'sbv':
      return { header: '', cues: body.split(new RegExp(String.raw`\n\n(?=${TIMESTAMP},${TIMESTAMP}\n)`)), footer: '' }
    case 'txt':
      return { header: '', cues: body.split('\n\n'), footer: '' }
    case 'vtt': {
      const [header, ...rest] = body.split(new RegExp(String.raw`\n\n(?=(?:[^\n]*\n)?${TIMESTAMP} --> )`))
      return { header: `${header}\n`, cues: rest, footer: '' }
    }
    case 'lrc':
      return { header: '', cues: body.split('\n'), footer: '' }
    case 'csv': {
      const lines = body.split('\n')
      // Quoted cells may contain newlines; rejoin lines until the quote count is even.
      const rows: string[] = []
      let current = ''
      for (const line of lines.slice(1)) {
        current = current ? `${current}\n${line}` : line
        if ((current.match(/"/g) ?? []).length % 2 === 0) {
          rows.push(current)
          current = ''
        }
      }
      if (current) rows.push(current)
      return { header: `${lines[0]}\n`, cues: rows, footer: '' }
    }
    case 'ttml': {
      const lines = body.split('\n')
      const first = lines.findIndex((line) => line.trimStart().startsWith('<p '))
      const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trimStart().startsWith('<p '))
      return {
        header: `${lines.slice(0, first).join('\n')}\n`,
        cues: lines.slice(first, last + 1),
        footer: `\n${lines.slice(last + 1).join('\n')}`,
      }
    }
    case 'json': {
      const lines = body.split('\n')
      // Objects are pretty-printed with 4-space indentation inside the "cues" array.
      const chunks: string[] = []
      let start = -1
      let first = -1
      let last = -1
      lines.forEach((line, index) => {
        if (line === '    {') start = index
        if (line === '    },' || line === '    }') {
          chunks.push(lines.slice(start, index + 1).join('\n'))
          if (first === -1) first = start
          last = index
        }
      })
      return {
        header: `${lines.slice(0, first).join('\n')}\n`,
        cues: chunks,
        footer: `\n${lines.slice(last + 1).join('\n')}`,
      }
    }
  }
}
