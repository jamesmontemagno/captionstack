import { describe, expect, it } from 'vitest'
import { toEditableCues } from './edit'
import { convertFrameRate, findActiveCue, parseOffset, scaleCues, shiftCues, syncToAnchors } from './timing'

const cues = () => toEditableCues([
  { start: 1000, end: 3000, text: 'One' },
  { start: 10000, end: 12000, text: 'Two' },
  { start: 100000, end: 102000, text: 'Three' },
])

describe('shiftCues', () => {
  it('moves every cue by the offset', () => {
    const result = shiftCues(cues(), 1500)
    expect(result.map((cue) => cue.start)).toEqual(['00:00:02.500', '00:00:11.500', '00:01:41.500'])
    expect(result[0].end).toBe('00:00:04.500')
  })

  it('clamps at zero when shifting earlier', () => {
    const result = shiftCues(cues(), -2000)
    expect(result[0].start).toBe('00:00:00.000')
    expect(result[0].end).toBe('00:00:01.000')
  })

  it('returns the same array for a zero or invalid offset', () => {
    const input = cues()
    expect(shiftCues(input, 0)).toBe(input)
    expect(shiftCues(input, Number.NaN)).toBe(input)
  })

  it('leaves unparseable fields untouched', () => {
    const input = cues()
    input[1] = { ...input[1], start: 'typing…' }
    const result = shiftCues(input, 1000)
    expect(result[1].start).toBe('typing…')
    expect(result[1].end).toBe('00:00:13.000')
  })
})

describe('scaleCues / convertFrameRate', () => {
  it('scales times by the factor with millisecond rounding', () => {
    const result = scaleCues(cues(), 2)
    expect(result.map((cue) => cue.start)).toEqual(['00:00:02.000', '00:00:20.000', '00:03:20.000'])
  })

  it('retimes 23.976 fps captions for 25 fps playback (runs faster)', () => {
    const result = convertFrameRate(cues(), 23.976, 25)
    // 100000 * 23.976 / 25 = 95904
    expect(result[2].start).toBe('00:01:35.904')
  })

  it('ignores invalid factors', () => {
    const input = cues()
    expect(scaleCues(input, 0)).toBe(input)
    expect(scaleCues(input, 1)).toBe(input)
    expect(convertFrameRate(input, 0, 25)).toBe(input)
  })
})

describe('syncToAnchors', () => {
  it('corrects offset and drift from two reference points', () => {
    // First cue should start at 2s (was 1s), last at 200s (was 100s): offset +1s then 2x drift
    const result = syncToAnchors(cues(), { index: 0, targetMs: 2000 }, { index: 2, targetMs: 200000 })
    expect(result[0].start).toBe('00:00:02.000')
    expect(result[2].start).toBe('00:03:20.000')
    // Middle cue lands proportionally: 2000 + (10000-1000) * (198000/99000) = 20000
    expect(result[1].start).toBe('00:00:20.000')
    // Durations stretch with the factor
    expect(result[0].end).toBe('00:00:06.000')
  })

  it('is a no-op for identical or invalid anchors', () => {
    const input = cues()
    expect(syncToAnchors(input, { index: 0, targetMs: 0 }, { index: 0, targetMs: 5000 })).toBe(input)
    expect(syncToAnchors(input, { index: 0, targetMs: 5000 }, { index: 2, targetMs: 1000 })).toBe(input)
    expect(syncToAnchors(input, { index: 0, targetMs: 0 }, { index: 9, targetMs: 5000 })).toBe(input)
  })
})

describe('parseOffset', () => {
  it('accepts seconds, units, timestamps, and signs', () => {
    expect(parseOffset('1.5')).toBe(1500)
    expect(parseOffset('-250ms')).toBe(-250)
    expect(parseOffset('+00:00:02.000')).toBe(2000)
    expect(parseOffset('-1:00')).toBe(-60000)
  })

  it('rejects blanks and garbage', () => {
    expect(parseOffset('')).toBeNull()
    expect(parseOffset('abc')).toBeNull()
  })
})

describe('findActiveCue', () => {
  const timings = [
    { start: 0, end: 1000 },
    { start: 1000, end: 2000 },
    { start: 1500, end: 5000 },
    { start: 6000, end: 7000 },
    { start: null, end: null },
    { start: 8000, end: 9000 },
  ]

  it('finds the cue covering the time, including overlaps and gaps', () => {
    expect(findActiveCue(timings, 500)).toBe(0)
    expect(findActiveCue(timings, 1000)).toBe(1)
    expect(findActiveCue(timings, 1800)).toBe(2)
    expect(findActiveCue(timings, 3000)).toBe(2)
    expect(findActiveCue(timings, 5500)).toBe(-1)
    expect(findActiveCue(timings, 8500)).toBe(5)
  })

  it('handles empty lists and times before the first cue', () => {
    expect(findActiveCue([], 100)).toBe(-1)
    expect(findActiveCue([{ start: 500, end: 900 }], 100)).toBe(-1)
  })
})
