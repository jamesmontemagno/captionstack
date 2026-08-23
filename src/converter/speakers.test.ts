import { describe, expect, it } from 'vitest'
import { toEditableCues } from './edit'
import { applySpeakerStyle, detectSpeakers, splitSpeaker } from './speakers'

const dialogue = () => toEditableCues([
  { start: 0, end: 1000, text: 'James: Welcome back, everyone.' },
  { start: 1000, end: 2000, text: 'Frank: thank' },
  { start: 2000, end: 3000, text: 'Frank: Oh, it\'s going well.' },
  { start: 3000, end: 4000, text: 'James: Note: this has a colon.' },
  { start: 4000, end: 5000, text: '(laughter)' },
])

describe('splitSpeaker', () => {
  it('splits short leading labels and leaves clauses alone', () => {
    expect(splitSpeaker('James: Hello')).toEqual({ speaker: 'James', text: 'Hello' })
    expect(splitSpeaker('Dr. Jane Doe: Hello')).toBeNull()
    expect(splitSpeaker('The thing is this: it works')).toBeNull()
    expect(splitSpeaker('Time: 10:30')).toEqual({ speaker: 'Time', text: '10:30' })
    expect(splitSpeaker('No label here')).toBeNull()
  })
})

describe('detectSpeakers', () => {
  it('finds the cast when most cues are labelled', () => {
    expect(detectSpeakers(dialogue())).toEqual({ names: ['James', 'Frank'], labelled: 4 })
  })

  it('ignores ordinary captions with an occasional colon', () => {
    const cues = toEditableCues([
      { start: 0, end: 1000, text: 'Warning: wet floor' },
      { start: 1000, end: 2000, text: 'Please mind the step.' },
      { start: 2000, end: 3000, text: 'Thank you.' },
    ])
    expect(detectSpeakers(cues)).toBeNull()
  })
})

describe('applySpeakerStyle', () => {
  it('strips labels', () => {
    const result = applySpeakerStyle(dialogue(), 'none')
    expect(result.map((cue) => cue.text)).toEqual(['Welcome back, everyone.', 'thank', "Oh, it's going well.", 'Note: this has a colon.', '(laughter)'])
  })

  it('uses a dash only when the speaker changes', () => {
    const result = applySpeakerStyle(dialogue(), 'dash')
    expect(result.map((cue) => cue.text)).toEqual(['- Welcome back, everyone.', '- thank', "Oh, it's going well.", '- Note: this has a colon.', '(laughter)'])
  })

  it('is a no-op for the name style', () => {
    const input = dialogue()
    expect(applySpeakerStyle(input, 'name')).toBe(input)
  })
})
