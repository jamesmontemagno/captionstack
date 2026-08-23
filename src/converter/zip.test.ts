import { describe, expect, it } from 'vitest'
import { crc32, createZip, uniqueZipNames } from './zip'

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/** Walks the central directory the way an extractor would and returns each entry's name + bytes. */
function readZip(bytes: Uint8Array): Array<{ name: string; data: string; crc: number }> {
  const decoder = new TextDecoder()
  const eocd = bytes.length - 22
  expect(readU32(bytes, eocd)).toBe(0x06054b50)
  const count = readU16(bytes, eocd + 10)
  let offset = readU32(bytes, eocd + 16)
  const entries = []
  for (let index = 0; index < count; index += 1) {
    expect(readU32(bytes, offset)).toBe(0x02014b50)
    const crc = readU32(bytes, offset + 16)
    const size = readU32(bytes, offset + 24)
    const nameLength = readU16(bytes, offset + 28)
    const localOffset = readU32(bytes, offset + 42)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    expect(readU32(bytes, localOffset)).toBe(0x04034b50)
    const localNameLength = readU16(bytes, localOffset + 26)
    const dataStart = localOffset + 30 + localNameLength
    entries.push({ name, crc, data: decoder.decode(bytes.subarray(dataStart, dataStart + size)) })
    offset += 46 + nameLength
  }
  return entries
}

describe('crc32', () => {
  it('matches the well-known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('is zero-length safe', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('uniqueZipNames', () => {
  it('suffixes duplicates before the extension, case-insensitively', () => {
    expect(uniqueZipNames(['a.srt', 'A.srt', 'a.srt', 'b', 'b'])).toEqual(['a.srt', 'A (1).srt', 'a (2).srt', 'b', 'b (1)'])
  })

  it('avoids colliding with an existing suffixed name', () => {
    expect(uniqueZipNames(['a (1).srt', 'a.srt', 'a.srt'])).toEqual(['a (1).srt', 'a.srt', 'a (2).srt'])
  })
})

describe('createZip', () => {
  it('writes a STORE archive that round-trips names, bytes, and checksums', () => {
    const modified = new Date(2026, 0, 2, 3, 4, 6)
    const zip = createZip([
      { name: 'one.srt', data: 'Hello\nworld', modified },
      { name: 'nested/two.vtt', data: new TextEncoder().encode('WEBVTT\n'), modified },
      { name: 'ünïcödé.txt', data: 'ok', modified },
    ])
    const entries = readZip(zip)
    expect(entries.map((entry) => entry.name)).toEqual(['one.srt', 'nested/two.vtt', 'ünïcödé.txt'])
    expect(entries.map((entry) => entry.data)).toEqual(['Hello\nworld', 'WEBVTT\n', 'ok'])
    expect(entries[0].crc).toBe(crc32(new TextEncoder().encode('Hello\nworld')))
    // UTF-8 flag set on the first local header.
    expect(readU16(zip, 6)).toBe(0x0800)
  })

  it('is deterministic for a fixed timestamp', () => {
    const modified = new Date(2026, 5, 6, 7, 8, 10)
    const a = createZip([{ name: 'x.txt', data: 'x', modified }])
    const b = createZip([{ name: 'x.txt', data: 'x', modified }])
    expect(a).toEqual(b)
  })

  it('produces an empty-but-valid archive for no entries', () => {
    const zip = createZip([])
    expect(zip.length).toBe(22)
    expect(readZip(zip)).toEqual([])
  })
})
