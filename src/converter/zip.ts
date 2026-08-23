/**
 * Minimal ZIP archive writer (STORE method, no compression) so batch downloads need no
 * dependencies and never leave the browser. Filenames are written as UTF-8 (general purpose
 * flag bit 11) and deduplicated so every entry extracts cleanly on every platform.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array | string
  /** Defaults to now. Exposed so tests can produce byte-stable archives. */
  modified?: Date
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** Appends " (2)", " (3)", … before the extension when a name repeats. */
export function uniqueZipNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  const used = new Set<string>()
  return names.map((name) => {
    let candidate = name
    let count = seen.get(name.toLowerCase()) ?? 0
    while (used.has(candidate.toLowerCase())) {
      count += 1
      const dot = name.lastIndexOf('.')
      candidate = dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`
    }
    seen.set(name.toLowerCase(), count)
    used.add(candidate.toLowerCase())
    return candidate
  })
}

class ByteWriter {
  private chunks: Uint8Array[] = []
  length = 0

  push(bytes: Uint8Array) {
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  u16(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]))
  }

  u32(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]))
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(new ArrayBuffer(this.length))
    let offset = 0
    for (const chunk of this.chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }
}

export function createZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const names = uniqueZipNames(entries.map((entry) => entry.name))
  const writer = new ByteWriter()
  const central = new ByteWriter()

  entries.forEach((entry, index) => {
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const name = encoder.encode(names[index])
    const checksum = crc32(data)
    const stamp = dosDateTime(entry.modified ?? new Date())
    const offset = writer.length

    // Local file header
    writer.u32(0x04034b50)
    writer.u16(20) // version needed: 2.0
    writer.u16(0x0800) // UTF-8 names
    writer.u16(0) // STORE
    writer.u16(stamp.time)
    writer.u16(stamp.date)
    writer.u32(checksum)
    writer.u32(data.length)
    writer.u32(data.length)
    writer.u16(name.length)
    writer.u16(0)
    writer.push(name)
    writer.push(data)

    // Central directory header
    central.u32(0x02014b50)
    central.u16(20) // version made by
    central.u16(20)
    central.u16(0x0800)
    central.u16(0)
    central.u16(stamp.time)
    central.u16(stamp.date)
    central.u32(checksum)
    central.u32(data.length)
    central.u32(data.length)
    central.u16(name.length)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u32(0)
    central.u32(offset)
    central.push(name)
  })

  const centralOffset = writer.length
  const centralBytes = central.toUint8Array()
  writer.push(centralBytes)

  // End of central directory
  writer.u32(0x06054b50)
  writer.u16(0)
  writer.u16(0)
  writer.u16(entries.length)
  writer.u16(entries.length)
  writer.u32(centralBytes.length)
  writer.u32(centralOffset)
  writer.u16(0)

  return writer.toUint8Array()
}
