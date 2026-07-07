import { describe, expect, it } from 'vitest'
import { formats, parseCaptions, parseTimestamp, serializeCaptions } from '.'

const expectedText = ['Hello, world!', 'A second caption.']

const samples = {
  srt: `1
00:00:01,000 --> 00:00:03,250
Hello, world!

2
00:00:04,000 --> 00:00:06,500
A second caption.`,
  vtt: `WEBVTT

intro
00:00:01.000 --> 00:00:03.250 align:start
Hello, world!

00:00:04.000 --> 00:00:06.500
A second caption.`,
  sbv: `0:00:01.000,0:00:03.250
Hello, world!

0:00:04.000,0:00:06.500
A second caption.`,
  lrc: `[00:01.00]Hello, world!
[00:04.00]A second caption.`,
  ttml: `<?xml version="1.0" encoding="UTF-8"?>
<tt:tt xmlns:tt="http://www.w3.org/ns/ttml">
  <tt:body><tt:div>
    <tt:p begin="1s" end="3.25s">Hello, world!</tt:p>
    <tt:p begin="00:00:04.000" end="00:00:06.500">A second caption.</tt:p>
  </tt:div></tt:body>
</tt:tt>`,
  json: JSON.stringify({
    cues: [
      { id: 'one', start: 1000, end: 3250, text: 'Hello, world!' },
      { id: 'two', start: 4000, end: 6500, text: 'A second caption.' },
    ],
  }),
  csv: `id,start,end,text
one,00:00:01.000,00:00:03.250,"Hello, world!"
two,00:00:04.000,00:00:06.500,A second caption.`,
  txt: `Hello, world!
A second caption.`,
} as const

describe('caption parsing', () => {
  it.each(Object.entries(samples))('parses %s captions', (format, content) => {
    const result = parseCaptions(content, `captions.${format}`)
    expect(result.format).toBe(format)
    expect(result.cues.map((cue) => cue.text)).toEqual(expectedText)
    expect(result.cues[0].start).toBe(format === 'txt' ? 0 : 1000)
  })

  it('supports clock and offset timestamps', () => {
    expect(parseTimestamp('01:02:03.500')).toBe(3723500)
    expect(parseTimestamp('2.5s')).toBe(2500)
    expect(parseTimestamp('250ms')).toBe(250)
  })

  it('reports files without caption cues', () => {
    expect(() => parseCaptions('WEBVTT\n\nNOTE no cues', 'empty.vtt')).toThrow(
      'No caption cues were found',
    )
  })
})

describe('caption serialization', () => {
  const cues = parseCaptions(samples.srt, 'captions.srt').cues

  it.each(formats.filter((format) => format.id !== 'txt'))(
    'writes parseable $name captions',
    (format) => {
      const output = serializeCaptions(cues, format.id)
      const parsed = parseCaptions(output, `captions${format.extension}`)
      expect(parsed.cues).toHaveLength(2)
      expect(parsed.cues.map((cue) => cue.text)).toEqual(expectedText)
    },
  )

  it('writes a timing-free transcript', () => {
    expect(serializeCaptions(cues, 'txt')).toBe('Hello, world!\n\nA second caption.\n')
  })
})
