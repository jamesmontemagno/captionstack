import { describe, expect, it } from 'vitest'
import { findClosestCueIndex } from './OriginalPane'
import type { EditableCue } from './converter'

const cues: EditableCue[] = [
  { id: 'one', start: '00:00:01.000', end: '00:00:02.000', text: 'One' },
  { id: 'two', start: '00:00:05.000', end: '00:00:06.000', text: 'Two' },
  { id: 'three', start: '00:00:09.000', end: '00:00:10.000', text: 'Three' },
]

describe('original cue matching', () => {
  it('finds the cue with the closest start time', () => {
    expect(findClosestCueIndex(cues, 6_500)).toBe(1)
    expect(findClosestCueIndex(cues, 8_000)).toBe(2)
  })

  it('prefers the earlier cue when two starts are equally close', () => {
    expect(findClosestCueIndex(cues, 3_000)).toBe(0)
  })

  it('handles an empty original', () => {
    expect(findClosestCueIndex([], 1_000)).toBe(-1)
  })
})
