// The streamed (piece-by-piece) seal and open in media-files.ts must produce
// and accept exactly the bytes of the one-shot functions in media.ts, which
// are what web reads and writes.
let mockRandom: ((n: number) => Uint8Array) | null = null;
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) =>
    mockRandom ? mockRandom(n) : new Uint8Array(require("crypto").randomBytes(n)),
}));

const mockFiles = new Map<string, Buffer>();
const mockRemote = new Map<string, Buffer>();
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  getInfoAsync: async (uri: string) => {
    const f = mockFiles.get(uri);
    if (f) return { exists: true, isDirectory: false, size: f.length, uri };
    const dir = [...mockFiles.keys()].some((k) => k.startsWith(uri.endsWith("/") ? uri : uri + "/"));
    return dir ? { exists: true, isDirectory: true, uri } : { exists: false, isDirectory: false, uri };
  },
  makeDirectoryAsync: async () => {},
  readAsStringAsync: async (uri: string, opts: { position?: number; length?: number }) => {
    const f = mockFiles.get(uri);
    if (!f) throw new Error("missing " + uri);
    const part = opts?.length != null ? f.subarray(opts.position ?? 0, (opts.position ?? 0) + opts.length) : f;
    return Buffer.from(part).toString("base64");
  },
  writeAsStringAsync: async (uri: string, b64: string, opts: { append?: boolean }) => {
    const data = Buffer.from(b64, "base64");
    const prev = opts?.append ? mockFiles.get(uri) : undefined;
    mockFiles.set(uri, prev ? Buffer.concat([prev, data]) : data);
  },
  deleteAsync: async (uri: string) => {
    for (const k of [...mockFiles.keys()]) if (k === uri || k.startsWith(uri)) mockFiles.delete(k);
  },
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    const f = mockFiles.get(from);
    if (!f) throw new Error("missing " + from);
    mockFiles.set(to, Buffer.from(f));
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const f = mockFiles.get(from);
    if (!f) throw new Error("missing " + from);
    mockFiles.set(to, f);
    mockFiles.delete(from);
  },
  createDownloadResumable: (url: string, dst: string, _o: unknown, cb?: (p: any) => void) => ({
    downloadAsync: async () => {
      const body = mockRemote.get(url);
      if (!body) return { status: 404, uri: dst };
      mockFiles.set(dst, Buffer.from(body));
      cb?.({ totalBytesWritten: body.length, totalBytesExpectedToWrite: body.length });
      return { status: 200, uri: dst };
    },
  }),
}));
jest.mock("../../libs/misc", () => ({ buildCdnPath: (p: string) => `https://cdn.example/${p}` }));

import {
  decryptMediaBytes,
  encryptMediaBytes,
  fileKeyToString,
  newFileKey,
  type MediaDescriptor,
} from "../../libs/dm-e2ee/media";
import {
  cachedPlaintext,
  clearDecryptedMediaCache,
  encryptFileToCache,
  encryptedMediaUrl,
  openEncryptedMedia,
  plaintextFileName,
  rememberLocalPlaintext,
} from "../../libs/dm-e2ee/media-files";
import { splitOpenedContent } from "../../libs/dm-e2ee/keys";

const pattern = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7) & 0xff;
  return out;
};
const fixedPrefix = (n: number) => new Uint8Array(n).map((_, i) => 0xa0 + i);

beforeEach(() => {
  mockFiles.clear();
  mockRemote.clear();
  mockRandom = null;
});

describe("dm-e2ee media files", () => {
  it.each([0, 1, 65536, 70000, 1_200_000])("streams the same ciphertext as the one-shot seal (%i bytes)", async (n) => {
    const key = newFileKey();
    const plain = pattern(n);
    mockFiles.set("file:///pick/a.jpg", Buffer.from(plain));
    mockRandom = fixedPrefix;
    const out = await encryptFileToCache("file:///pick/a.jpg", key);
    const expected = encryptMediaBytes(plain, key);
    mockRandom = null;
    expect(out.plainSize).toBe(n);
    expect(out.size).toBe(expected.length);
    expect(Buffer.from(mockFiles.get(out.uri)!).equals(Buffer.from(expected))).toBe(true);
    expect(Buffer.from(decryptMediaBytes(new Uint8Array(mockFiles.get(out.uri)!), key)).equals(Buffer.from(plain))).toBe(true);
  });

  it("downloads, opens and caches an attachment, and reuses the cache", async () => {
    const key = newFileKey();
    const plain = pattern(1_100_000);
    const url = "https://cdn.example/dm/images/x.bin";
    mockRemote.set(url, Buffer.from(encryptMediaBytes(plain, key)));
    const d: MediaDescriptor = { k: fileKeyToString(key), kind: "image", mime: "image/jpeg", size: plain.length };
    const seen: number[] = [];
    const file = await openEncryptedMedia({ url, descriptor: d, onProgress: (p) => seen.push(p) });
    expect(file.endsWith("/media.jpg")).toBe(true);
    expect(Buffer.from(mockFiles.get(file)!).equals(Buffer.from(plain))).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
    expect([...mockFiles.keys()].some((k) => k.endsWith(".part") || k.endsWith(".tmp"))).toBe(false);
    mockRemote.clear();
    expect(await cachedPlaintext(url, d)).toBe(file);
    expect(await openEncryptedMedia({ url, descriptor: d })).toBe(file);
    await clearDecryptedMediaCache();
    expect(await cachedPlaintext(url, d)).toBeNull();
  });

  it("refuses a wrong key or a truncated download and leaves nothing behind", async () => {
    const key = newFileKey();
    const url = "https://cdn.example/dm/files/y.bin";
    const blob = encryptMediaBytes(pattern(200_000), key);
    mockRemote.set(url, Buffer.from(blob.subarray(0, 20 + 2 * 65552)));
    const d: MediaDescriptor = { k: fileKeyToString(key), kind: "file", mime: "application/pdf", size: 200_000, name: "a/b.pdf" };
    await expect(openEncryptedMedia({ url, descriptor: d })).rejects.toThrow();
    mockRemote.set(url, Buffer.from(blob));
    await expect(openEncryptedMedia({ url, descriptor: { ...d, k: fileKeyToString(newFileKey()) } })).rejects.toThrow();
    expect(mockFiles.size).toBe(0);
    expect(plaintextFileName(d)).toBe("a_b.pdf");
  });

  it("uses the sender's own copy instead of downloading", async () => {
    const key = newFileKey();
    mockFiles.set("file:///pick/v.mp4", Buffer.from(pattern(10)));
    rememberLocalPlaintext("m1", "file:///pick/v.mp4");
    const d: MediaDescriptor = { k: fileKeyToString(key), kind: "video", mime: "video/mp4", size: 10 };
    const file = await openEncryptedMedia({ url: "https://cdn.example/v.bin", descriptor: d, messageId: "m1" });
    expect(Buffer.from(mockFiles.get(file)!).equals(Buffer.from(pattern(10)))).toBe(true);
  });

  it("resolves raw CDN paths, not the resizer", () => {
    expect(encryptedMediaUrl("dm/images/a.bin")).toBe("https://cdn.example/dm/images/a.bin");
    expect(encryptedMediaUrl("https://x/y.bin")).toBe("https://x/y.bin");
    expect(encryptedMediaUrl(undefined)).toBeNull();
  });

  it("never lets a descriptor reach message content", () => {
    const k = fileKeyToString(newFileKey());
    expect(splitOpenedContent("hello")).toEqual({ content: "hello" });
    const opened = splitOpenedContent(`dm-media:1:${JSON.stringify({ k, kind: "image", mime: "image/jpeg", size: 1, caption: "hi" })}`);
    expect(opened.content).toBe("hi");
    expect(opened.encMedia?.kind).toBe("image");
    expect(splitOpenedContent("dm-media:1:{oops")).toEqual({ content: "", broken: true });
  });
});
