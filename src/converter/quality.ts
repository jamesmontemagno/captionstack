import { isBlockingError, validateCues, type EditableCue } from './edit'
import { parseTimestamp } from './parse'
import { formatTimestamp } from './serialize'

export type QualitySeverity = 'error' | 'warning'

export const QUALITY_CHECK_IDS = [
  'invalid-time',
  'overlap',
  'empty-cue',
  'whitespace',
  'short-duration',
  'long-line',
  'too-many-lines',
  'reading-speed',
] as const

export type QualityCheckId = (typeof QUALITY_CHECK_IDS)[number]

export type QualityFix =
  | { kind: 'trim-previous'; cueId: string }
  | { kind: 'remove-cue'; cueId: string }
  | { kind: 'clean-text'; cueId: string; text: string }
  | { kind: 'extend-end'; cueId: string; end: number }

export interface QualityFinding {
  id: string
  check: QualityCheckId
  severity: QualitySeverity
  cueId: string
  cueIndex: number
  message: string
  /** Present only when the repair is deterministic and safe to apply in one click. */
  fix?: QualityFix
}

export interface QualityCheckSummary {
  id: QualityCheckId
  label: string
  count: number
  severity: QualitySeverity
}

export interface QualityReport {
  findings: QualityFinding[]
  checks: QualityCheckSummary[]
  errorCount: number
  warningCount: number
  passedCount: number
  fixableCount: number
}

export const QUALITY_THRESHOLDS = {
  /** Cues shorter than this are hard to read at all. */
  minDurationMs: 700,
  /** Extend too-short cues toward this target when there is room. */
  targetDurationMs: 1000,
  /** Characters per line before a line risks wrapping or overflowing the safe area. */
  maxLineLength: 42,
  maxLines: 2,
  /** Characters per second; ~20 cps is a common upper bound for comfortable reading. */
  maxCharsPerSecond: 20,
} as const

const CHECK_LABELS: Record<QualityCheckId, { label: string; severity: QualitySeverity }> = {
  'invalid-time': { label: 'Valid time ranges', severity: 'error' },
  overlap: { label: 'No overlapping cues', severity: 'warning' },
  'empty-cue': { label: 'No empty cues', severity: 'warning' },
  whitespace: { label: 'Clean whitespace', severity: 'warning' },
  'short-duration': { label: 'Minimum duration', severity: 'warning' },
  'long-line': { label: 'Line length', severity: 'warning' },
  'too-many-lines': { label: 'Line count', severity: 'warning' },
  'reading-speed': { label: 'Reading speed', severity: 'warning' },
}

function tryParse(value: string): number | null {
  try {
    return parseTimestamp(value)
  } catch {
    return null
  }
}

/** Normalizes whitespace without changing words: trims edges, collapses runs of spaces, drops blank lines. */
export function cleanCueText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function readingSpeed(text: string, durationMs: number): number {
  const characters = text.replace(/\s+/g, '').length
  return durationMs > 0 ? characters / (durationMs / 1000) : Number.POSITIVE_INFINITY
}

export function analyzeCues(cues: EditableCue[]): QualityReport {
  const findings: QualityFinding[] = []
  const validation = validateCues(cues)
  const starts = cues.map((cue) => tryParse(cue.start))
  const ends = cues.map((cue) => tryParse(cue.end))

  const push = (finding: Omit<QualityFinding, 'id'>) => {
    findings.push({ ...finding, id: `${finding.check}:${finding.cueId}` })
  }

  cues.forEach((cue, index) => {
    const error = validation.get(cue.id)
    const start = starts[index]
    const end = ends[index]
    const nextStart = starts[index + 1] ?? null

    if (isBlockingError(error)) {
      push({
        check: 'invalid-time',
        severity: 'error',
        cueId: cue.id,
        cueIndex: index,
        message: error?.start ?? error?.end ?? 'This cue has an invalid time range.',
      })
    }

    if (error?.overlap && index > 0 && start !== null) {
      const previousStart = starts[index - 1]
      // Trimming the previous cue is only safe when it still keeps a positive duration.
      const canTrim = previousStart !== null && previousStart < start
      push({
        check: 'overlap',
        severity: 'warning',
        cueId: cue.id,
        cueIndex: index,
        message: `Starts ${formatTimestamp(start)} but cue ${index} ends at ${ends[index - 1] !== null ? formatTimestamp(ends[index - 1]!) : '?'}.`,
        fix: canTrim ? { kind: 'trim-previous', cueId: cue.id } : undefined,
      })
    }

    const cleaned = cleanCueText(cue.text)
    if (cleaned.length === 0) {
      push({
        check: 'empty-cue',
        severity: 'warning',
        cueId: cue.id,
        cueIndex: index,
        message: 'This cue has no text.',
        fix: { kind: 'remove-cue', cueId: cue.id },
      })
    } else if (cleaned !== cue.text) {
      push({
        check: 'whitespace',
        severity: 'warning',
        cueId: cue.id,
        cueIndex: index,
        message: 'Extra spaces or blank lines can be cleaned up.',
        fix: { kind: 'clean-text', cueId: cue.id, text: cleaned },
      })
    }

    if (cleaned.length > 0) {
      const lines = cleaned.split('\n')
      const longest = Math.max(...lines.map((line) => line.length))
      if (longest > QUALITY_THRESHOLDS.maxLineLength) {
        push({
          check: 'long-line',
          severity: 'warning',
          cueId: cue.id,
          cueIndex: index,
          message: `Longest line is ${longest} characters; aim for ${QUALITY_THRESHOLDS.maxLineLength} or fewer.`,
        })
      }
      if (lines.length > QUALITY_THRESHOLDS.maxLines) {
        push({
          check: 'too-many-lines',
          severity: 'warning',
          cueId: cue.id,
          cueIndex: index,
          message: `${lines.length} lines of text; most players show ${QUALITY_THRESHOLDS.maxLines} comfortably.`,
        })
      }
    }

    if (start !== null && end !== null && end >= start && cleaned.length > 0) {
      const duration = end - start
      // The end can grow up to the next cue's start (or freely for the last cue) without a collision.
      const ceiling = nextStart !== null ? nextStart : Number.POSITIVE_INFINITY
      const roomToExtend = (target: number) => target > end && target <= ceiling

      if (duration < QUALITY_THRESHOLDS.minDurationMs) {
        const target = start + QUALITY_THRESHOLDS.targetDurationMs
        push({
          check: 'short-duration',
          severity: 'warning',
          cueId: cue.id,
          cueIndex: index,
          message: `Only on screen for ${duration} ms; aim for at least ${QUALITY_THRESHOLDS.minDurationMs} ms.`,
          fix: roomToExtend(target) ? { kind: 'extend-end', cueId: cue.id, end: target } : undefined,
        })
      } else {
        const speed = readingSpeed(cleaned, duration)
        if (speed > QUALITY_THRESHOLDS.maxCharsPerSecond) {
          const characters = cleaned.replace(/\s+/g, '').length
          const target = start + Math.ceil((characters / QUALITY_THRESHOLDS.maxCharsPerSecond) * 1000)
          push({
            check: 'reading-speed',
            severity: 'warning',
            cueId: cue.id,
            cueIndex: index,
            message: `${speed.toFixed(1)} characters per second; ${QUALITY_THRESHOLDS.maxCharsPerSecond} or fewer is comfortable.`,
            fix: roomToExtend(target) ? { kind: 'extend-end', cueId: cue.id, end: target } : undefined,
          })
        }
      }
    }
  })

  const checks = QUALITY_CHECK_IDS.map((id) => ({
    id,
    label: CHECK_LABELS[id].label,
    severity: CHECK_LABELS[id].severity,
    count: findings.filter((finding) => finding.check === id).length,
  }))

  return {
    findings,
    checks,
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    passedCount: checks.filter((check) => check.count === 0).length,
    fixableCount: findings.filter((finding) => finding.fix).length,
  }
}

/**
 * Fixes target cues by id rather than position, so a fix computed from a slightly stale
 * report (analysis runs asynchronously) can never land on the wrong cue. Unknown ids no-op.
 */
export function applyFix(cues: EditableCue[], fix: QualityFix): EditableCue[] {
  const index = cues.findIndex((cue) => cue.id === fix.cueId)
  if (index === -1) return cues
  switch (fix.kind) {
    case 'trim-previous': {
      const start = tryParse(cues[index].start)
      const previous = cues[index - 1]
      if (start === null || !previous) return cues
      return cues.map((cue, position) => (position === index - 1 ? { ...cue, end: formatTimestamp(start) } : cue))
    }
    case 'remove-cue':
      return cues.filter((_, position) => position !== index)
    case 'clean-text':
      return cues.map((cue, position) => (position === index ? { ...cue, text: fix.text } : cue))
    case 'extend-end':
      return cues.map((cue, position) => (position === index ? { ...cue, end: formatTimestamp(fix.end) } : cue))
  }
}

/**
 * Applies every safe fix, re-analyzing after each one because fixes can shift indices
 * (removing a cue) or resolve neighbouring findings (trimming an overlap).
 */
export function applyAllFixes(cues: EditableCue[]): { cues: EditableCue[]; applied: number } {
  let current = cues
  let applied = 0
  for (let iteration = 0; iteration < cues.length * QUALITY_CHECK_IDS.length + 1; iteration += 1) {
    const next = analyzeCues(current).findings.find((finding) => finding.fix)
    if (!next?.fix) break
    const updated = applyFix(current, next.fix)
    if (updated === current) break
    current = updated
    applied += 1
  }
  return { cues: current, applied }
}
