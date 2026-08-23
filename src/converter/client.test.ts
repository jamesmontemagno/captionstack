import { describe, expect, it } from 'vitest'
import { analyzeCuesAsync, isWorkerAvailable, loadCaptionsAsync, serializeCaptionsAsync } from './client'
import { toCues, toEditableCues } from './edit'
import { parseCaptions } from './parse'
import { analyzeCues } from './quality'
import { serializeCaptions } from './serialize'

const srt = `1
00:00:01,000 --> 00:00:03,000
Hello there.

2
00:00:04,000 --> 00:00:06,000
Second line.`

describe('conversion client without Web Workers', () => {
  it('falls back to the main thread when Worker is unavailable', () => {
    expect(typeof Worker).toBe('undefined')
    expect(isWorkerAvailable()).toBe(false)
  })

  it('loads text sources into editable cues matching the synchronous pipeline', async () => {
    const result = await loadCaptionsAsync({ content: srt, filename: 'captions.srt' })
    const expected = parseCaptions(srt, 'captions.srt')
    expect(result.format).toBe(expected.format)
    expect(result.cues.map(({ start, end, text }) => ({ start, end, text })))
      .toEqual(toEditableCues(expected.cues).map(({ start, end, text }) => ({ start, end, text })))
  })

  it('loads File sources by reading their text', async () => {
    const file = new File([srt], 'captions.srt', { type: 'text/plain' })
    const result = await loadCaptionsAsync(file)
    expect(result.format).toBe('srt')
    expect(result.cues).toHaveLength(2)
  })

  it('rejects with the parser error for unreadable input', async () => {
    await expect(loadCaptionsAsync({ content: '{not json', filename: 'bad.json' })).rejects.toThrow('not valid JSON')
  })

  it('serializes identically to serializeCaptions and reports the duration', async () => {
    const editable = toEditableCues(parseCaptions(srt, 'captions.srt').cues)
    const result = await serializeCaptionsAsync(editable, 'vtt')
    expect(result.output).toBe(serializeCaptions(toCues(editable), 'vtt'))
    expect(result.duration).toBe(6000)
  })

  it('rejects serialization when a timestamp is unparseable', async () => {
    const editable = toEditableCues(parseCaptions(srt, 'captions.srt').cues)
    editable[0] = { ...editable[0], start: 'nope' }
    await expect(serializeCaptionsAsync(editable, 'srt')).rejects.toThrow('Invalid timestamp')
  })

  it('analyzes identically to analyzeCues', async () => {
    const editable = toEditableCues(parseCaptions(srt, 'captions.srt').cues)
    await expect(analyzeCuesAsync(editable)).resolves.toEqual(analyzeCues(editable))
  })
})
