export const FORMAT_IDS = ['srt', 'vtt', 'sbv', 'lrc', 'ttml', 'json', 'csv', 'txt'] as const

export type FormatId = (typeof FORMAT_IDS)[number]

export interface Cue {
  id?: string
  start: number
  end: number
  text: string
}

export interface FormatDefinition {
  id: FormatId
  name: string
  extension: string
  description: string
}

export interface ParsedCaptions {
  cues: Cue[]
  format: FormatId
}
