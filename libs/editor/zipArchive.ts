/** Stored ZIP entries stream in bounded chunks, with CRCs in data descriptors. */
export interface ZipEntry { name: string; size: number; read: (offset: number, length: number) => Promise<Uint8Array> }
export const ZIP_DOWNLOAD_LIMIT = 512 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const letter of text) {
    let code = letter.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 128) bytes.push(code);
    else if (code < 2048) bytes.push(192 | (code >> 6), 128 | (code & 63));
    else if (code < 65536) bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
    else bytes.push(240 | (code >> 18), 128 | ((code >> 12) & 63), 128 | ((code >> 6) & 63), 128 | (code & 63));
  }
  return new Uint8Array(bytes);
}
export async function writeZipArchive(entries: ZipEntry[], write: (bytes: Uint8Array) => void | Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!entries.length || entries.length > 65535 || new Set(entries.map(e => e.name)).size !== entries.length) throw new Error("Invalid ZIP entries");
  const names = entries.map(e => utf8(e.name));
  const estimated = entries.reduce((sum, e, i) => sum + e.size + 92 + 2 * names[i].length, 22);
  if (entries.some((e, i) => !Number.isSafeInteger(e.size) || e.size < 0 || names[i].length > 65535) || estimated > ZIP_DOWNLOAD_LIMIT) throw new Error("Download archive exceeds 512 MiB");
  const abort = () => { if (signal?.aborted) { const error = new Error("Download cancelled"); error.name = "AbortError"; throw error; } };
  const central: Uint8Array[] = []; let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    abort(); const entry = entries[i], name = names[i], start = offset;
    const header = new Uint8Array(30), local = new DataView(header.buffer);
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0808, true); local.setUint16(12, 33, true); local.setUint16(26, name.length, true);
    await write(header); await write(name); offset += header.length + name.length;
    let crc = 0xffffffff;
    for (let position = 0; position < entry.size;) {
      abort(); const length = Math.min(768 * 1024, entry.size - position);
      const bytes = await entry.read(position, length);
      if (bytes.length !== length) throw new Error("Incomplete ZIP source");
      for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
      abort(); await write(bytes); position += length; offset += length;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = new Uint8Array(16), d = new DataView(descriptor.buffer);
    d.setUint32(0, 0x08074b50, true); d.setUint32(4, crc, true); d.setUint32(8, entry.size, true); d.setUint32(12, entry.size, true);
    await write(descriptor); offset += 16;
    const record = new Uint8Array(46 + name.length), c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0808, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, entry.size, true); c.setUint32(24, entry.size, true); c.setUint16(28, name.length, true); c.setUint32(42, start, true);
    record.set(name, 46); central.push(record);
  }
  abort(); const centralStart = offset;
  for (const record of central) { await write(record); offset += record.length; }
  const end = new Uint8Array(22), d = new DataView(end.buffer);
  d.setUint32(0, 0x06054b50, true); d.setUint16(8, entries.length, true); d.setUint16(10, entries.length, true); d.setUint32(12, offset - centralStart, true); d.setUint32(16, centralStart, true);
  abort(); await write(end);
}
