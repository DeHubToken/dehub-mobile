// Mirrors dehubweb's src/lib/dm-e2ee/__tests__/media.test.ts. The pinned
// vector is the wire contract between the two apps: an attachment sealed on
// web must open on mobile and vice versa.
let mockFixedRandom: ((n: number) => Uint8Array) | null = null;
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) =>
    mockFixedRandom ? mockFixedRandom(n) : new Uint8Array(require("crypto").randomBytes(n)),
}));

import { createHash } from "crypto";
import {
  CHUNK_BYTES,
  decodeMediaDescriptor,
  decryptMediaBytes,
  encodeMediaDescriptor,
  encryptedSize,
  encryptMediaBytes,
  fileKeyOf,
  fileKeyToString,
  isMediaDescriptor,
  newFileKey,
} from "../../libs/dm-e2ee/media";

const pattern = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7) & 0xff;
  return out;
};

afterEach(() => {
  mockFixedRandom = null;
});

describe("dm-e2ee media", () => {
  it.each([0, 1, 65536, 70000, 200000])("round-trips %i bytes", (n) => {
    const key = newFileKey();
    const plain = pattern(n);
    const blob = encryptMediaBytes(plain, key);
    expect(blob.length).toBe(encryptedSize(n));
    expect(Buffer.from(decryptMediaBytes(blob, key)).equals(Buffer.from(plain))).toBe(true);
  });

  it("rejects a wrong key", () => {
    const blob = encryptMediaBytes(pattern(1000), newFileKey());
    expect(() => decryptMediaBytes(blob, newFileKey())).toThrow();
  });

  it("rejects a tampered blob", () => {
    const key = newFileKey();
    const blob = encryptMediaBytes(pattern(70000), key);
    blob[blob.length - 100] ^= 1;
    expect(() => decryptMediaBytes(blob, key)).toThrow();
  });

  it("rejects a blob truncated at a chunk boundary", () => {
    const key = newFileKey();
    const blob = encryptMediaBytes(pattern(200000), key);
    // header (20) + two whole sealed chunks: drops the last chunk entirely.
    const cut = blob.subarray(0, 20 + 2 * (CHUNK_BYTES + 16));
    expect(() => decryptMediaBytes(cut, key)).toThrow();
  });

  it("matches the cross-platform vector", () => {
    mockFixedRandom = (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = 0xa0 + i;
      return out;
    };
    const key = new Uint8Array(32).map((_, i) => i + 1);
    const blob = encryptMediaBytes(pattern(70000), key);
    expect(blob.length).toBe(70052);
    expect(createHash("sha256").update(blob).digest("hex")).toBe(
      "fac5c478d44e406c5debbd3d67b3283786fe9f25cc01c7f36957f92b5527aa4f",
    );
    mockFixedRandom = null;
    expect(Buffer.from(decryptMediaBytes(blob, key)).equals(Buffer.from(pattern(70000)))).toBe(true);
  });

  it("encodes and decodes descriptors, rejecting malformed ones", () => {
    const key = newFileKey();
    const text = encodeMediaDescriptor({ k: fileKeyToString(key), kind: "image", mime: "image/jpeg", size: 3, caption: "hi" });
    expect(isMediaDescriptor(text)).toBe(true);
    const d = decodeMediaDescriptor(text)!;
    expect(d.caption).toBe("hi");
    expect(Buffer.from(fileKeyOf(d)).equals(Buffer.from(key))).toBe(true);
    expect(decodeMediaDescriptor("hello")).toBeNull();
    expect(decodeMediaDescriptor("dm-media:1:{bad")).toBeNull();
    expect(decodeMediaDescriptor('dm-media:1:{"k":"AAAA","kind":"image"}')).toBeNull();
  });
});
