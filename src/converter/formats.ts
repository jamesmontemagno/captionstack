import type { FormatDefinition, FormatId } from './types'

export const formats: FormatDefinition[] = [
  { id: 'srt', name: 'SubRip', extension: '.srt', description: 'The most widely supported subtitle format.' },
  { id: 'vtt', name: 'WebVTT', extension: '.vtt', description: 'Captions for HTML5 video and the web.' },
  { id: 'sbv', name: 'YouTube SBV', extension: '.sbv', description: 'A compact format used by YouTube.' },
  { id: 'lrc', name: 'LRC', extension: '.lrc', description: 'Timestamped lyrics and short captions.' },
  { id: 'ttml', name: 'TTML', extension: '.ttml', description: 'XML captions for broadcast workflows.' },
  { id: 'json', name: 'JSON', extension: '.json', description: 'Structured cue data for applications.' },
  { id: 'csv', name: 'CSV', extension: '.csv', description: 'Cue timing and text for spreadsheets.' },
  { id: 'txt', name: 'Plain text', extension: '.txt', description: 'A clean transcript without timing.' },
]

export function getFormat(id: FormatId): FormatDefinition {
  const format = formats.find((candidate) => candidate.id === id)
  if (!format) {
    throw new Error(`Unsupported caption format: ${id}`)
  }
  return format
}
