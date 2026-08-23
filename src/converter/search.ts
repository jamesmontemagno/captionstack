import type { EditableCue } from './edit'

export interface SearchOptions {
  matchCase?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

export interface SearchMatch {
  cueId: string
  cueIndex: number
  /** Number of occurrences inside this cue. */
  count: number
  /** The cue text with the first match marked, for previews. */
  before: string
  match: string
  after: string
}

export interface SearchResult {
  matches: SearchMatch[]
  /** Total occurrences across all cues. */
  total: number
  error?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Builds the search pattern, or returns an error message for an invalid regular expression. */
export function buildPattern(query: string, options: SearchOptions = {}): { pattern: RegExp | null; error?: string } {
  if (!query) return { pattern: null }
  const flags = `gu${options.matchCase ? '' : 'i'}`
  try {
    // Validate the user's expression on its own first; wrapping it for whole-word matching
    // could otherwise turn an invalid pattern such as "[" into a valid character class.
    if (options.useRegex) new RegExp(query, flags)
    let source = options.useRegex ? query : escapeRegExp(query)
    if (options.wholeWord) {
      // Unicode-aware word boundaries: no letter/number/underscore on either side.
      source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
    }
    const pattern = new RegExp(source, flags)
    // Guard against patterns that match the empty string, which would loop forever in replace.
    if (pattern.test('')) return { pattern: null, error: 'The pattern matches empty text. Make it more specific.' }
    return { pattern }
  } catch (caught) {
    return { pattern: null, error: caught instanceof Error ? caught.message.replace(/^Invalid regular expression: /, '') : 'Invalid regular expression.' }
  }
}

export function findMatches(cues: EditableCue[], query: string, options: SearchOptions = {}): SearchResult {
  const { pattern, error } = buildPattern(query, options)
  if (!pattern) return { matches: [], total: 0, error }
  const matches: SearchMatch[] = []
  let total = 0
  cues.forEach((cue, cueIndex) => {
    let first: RegExpMatchArray | null = null
    let count = 0
    // matchAll advances past zero-length matches per spec, so look-arounds like "\b" can't
    // spin forever the way a manual exec() loop would.
    for (const match of cue.text.matchAll(pattern)) {
      if (match[0].length === 0) continue
      count += 1
      first ??= match
    }
    if (!first || first.index === undefined) return
    total += count
    matches.push({
      cueId: cue.id,
      cueIndex,
      count,
      before: cue.text.slice(0, first.index),
      match: first[0],
      after: cue.text.slice(first.index + first[0].length),
    })
  })
  return { matches, total }
}

/**
 * Replaces every occurrence in every cue. In regex mode the replacement supports $1, $<name>,
 * and $& like String.prototype.replace; in plain mode it is inserted literally.
 */
export function replaceAll(cues: EditableCue[], query: string, replacement: string, options: SearchOptions = {}): EditableCue[] {
  const { pattern } = buildPattern(query, options)
  if (!pattern) return cues
  const literal = options.useRegex ? replacement : replacement.replace(/\$/g, '$$$$')
  let changed = false
  const result = cues.map((cue) => {
    pattern.lastIndex = 0
    if (!pattern.test(cue.text)) return cue
    pattern.lastIndex = 0
    changed = true
    return { ...cue, text: cue.text.replace(pattern, literal) }
  })
  return changed ? result : cues
}
