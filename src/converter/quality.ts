import { isBlockingError, validateCues, type EditableCue } from './edit'
import { parseTimestamp } from './parse'
import { formatTimestamp } from './serialize'
import { splitSpeaker } from './speakers'

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
  /** Re-wrap the cue's words into balanced lines that fit the line-length limit. */
  | { kind: 'rewrap'; cueId: string; text: string }
  /** Replace the cue with several shorter cues; timing is shared proportionally to text length. */
  | { kind: 'split-cue'; cueId: string; parts: string[] }
  /** Move this cue after the previous cue while preserving its duration (bad source timestamps). */
  | { kind: 'start-at-previous-end'; cueId: string }
  /** Merge this cue with the next one when the combined text still fits the layout limits. */
  | { kind: 'merge-next'; cueId: string; text: string }
  /** Borrow surplus display time from adjacent cues without creating a new warning. */
  | { kind: 'expand-range'; cueId: string; start: number; end: number }

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

function requiredDuration(text: string): number {
  const characters = cleanCueText(text).replace(/\s+/g, '').length
  return Math.max(
    QUALITY_THRESHOLDS.minDurationMs,
    Math.ceil((characters / QUALITY_THRESHOLDS.maxCharsPerSecond) * 1000),
  )
}

function expandedRange(
  cues: EditableCue[],
  index: number,
  starts: Array<number | null>,
  ends: Array<number | null>,
  targetDuration: number,
): { start: number; end: number } | null {
  const start = starts[index]
  const end = ends[index]
  if (start === null || end === null || targetDuration <= end - start) return null

  let needed = targetDuration - (end - start)
  let expandedStart = start
  let expandedEnd = end
  const previousStart = starts[index - 1] ?? null
  const previousEnd = ends[index - 1] ?? null
  if (previousStart !== null && previousEnd === start) {
    const available = Math.max(0, previousEnd - previousStart - requiredDuration(cues[index - 1].text))
    const borrowed = Math.min(needed, available)
    expandedStart -= borrowed
    needed -= borrowed
  }
  const nextStart = starts[index + 1] ?? null
  const nextEnd = ends[index + 1] ?? null
  if (needed > 0 && nextStart === end && nextEnd !== null) {
    const available = Math.max(0, nextEnd - nextStart - requiredDuration(cues[index + 1].text))
    const borrowed = Math.min(needed, available)
    expandedEnd += borrowed
    needed -= borrowed
  }
  return needed === 0 ? { start: expandedStart, end: expandedEnd } : null
}

/**
 * Splits words into `count` groups with as-equal-as-possible character lengths, preferring to
 * break after sentence punctuation when a candidate boundary is close to the ideal point.
 */
function balanceWords(words: string[], count: number): string[][] {
  if (count <= 1 || words.length <= count) return count <= 1 ? [words] : words.map((word) => [word])
  const groups: string[][] = []
  let cursor = 0
  for (let group = 1; group < count; group += 1) {
    const remainingLength = words.slice(cursor).join(' ').length
    const remainingGroups = count - group + 1
    const target = remainingLength / remainingGroups
    let best = cursor + 1
    let bestScore = Number.POSITIVE_INFINITY
    let length = -1
    for (let index = cursor; index < words.length - (count - group); index += 1) {
      length += words[index].length + 1
      const endsSentence = /[.!?…]["”’)]?$/.test(words[index])
      const endsClause = /[,;:]["”’)]?$/.test(words[index])
      const distance = Math.abs(length - target)
      // A sentence or clause end within a few characters of the ideal break wins.
      const score = distance - (endsSentence ? 6 : endsClause ? 3 : 0)
      if (score < bestScore) {
        bestScore = score
        best = index + 1
      }
    }
    groups.push(words.slice(cursor, best))
    cursor = best
  }
  groups.push(words.slice(cursor))
  return groups
}

/** Lays `text` out in the fewest balanced lines (≤ maxLines) where every line fits; null if impossible. */
export function wrapCueText(text: string, maxLineLength = QUALITY_THRESHOLDS.maxLineLength, maxLines = QUALITY_THRESHOLDS.maxLines): string | null {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.some((word) => word.length > maxLineLength)) return null
  for (let lines = 1; lines <= maxLines; lines += 1) {
    const groups = balanceWords(words, lines)
    if (groups.every((group) => group.join(' ').length <= maxLineLength)) {
      return groups.map((group) => group.join(' ')).join('\n')
    }
  }
  return null
}

/**
 * Splits a cue's text into the fewest parts that each fit within the line limits once re-wrapped.
 * Long transcript paragraphs may need many parts; the cap keeps pathological input bounded.
 */
export function splitCueText(text: string, maxLineLength = QUALITY_THRESHOLDS.maxLineLength, maxLines = QUALITY_THRESHOLDS.maxLines, maxParts = 64): string[] | null {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.some((word) => word.length > maxLineLength)) return null
  // Lower bound from total length so we don't try counts that can't possibly fit.
  const capacity = maxLineLength * maxLines
  const minimum = Math.max(2, Math.ceil(words.join(' ').length / capacity))
  for (let parts = minimum; parts <= Math.min(maxParts, words.length); parts += 1) {
    const wrapped = balanceWords(words, parts).map((group) => wrapCueText(group.join(' '), maxLineLength, maxLines))
    if (wrapped.every((part): part is string => part !== null)) return wrapped
  }
  // Balanced splitting can leave one group just over the limit; fall back to a greedy fill.
  const greedy: string[][] = [[]]
  for (const word of words) {
    const current = greedy[greedy.length - 1]
    if (wrapCueText([...current, word].join(' '), maxLineLength, maxLines) !== null) current.push(word)
    else greedy.push([word])
  }
  if (greedy.length < 2 || greedy.length > maxParts) return null
  const wrapped = greedy.map((group) => wrapCueText(group.join(' '), maxLineLength, maxLines))
  return wrapped.every((part): part is string => part !== null) ? wrapped : null
}

/** Distributes [start, end] across parts in proportion to their character counts. */
export function splitTiming(start: number, end: number, parts: string[]): Array<{ start: number; end: number }> {
  const weights = parts.map((part) => Math.max(1, part.replace(/\s+/g, '').length))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const duration = Math.max(0, end - start)
  let cursor = start
  return parts.map((_, index) => {
    const next = index === parts.length - 1 ? end : Math.round(cursor + (duration * weights[index]) / total)
    const slice = { start: cursor, end: next }
    cursor = next
    return slice
  })
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
      const previousEnd = ends[index - 1]
      const duration = end !== null ? end - start : 0
      const shiftedEnd = previousEnd !== null ? previousEnd + duration : null
      // Prefer trimming only when the previous cue remains readable. Otherwise preserve both
      // durations by moving this cue after it, provided that does not collide with the next cue.
      const canTrim = previousStart !== null && previousStart < start
      const canTrimReadably = canTrim && start - previousStart >= QUALITY_THRESHOLDS.minDurationMs
      const canShift = previousEnd !== null
        && duration >= QUALITY_THRESHOLDS.minDurationMs
        && shiftedEnd !== null
        && (nextStart === null || shiftedEnd <= nextStart)
      const fix: QualityFix | undefined = canTrimReadably || (canTrim && !canShift)
        ? { kind: 'trim-previous', cueId: cue.id }
        : canShift
          ? { kind: 'start-at-previous-end', cueId: cue.id }
          : undefined
      push({
        check: 'overlap',
        severity: 'warning',
        cueId: cue.id,
        cueIndex: index,
        message: `Starts ${formatTimestamp(start)} but cue ${index} ends at ${previousEnd !== null ? formatTimestamp(previousEnd) : '?'}.${fix?.kind === 'start-at-previous-end' ? ' Fix moves this cue after the previous cue.' : ''}`,
        fix,
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
      const tooLong = longest > QUALITY_THRESHOLDS.maxLineLength
      const tooMany = lines.length > QUALITY_THRESHOLDS.maxLines
      if (tooLong || tooMany) {
        // Prefer re-wrapping inside the cue; fall back to splitting it into several cues, but only
        // when each part would still be on screen long enough to read.
        const rewrapped = wrapCueText(cleaned)
        let parts = rewrapped === null ? splitCueText(cleaned) : null
        if (parts && start !== null && end !== null) {
          const shortest = Math.min(...splitTiming(start, end, parts).map((slice) => slice.end - slice.start))
          if (shortest < QUALITY_THRESHOLDS.minDurationMs) parts = null
        }
        const layoutFix: QualityFix | undefined = rewrapped !== null && rewrapped !== cue.text
          ? { kind: 'rewrap', cueId: cue.id, text: rewrapped }
          : parts
            ? { kind: 'split-cue', cueId: cue.id, parts }
            : undefined
        if (tooLong) {
          push({
            check: 'long-line',
            severity: 'warning',
            cueId: cue.id,
            cueIndex: index,
            message: `Longest line is ${longest} characters; aim for ${QUALITY_THRESHOLDS.maxLineLength} or fewer.${layoutFix?.kind === 'split-cue' ? ` Fix splits it into ${layoutFix.parts.length} cues.` : ''}`,
            fix: layoutFix,
          })
        }
        if (tooMany) {
          // One layout fix per cue: when both checks fire, the long-line finding carries it.
          const fix = tooLong ? undefined : layoutFix
          push({
            check: 'too-many-lines',
            severity: 'warning',
            cueId: cue.id,
            cueIndex: index,
            message: `${lines.length} lines of text; most players show ${QUALITY_THRESHOLDS.maxLines} comfortably.${fix?.kind === 'split-cue' ? ` Fix splits it into ${fix.parts.length} cues.` : ''}`,
            fix,
          })
        }
      }
    }

    if (start !== null && end !== null && end >= start && cleaned.length > 0) {
      const duration = end - start
      // The end can grow up to the next cue's start (or freely for the last cue) without a collision.
      const ceiling = nextStart !== null ? nextStart : Number.POSITIVE_INFINITY
      const roomToExtend = (target: number) => target > end && target <= ceiling

      if (duration < QUALITY_THRESHOLDS.minDurationMs) {
        const target = start + QUALITY_THRESHOLDS.targetDurationMs
        const minimum = start + QUALITY_THRESHOLDS.minDurationMs
        const extendedEnd = roomToExtend(target) ? target : roomToExtend(minimum) ? minimum : null
        let fix: QualityFix | undefined = extendedEnd !== null ? { kind: 'extend-end', cueId: cue.id, end: extendedEnd } : undefined
        if (!fix) {
          // No room to extend: merging with the next cue is safe when the combined text still
          // fits two lines and the next cue follows immediately (a split utterance).
          const next = cues[index + 1]
          const nextEnd = ends[index + 1]
          const nextText = next ? cleanCueText(next.text) : ''
          if (next && nextStart !== null && nextEnd !== null && nextStart - end <= 250 && nextEnd > start) {
            // Never merge two speakers' lines into one cue; strip a repeated label from the second.
            const mine = splitSpeaker(cleaned)
            const theirs = splitSpeaker(nextText)
            const sameSpeaker = (mine?.speaker ?? null) === (theirs?.speaker ?? null)
            if (sameSpeaker) {
              const merged = wrapCueText(`${cleaned} ${theirs ? theirs.text : nextText}`.trim())
              if (merged !== null) fix = { kind: 'merge-next', cueId: cue.id, text: merged }
            }
          }
        }
        const expanded = fix ? null : expandedRange(cues, index, starts, ends, QUALITY_THRESHOLDS.minDurationMs)
        if (expanded) fix = { kind: 'expand-range', cueId: cue.id, ...expanded }
        push({
          check: 'short-duration',
          severity: 'warning',
          cueId: cue.id,
          cueIndex: index,
          message: `Only on screen for ${duration} ms; aim for at least ${QUALITY_THRESHOLDS.minDurationMs} ms.${fix?.kind === 'merge-next' ? ' Fix merges it with the next cue.' : ''}`,
          fix,
        })
      } else {
        const speed = readingSpeed(cleaned, duration)
        if (speed > QUALITY_THRESHOLDS.maxCharsPerSecond) {
          const characters = cleaned.replace(/\s+/g, '').length
          const target = start + Math.ceil((characters / QUALITY_THRESHOLDS.maxCharsPerSecond) * 1000)
          const expanded = roomToExtend(target)
            ? null
            : expandedRange(cues, index, starts, ends, target - start)
          push({
            check: 'reading-speed',
            severity: 'warning',
            cueId: cue.id,
            cueIndex: index,
            message: `${speed.toFixed(1)} characters per second; ${QUALITY_THRESHOLDS.maxCharsPerSecond} or fewer is comfortable.`,
            fix: roomToExtend(target)
              ? { kind: 'extend-end', cueId: cue.id, end: target }
              : expanded
                ? { kind: 'expand-range', cueId: cue.id, ...expanded }
                : undefined,
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
    case 'rewrap':
      return cues.map((cue, position) => (position === index ? { ...cue, text: fix.text } : cue))
    case 'start-at-previous-end': {
      const previousEnd = index > 0 ? tryParse(cues[index - 1].end) : null
      const start = tryParse(cues[index].start)
      const end = tryParse(cues[index].end)
      if (previousEnd === null || start === null || end === null) return cues
      return cues.map((cue, position) => (position === index
        ? { ...cue, start: formatTimestamp(previousEnd), end: formatTimestamp(previousEnd + end - start) }
        : cue))
    }
    case 'merge-next': {
      const next = cues[index + 1]
      if (!next) return cues
      const end = tryParse(next.end) ?? tryParse(cues[index].end)
      const merged: EditableCue = { ...cues[index], end: end === null ? cues[index].end : formatTimestamp(end), text: fix.text }
      return [...cues.slice(0, index), merged, ...cues.slice(index + 2)]
    }
    case 'expand-range': {
      const oldStart = tryParse(cues[index].start)
      const oldEnd = tryParse(cues[index].end)
      if (oldStart === null || oldEnd === null) return cues
      return cues.map((cue, position) => {
        if (position === index) {
          return { ...cue, start: formatTimestamp(fix.start), end: formatTimestamp(fix.end) }
        }
        if (position === index - 1 && tryParse(cue.end) === oldStart) {
          return { ...cue, end: formatTimestamp(fix.start) }
        }
        if (position === index + 1 && tryParse(cue.start) === oldEnd) {
          return { ...cue, start: formatTimestamp(fix.end) }
        }
        return cue
      })
    }
    case 'split-cue': {
      const cue = cues[index]
      const start = tryParse(cue.start)
      const end = tryParse(cue.end)
      if (start === null || end === null || fix.parts.length < 2) return cues
      const timings = splitTiming(start, end, fix.parts)
      const taken = new Set(cues.map((existing) => existing.id))
      const replacements: EditableCue[] = fix.parts.map((text, part) => ({
        // The first part keeps the cue's identity (and any original id); the rest are new cues.
        ...(part === 0 ? cue : { id: uniqueSplitId(cue.id, part, taken) }),
        start: formatTimestamp(timings[part].start),
        end: formatTimestamp(timings[part].end),
        text,
      }))
      return [...cues.slice(0, index), ...replacements, ...cues.slice(index + 1)]
    }
  }
}

/** Deterministic id for a cue created by splitting `sourceId`, bumped if a previous split already used it. */
function uniqueSplitId(sourceId: string, part: number, taken: Set<string>): string {
  let candidate = `${sourceId}-split-${part}`
  for (let attempt = 2; taken.has(candidate); attempt += 1) candidate = `${sourceId}-split-${part}-${attempt}`
  taken.add(candidate)
  return candidate
}

function rebalanceTimings(cues: EditableCue[]): EditableCue[] {
  const parsed = cues.map((cue) => ({
    start: tryParse(cue.start),
    end: tryParse(cue.end),
    required: requiredDuration(cue.text),
  }))
  let changed = false
  const result = [...cues]

  for (let first = 0; first < cues.length;) {
    let last = first
    while (
      last + 1 < cues.length
      && parsed[last].end !== null
      && parsed[last].end === parsed[last + 1].start
    ) {
      last += 1
    }

    const groupStart = parsed[first].start
    const groupEnd = parsed[last].end
    if (last > first && groupStart !== null && groupEnd !== null) {
      const totalRequired = parsed
        .slice(first, last + 1)
        .reduce((sum, cue) => sum + cue.required, 0)
      if (totalRequired <= groupEnd - groupStart) {
        const boundaries = new Array<number>(last - first + 2)
        const latest = new Array<number>(last - first + 2)
        boundaries[0] = groupStart
        latest[latest.length - 1] = groupEnd
        for (let offset = latest.length - 2; offset >= 0; offset -= 1) {
          latest[offset] = latest[offset + 1] - parsed[first + offset].required
        }
        for (let offset = 1; offset < boundaries.length - 1; offset += 1) {
          const original = parsed[first + offset].start!
          const earliest = boundaries[offset - 1] + parsed[first + offset - 1].required
          boundaries[offset] = Math.min(Math.max(original, earliest), latest[offset])
        }
        boundaries[boundaries.length - 1] = groupEnd

        for (let offset = 0; offset <= last - first; offset += 1) {
          const index = first + offset
          const start = formatTimestamp(boundaries[offset])
          const end = formatTimestamp(boundaries[offset + 1])
          if (result[index].start !== start || result[index].end !== end) {
            result[index] = { ...result[index], start, end }
            changed = true
          }
        }
      }
    }
    first = last + 1
  }
  return changed ? result : cues
}

/**
 * Applies every safe fix, re-analyzing after each one because fixes can shift indices
 * (removing a cue) or resolve neighbouring findings (trimming an overlap).
 */
export function applyAllFixes(cues: EditableCue[]): { cues: EditableCue[]; applied: number } {
  let current = cues
  let applied = 0
  for (let iteration = 0; iteration < QUALITY_CHECK_IDS.length * 4; iteration += 1) {
    const fixes = analyzeCues(current).findings.flatMap((finding) => (finding.fix ? [finding.fix] : []))
    if (fixes.length === 0) {
      const rebalanced = rebalanceTimings(current)
      if (rebalanced === current) break
      current = rebalanced
      applied += 1
      continue
    }
    // Fixes that touch distinct cues are independent, so apply one batch per analysis pass.
    // Neighbour-touching fixes (trim/shift against the previous cue, merge with the next) reserve both.
    const touched = new Set<string>()
    const ids = current.map((cue) => cue.id)
    let progressed = false
    for (const fix of fixes) {
      const index = ids.indexOf(fix.cueId)
      if (index === -1) continue
      const affected = fix.kind === 'trim-previous' || fix.kind === 'start-at-previous-end'
        ? [fix.cueId, ids[index - 1]]
        : fix.kind === 'expand-range'
          ? [fix.cueId, ids[index - 1], ids[index + 1]]
        : fix.kind === 'merge-next'
          ? [fix.cueId, ids[index + 1]]
          : [fix.cueId]
      if (affected.some((id) => id && touched.has(id))) continue
      const updated = applyFix(current, fix)
      if (updated === current) continue
      affected.forEach((id) => id && touched.add(id))
      current = updated
      applied += 1
      progressed = true
    }
    if (!progressed) break
  }
  return { cues: current, applied }
}
