/**
 * Find and blank the metadata a phone writes into an MP4/MOV: GPS location
 * (`©xyz`, `com.apple.quicktime.location.ISO6709`), make, model, software,
 * XMP. Same rule as the server (dehub-stream-backend
 * src/common/util/mp4-metadata-scrub.ts): every `udta` / `meta` box in the
 * movie and track headers, plus any top-level XMP `uuid` box, is renamed
 * `free` and zeroed. No box changes size, so audio and video are untouched.
 *
 * Works on ranges so a 50 MB video never has to sit in memory: only box
 * headers and the movie header (`moov`, usually well under a megabyte) are
 * read.
 */

export interface BlankRange {
  /** offset of the box itself (its type is at +4) */
  at: number;
  /** first byte to zero */
  from: number;
  /** end of the box (exclusive) */
  to: number;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf"]);
const STRIP = new Set(["udta", "meta"]);
const XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
const ISO_FIRST = new Set(["ftyp", "moov", "wide", "mdat", "free", "skip"]);
const MAX_MOOV = 64 * 1024 * 1024;

const typeAt = (b: Uint8Array, at: number): string =>
  String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number): number =>
  ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const hexAt = (b: Uint8Array, at: number, len: number): string => {
  let out = "";
  for (let i = 0; i < len; i++) out += b[at + i].toString(16).padStart(2, "0");
  return out;
};

function header(b: Uint8Array, at: number, limit: number): { size: number; type: string; headerLen: number } | null {
  if (at + 8 > b.length) return null;
  let size = u32(b, at);
  const type = typeAt(b, at + 4);
  let headerLen = 8;
  if (size === 1) {
    if (at + 16 > b.length) return null;
    size = u32(b, at + 8) * 2 ** 32 + u32(b, at + 12);
    headerLen = 16;
  } else if (size === 0) {
    size = limit - at;
  }
  if (size < headerLen) return null;
  return { size, type, headerLen };
}

/** Ranges inside an in-memory box body (children of moov/trak/...). */
function innerRanges(b: Uint8Array, from: number, to: number, base: number, depth: number, out: BlankRange[]): void {
  let at = from;
  while (at + 8 <= to) {
    const h = header(b, at, to);
    if (!h || at + h.size > to) return;
    const end = at + h.size;
    if (STRIP.has(h.type)) out.push({ at: base + at, from: base + at + h.headerLen, to: base + end });
    else if (CONTAINERS.has(h.type) && depth < 6) innerRanges(b, at + h.headerLen, end, base, depth + 1, out);
    at = end;
  }
}

/** Every range to blank in a file of `size` bytes read through `read`. */
export async function mp4MetadataRanges(
  read: (position: number, length: number) => Promise<Uint8Array>,
  size: number,
): Promise<BlankRange[]> {
  const out: BlankRange[] = [];
  try {
    let at = 0;
    for (let n = 0; at + 8 <= size && n < 10000; n++) {
      const head = await read(at, Math.min(32, size - at));
      const h = header(head, 0, size - at);
      if (!h || at + h.size > size) break;
      if (at === 0 && !ISO_FIRST.has(h.type)) return [];
      const end = at + h.size;
      if (STRIP.has(h.type) || (h.type === "uuid" && head.length >= h.headerLen + 16 && hexAt(head, h.headerLen, 16) === XMP_UUID)) {
        out.push({ at, from: at + h.headerLen, to: end });
      } else if (h.type === "moov" && h.size <= MAX_MOOV) {
        const moov = await read(at, h.size);
        innerRanges(moov, h.headerLen, moov.length, at, 1, out);
      }
      at = end;
    }
  } catch {
    return out;
  }
  return out;
}

const FREE = [0x66, 0x72, 0x65, 0x65];

/** Apply ranges to a piece of the file that starts at `offset`, in place. */
export function blankPiece(piece: Uint8Array, offset: number, ranges: BlankRange[]): void {
  const pieceEnd = offset + piece.length;
  for (const r of ranges) {
    if (r.to <= offset || r.at >= pieceEnd) continue;
    for (let i = 0; i < 4; i++) {
      const p = r.at + 4 + i - offset;
      if (p >= 0 && p < piece.length) piece[p] = FREE[i];
    }
    const z0 = Math.max(r.from, offset) - offset;
    const z1 = Math.min(r.to, pieceEnd) - offset;
    if (z1 > z0) piece.fill(0, z0, z1);
  }
}

/** Whole-buffer convenience: scrub in place, returns boxes blanked. */
export async function scrubMp4MetadataInPlace(b: Uint8Array): Promise<number> {
  const ranges = await mp4MetadataRanges(async (p, l) => b.subarray(p, p + l), b.length);
  blankPiece(b, 0, ranges);
  return ranges.length;
}
