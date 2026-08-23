import { describe, expect, it } from 'vitest'
import { toEditableCues } from './edit'
import { buildPattern, findMatches, replaceAll } from './search'

const cues = () => toEditableCues([
  { start: 0, end: 1000, text: 'Hello Bob. Hello again, bob!' },
  { start: 1000, end: 2000, text: 'Bobby says [Music] plays.' },
  { start: 2000, end: 3000, text: 'Nothing here (1+1).' },
])

describe('buildPattern', () => {
  it('escapes plain queries', () => {
    const { pattern } = buildPattern('(1+1)')
    expect(pattern?.test('Nothing here (1+1).')).toBe(true)
  })

  it('reports invalid regular expressions', () => {
    const { pattern, error } = buildPattern('(', { useRegex: true })
    expect(pattern).toBeNull()
    expect(error).toBeTruthy()
  })

  it('still rejects invalid regexes when whole-word wrapping would make them valid', () => {
    expect(buildPattern('[', { useRegex: true, wholeWord: true }).pattern).toBeNull()
  })

  it('rejects patterns that match the empty string', () => {
    expect(buildPattern('a*', { useRegex: true }).error).toContain('empty')
  })
})

describe('findMatches', () => {
  it('counts occurrences per cue case-insensitively by default', () => {
    const result = findMatches(cues(), 'bob')
    expect(result.total).toBe(3)
    expect(result.matches.map((match) => [match.cueIndex, match.count])).toEqual([[0, 2], [1, 1]])
    expect(result.matches[0]).toMatchObject({ before: 'Hello ', match: 'Bob', after: '. Hello again, bob!' })
  })

  it('respects match case and whole word', () => {
    expect(findMatches(cues(), 'bob', { matchCase: true }).total).toBe(1)
    expect(findMatches(cues(), 'bob', { wholeWord: true }).total).toBe(2)
    expect(findMatches(cues(), 'Bob', { matchCase: true, wholeWord: true }).total).toBe(1)
  })

  it('supports regular expressions', () => {
    const result = findMatches(cues(), '\\[.*?\\]', { useRegex: true })
    expect(result.total).toBe(1)
    expect(result.matches[0].match).toBe('[Music]')
  })

  it('returns no matches and the error for an invalid regex', () => {
    const result = findMatches(cues(), '[', { useRegex: true })
    expect(result.total).toBe(0)
    expect(result.error).toBeTruthy()
  })
})

describe('replaceAll', () => {
  it('replaces every occurrence and leaves untouched cues referentially equal', () => {
    const input = cues()
    const result = replaceAll(input, 'bob', 'Alice')
    expect(result[0].text).toBe('Hello Alice. Hello again, Alice!')
    expect(result[1].text).toBe('Aliceby says [Music] plays.')
    expect(result[2]).toBe(input[2])
  })

  it('treats $ literally in plain mode and as a group reference in regex mode', () => {
    expect(replaceAll(cues(), 'Bob', '$1')[0].text).toBe('Hello $1. Hello again, $1!')
    expect(replaceAll(cues(), '(Bob)', '<$1>', { useRegex: true, matchCase: true })[0].text).toBe('Hello <Bob>. Hello again, bob!')
  })

  it('removes matches when the replacement is empty', () => {
    expect(replaceAll(cues(), ' [Music]', '')[1].text).toBe('Bobby says plays.')
  })

  it('returns the same array when nothing matches or the pattern is invalid', () => {
    const input = cues()
    expect(replaceAll(input, 'zzz', 'y')).toBe(input)
    expect(replaceAll(input, '(', 'y', { useRegex: true })).toBe(input)
  })
})
