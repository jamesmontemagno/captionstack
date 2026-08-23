import type { EditableCue } from './edit'

/** Leading "Name:" label — short, no sentence punctuation, followed by text. */
const SPEAKER_PREFIX = /^([^\n:.!?]{1,40}?):\s+(\S[\s\S]*)$/

export interface SpeakerInfo {
  /** Distinct speaker names in first-appearance order. */
  names: string[]
  /** How many cues carry a speaker label. */
  labelled: number
}

/** Splits "Name: text" into its parts, or null when the cue has no speaker label. */
export function splitSpeaker(text: string): { speaker: string; text: string } | null {
  const match = text.match(SPEAKER_PREFIX)
  if (!match) return null
  const speaker = match[1].trim()
  // Names are a few words at most; anything longer is a clause that happens to contain a colon.
  if (speaker.split(/\s+/).length > 3) return null
  return { speaker, text: match[2] }
}

/**
 * Detects transcript-style speaker labels. Returns null unless most cues are labelled by a small
 * cast, which keeps ordinary captions that merely contain colons from being treated as dialogue.
 */
export function detectSpeakers(cues: EditableCue[]): SpeakerInfo | null {
  if (cues.length === 0) return null
  const names: string[] = []
  let labelled = 0
  for (const cue of cues) {
    const split = splitSpeaker(cue.text)
    if (!split) continue
    labelled += 1
    if (!names.includes(split.speaker)) names.push(split.speaker)
  }
  if (labelled < Math.max(2, cues.length * 0.6) || names.length === 0 || names.length > 12) return null
  return { names, labelled }
}

export type SpeakerStyle = 'name' | 'dash' | 'none'

/**
 * Rewrites speaker labels: "Name: text" (default), "- text" when the speaker changes (common
 * broadcast style), or plain text with labels removed.
 */
export function applySpeakerStyle(cues: EditableCue[], style: SpeakerStyle): EditableCue[] {
  let previous: string | null = null
  let changed = false
  const result = cues.map((cue) => {
    const split = splitSpeaker(cue.text)
    if (!split) {
      previous = null
      return cue
    }
    const speakerChanged = split.speaker !== previous
    previous = split.speaker
    const text = style === 'none' ? split.text : style === 'dash' ? (speakerChanged ? `- ${split.text}` : split.text) : cue.text
    if (text === cue.text) return cue
    changed = true
    return { ...cue, text }
  })
  return changed ? result : cues
}
