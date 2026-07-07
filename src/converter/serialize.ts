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
