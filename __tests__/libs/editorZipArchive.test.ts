import { TextEncoder, TextDecoder } from "util";
import { writeZipArchive, ZIP_DOWNLOAD_LIMIT, type ZipEntry } from "../../libs/editor/zipArchive";

async function zip(entries: ZipEntry[], signal?: AbortSignal) {
  const chunks: Uint8Array[] = [];
  await writeZipArchive(entries, data => { chunks.push(data.slice()); }, signal);
  const bytes = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
  let offset = 0; chunks.forEach(b => { bytes.set(b, offset); offset += b.length; });
  return bytes;
}
const entry = (name: string, text: string) => {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.length, read: async (offset: number, length: number) => bytes.slice(offset, offset + length) };
};
describe("clip download archive", () => {
  it("writes UTF-8 names, correct CRCs, data descriptors and central offsets", async () => {
    const bytes = await zip([entry("café.mp4", "123456789"), entry("clip-002.mp4", "second")]);
    const d = new DataView(bytes.buffer), end = bytes.length - 22;
    expect(d.getUint32(end, true)).toBe(0x06054b50); expect(d.getUint16(end + 10, true)).toBe(2);
    let central = d.getUint32(end + 16, true);
    for (const [name, content, crc] of [["café.mp4", "123456789", 0xcbf43926], ["clip-002.mp4", "second", undefined]] as const) {
      expect(d.getUint32(central, true)).toBe(0x02014b50);
      const local = d.getUint32(central + 42, true), nameLength = d.getUint16(central + 28, true), size = d.getUint32(central + 24, true);
      expect(new TextDecoder().decode(bytes.slice(central + 46, central + 46 + nameLength))).toBe(name);
      expect(d.getUint32(local, true)).toBe(0x04034b50); expect(d.getUint16(local + 6, true)).toBe(0x0808);
      const from = local + 30 + nameLength;
      expect(new TextDecoder().decode(bytes.slice(from, from + size))).toBe(content);
      expect(d.getUint32(from + size, true)).toBe(0x08074b50);
      expect(d.getUint32(from + size + 4, true)).toBe(d.getUint32(central + 16, true));
      if (crc != null) expect(d.getUint32(central + 16, true)).toBe(crc);
      central += 46 + nameLength;
    }
    expect(central).toBe(end);
  });
  it("reads large files in bounded chunks and rejects truncated sources", async () => {
    const lengths: number[] = [];
    await zip([{ name: "large.mp4", size: 1_600_000, read: async (_, length) => { lengths.push(length); return new Uint8Array(length); } }]);
    expect(lengths).toEqual([786432, 786432, 27136]);
    await expect(zip([{ name: "broken.mp4", size: 10, read: async () => new Uint8Array(9) }])).rejects.toThrow("Incomplete");
  });
  it("refuses duplicates, excessive sizes and cancellation", async () => {
    await expect(zip([entry("same", "one"), entry("same", "two")])).rejects.toThrow("Invalid");
    await expect(zip([{ name: "large", size: ZIP_DOWNLOAD_LIMIT, read: async () => new Uint8Array() }])).rejects.toThrow("512");
    const controller = new AbortController(); controller.abort();
    await expect(zip([entry("one", "data")], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
