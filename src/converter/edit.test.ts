import { describe, expect, it } from 'vitest'
import {
  addCue,
  mergeCue,
  moveCue,
  parseCaptions,
  removeCue,
  splitCue,
  toCues,
  toEditableCues,
  updateCue,
  validateCues,
} from '.'

const baseCues = parseCaptions(
  `1
00:00:01,000 --> 00:00:03,000
Hello, world!

2
00:00:04,000 --> 00:00:06,000
A second caption.`,
  'captions.srt',
).cues

describe('editable cue conversion', () => {
  it('round-trips numeric cues through the editable model', () => {
    const editable = toEditableCues(baseCues)
    expect(editable).toHaveLength(2)
    expect(editable[0].start).toBe('00:00:01.000')
    const restored = toCues(editable)
    expect(restored.map((cue) => cue.start)).toEqual([1000, 4000])
    expect(restored.map((cue) => cue.text)).toEqual(['Hello, world!', 'A second caption.'])
  })
})

describe('cue validation', () => {
  it('accepts a well-formed cue list', () => {
    expect(validateCues(toEditableCues(baseCues)).size).toBe(0)
  })

  it('flags invalid time ranges', () => {
    const editable = updateCue(toEditableCues(baseCues), 0, { end: '00:00:00.500' })
    const errors = validateCues(editable)
    expect(errors.get(editable[0].id)?.end).toBeDefined()
  })

  it('flags unparseable timestamps', () => {
    const editable = updateCue(toEditableCues(baseCues), 0, { start: 'not-a-time' })
    expect(validateCues(editable).get(editable[0].id)?.start).toBeDefined()
  })

  it('flags overlapping cues', () => {
    const editable = updateCue(toEditableCues(baseCues), 1, { start: '00:00:02.000' })
    expect(validateCues(editable).get(editable[1].id)?.overlap).toBeDefined()
  })
})

describe('cue operations', () => {
  it('adds a cue after the given index', () => {
    const result = addCue(toEditableCues(baseCues), 0)
    expect(result).toHaveLength(3)
    expect(validateCues(result).size).toBe(0)
  })

  it('removes a cue', () => {
    const result = removeCue(toEditableCues(baseCues), 0)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('A second caption.')
  })

  it('moves a cue', () => {
    const result = moveCue(toEditableCues(baseCues), 0, 1)
    expect(result.map((cue) => cue.text)).toEqual(['A second caption.', 'Hello, world!'])
  })

  it('does not move past the edges', () => {
    const editable = toEditableCues(baseCues)
    expect(moveCue(editable, 0, -1)).toEqual(editable)
    expect(moveCue(editable, 1, 1)).toEqual(editable)
  })

  it('splits a cue in half', () => {
    const result = splitCue(toEditableCues(baseCues), 0)
    expect(result).toHaveLength(3)
    expect(result[0].end).toBe('00:00:02.000')
    expect(result[1].start).toBe('00:00:02.000')
    expect(result[0].text).toBe('Hello,')
    expect(result[1].text).toBe('world!')
    expect(validateCues(result).size).toBe(0)
  })

  it('merges a cue with the following cue', () => {
    const result = mergeCue(toEditableCues(baseCues), 0)
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe('00:00:01.000')
    expect(result[0].end).toBe('00:00:06.000')
    expect(result[0].text).toBe('Hello, world!\nA second caption.')
  })
})
