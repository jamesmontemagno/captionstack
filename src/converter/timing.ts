import { type EditableCue } from './edit'
import { parseTimestamp } from './parse'
import { formatTimestamp } from './serialize'

/** Common frame rates, for the "retime from A fps to B fps" control. */
export const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const

function tryParse(value: string): number | null {
  try {
    return parseTimestamp(value)
  } catch {
    return null
  }
}

function retime(cues: EditableCue[], map: (ms: number) => number): EditableCue[] {
  return cues.map((cue) => {
    const start = tryParse(cue.start)
    const end = tryParse(cue.end)
    // Unparseable fields are left alone so the user's in-progress edit isn't clobbered.
    return {
      ...cue,
      start: start === null ? cue.start : formatTimestamp(Math.max(0, Math.round(map(start)))),
      end: end === null ? cue.end : formatTimestamp(Math.max(0, Math.round(map(end)))),
    }
  })
}

/** Moves every cue by `offsetMs` (negative = earlier). Times are clamped at zero. */
export function shiftCues(cues: EditableCue[], offsetMs: number): EditableCue[] {
  if (!Number.isFinite(offsetMs) || offsetMs === 0) return cues
  return retime(cues, (ms) => ms + offsetMs)
}

/** Multiplies every time by `factor`, e.g. 25 / 23.976 when video was sped up from film to PAL. */
export function scaleCues(cues: EditableCue[], factor: number): EditableCue[] {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return cues
  return retime(cues, (ms) => ms * factor)
}

/** Retimes captions authored against `fromFps` for media that now plays at `toFps`. */
export function convertFrameRate(cues: EditableCue[], fromFps: number, toFps: number): EditableCue[] {
  if (!(fromFps > 0) || !(toFps > 0)) return cues
  return scaleCues(cues, fromFps / toFps)
}

/**
 * Linear sync from two reference points: the cue that should start at `firstTarget` and the
 * one that should start at `lastTarget`. Fixes both drift and offset in one step.
 */
export function syncToAnchors(
  cues: EditableCue[],
  first: { index: number; targetMs: number },
  last: { index: number; targetMs: number },
): EditableCue[] {
  const a = cues[first.index] ? tryParse(cues[first.index].start) : null
  const b = cues[last.index] ? tryParse(cues[last.index].start) : null
  if (a === null || b === null || a === b) return cues
  const factor = (last.targetMs - first.targetMs) / (b - a)
  if (!Number.isFinite(factor) || factor <= 0) return cues
  return retime(cues, (ms) => first.targetMs + (ms - a) * factor)
}

/** Parses "1.5", "-250ms", "00:00:02.000", "-1:00" into signed milliseconds; null when invalid. */
export function parseOffset(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const negative = trimmed.startsWith('-')
  const body = trimmed.replace(/^[-+]/, '')
  const ms = tryParse(body)
  if (ms === null) return null
  return negative ? -ms : ms
}
