import { describe, expect, it } from 'vitest'
import { FORMAT_IDS } from './types'
import { serializeCaptions, splitOutput } from './serialize'

const cues = [
  { id: 'intro', start: 1000, end: 4200, text: 'Caption files,\nmeet your converter.' },
  { start: 4600, end: 8300, text: 'Everything happens privately, "quoted" and all.' },
  { start: 8700, end: 12000, text: 'Choose a format, then download.' },
]

describe('splitOutput', () => {
  it.each(FORMAT_IDS)('reassembles %s output exactly from header + cues + footer', (format) => {
    const output = serializeCaptions(cues, format)
    const segments = splitOutput(output, format, cues.length)
    expect(segments.cues).toHaveLength(cues.length)
    const joiner = format === 'srt' || format === 'sbv' || format === 'txt' || format === 'vtt' ? '\n\n' : '\n'
    const headerGap = format === 'vtt' ? '\n' : ''
    expect(`${segments.header}${headerGap}${segments.cues.join(joiner)}${segments.footer}\n`).toBe(output)
  })

  it('maps each chunk to the right cue', () => {
    const segments = splitOutput(serializeCaptions(cues, 'vtt'), 'vtt', cues.length)
    expect(segments.header).toBe('WEBVTT\n')
    expect(segments.cues[0]).toContain('intro\n00:00:01.000 --> 00:00:04.200')
    expect(segments.cues[2]).toContain('Choose a format')
  })

  it('keeps multi-line CSV cells in a single chunk', () => {
    const segments = splitOutput(serializeCaptions(cues, 'csv'), 'csv', cues.length)
    expect(segments.cues[0]).toContain('"Caption files,\nmeet your converter."')
  })

  it('survives blank lines inside cue text for timed formats', () => {
    const tricky = [{ start: 0, end: 1000, text: 'Line one\n\nLine three' }, { start: 2000, end: 3000, text: 'Next' }]
    expect(splitOutput(serializeCaptions(tricky, 'srt'), 'srt', 2).cues).toHaveLength(2)
    expect(splitOutput(serializeCaptions(tricky, 'vtt'), 'vtt', 2).cues).toHaveLength(2)
  })

  it('falls back to an unmapped body when chunks cannot be determined', () => {
    const tricky = [{ start: 0, end: 1000, text: 'Line one\n\nLine three' }, { start: 2000, end: 3000, text: 'Next' }]
    const output = serializeCaptions(tricky, 'txt')
    const segments = splitOutput(output, 'txt', 2)
    expect(segments.cues).toEqual([])
    expect(segments.header).toBe(output.replace(/\n$/, ''))
  })

  it('handles an empty cue list', () => {
    expect(splitOutput('', 'srt', 0)).toEqual({ header: '', cues: [], footer: '' })
  })
})
