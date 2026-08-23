import { describe, expect, it } from 'vitest'
import { looksLikeTranscript, parseCaptions } from './parse'

const blockTranscript = `00:00.60
James
Welcome back, everyone, to Merge Conflict.

00:14.08
Frank
thank

00:14.98
James
Frank Krueger. How's it going, buddy?

00:14.57
Frank
Oh, it's going very well.`

const inlineTranscript = `[00:00:01] Alice: Hello there, and welcome.
[00:00:04] Bob: Thanks for having me.
This continues Bob's thought.
[00:00:09] Alice: Let's begin.`

const speakerFirst = `Alice (00:01): Hello there.
Bob (00:04): Thanks for having me.
Alice (00:09): Let's begin.`

const noSpeakers = `00:01.000
First thought.

00:04.500
Second thought.`

describe('transcript import', () => {
  it('parses timestamp / speaker / text blocks with real timings and speaker prefixes', () => {
    const { format, cues } = parseCaptions(blockTranscript, 'transcript.txt')
    expect(format).toBe('txt')
    expect(cues).toHaveLength(4)
    expect(cues[0]).toMatchObject({ start: 600, end: 14080, text: 'James: Welcome back, everyone, to Merge Conflict.' })
    expect(cues[1]).toMatchObject({ start: 14080, end: 14980, text: 'Frank: thank' })
    // A later entry whose timestamp regresses keeps a positive duration for its predecessor.
    expect(cues[2]).toMatchObject({ start: 14980, end: 17980 })
    expect(cues[3]).toMatchObject({ start: 14570, end: 17570, text: 'Frank: Oh, it\'s going very well.' })
  })

  it('parses one-line [time] Speaker: text entries with continuation lines', () => {
    const { cues } = parseCaptions(inlineTranscript, 'notes.txt')
    expect(cues.map((cue) => cue.text)).toEqual([
      'Alice: Hello there, and welcome.',
      "Bob: Thanks for having me.\nThis continues Bob's thought.",
      "Alice: Let's begin.",
    ])
    expect(cues.map((cue) => cue.start)).toEqual([1000, 4000, 9000])
  })

  it('parses Speaker (time): text entries', () => {
    const { cues } = parseCaptions(speakerFirst, 'meeting.txt')
    expect(cues.map((cue) => [cue.start, cue.text])).toEqual([[1000, 'Alice: Hello there.'], [4000, 'Bob: Thanks for having me.'], [9000, "Alice: Let's begin."]])
  })

  it('handles timestamped blocks without speaker lines', () => {
    const { cues } = parseCaptions(noSpeakers, 'x.txt')
    expect(cues).toEqual([
      { start: 1000, end: 4500, text: 'First thought.' },
      { start: 4500, end: 7500, text: 'Second thought.' },
    ])
  })

  it('leaves ordinary prose on the plain-text path', () => {
    const prose = 'Meet at 10:30 tomorrow.\n\nBring the 12:45 train schedule.\n\nThe rest is just text.\n\nMore text here.'
    expect(looksLikeTranscript(prose)).toBe(false)
    const { cues } = parseCaptions(prose, 'notes.txt')
    expect(cues).toHaveLength(4)
    expect(cues[0]).toMatchObject({ start: 0, end: 3000, text: 'Meet at 10:30 tomorrow.' })
  })

  it('detects transcripts pasted without a file name', () => {
    expect(parseCaptions(blockTranscript, 'pasted-captions').cues[0].start).toBe(600)
  })
})

describe('transcript edge cases', () => {
  it('keeps words before a clause colon when the prefix is not a speaker', () => {
    const { cues } = parseCaptions('00:10 The meeting starts at noon: bring food\n00:14 Then we go home', 'a.txt')
    expect(cues[0].text).toBe('The meeting starts at noon: bring food')
    expect(cues[1].text).toBe('Then we go home')
  })

  it('does not promote a short sentence to a speaker in block form', () => {
    const { cues } = parseCaptions('00:10\nYeah, totally.\nAnd then we went on and on.\n\n00:14\nOkay.\nSure thing.', 'b.txt')
    expect(cues.map((cue) => cue.text)).toEqual(['Yeah, totally.\nAnd then we went on and on.', 'Okay.\nSure thing.'])
  })
})
