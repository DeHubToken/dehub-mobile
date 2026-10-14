type Atom = { type: string; body: number; end: number };

/** Read only the track header and handler; media payload is never decoded. */
export function mp4QuarterTurn(buffer: ArrayBuffer): boolean | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const typeAt = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const atoms = (start: number, end: number): Atom[] => {
    const result: Atom[] = [];
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end || view.getUint32(at + 8) !== 0) break;
        size = view.getUint32(at + 12);
        header = 16;
      }
      if (size === 0) size = end - at;
      if (size < header) break;
      result.push({ type: typeAt(at + 4), body: at + header, end: Math.min(end, at + size) });
      at += size;
    }
    return result;
  };
  const inspect = (moov: Atom): boolean | null => {
    for (const track of atoms(moov.body, moov.end).filter(atom => atom.type === 'trak')) {
      const children = atoms(track.body, track.end);
      const media = children.find(atom => atom.type === 'mdia');
      const handler = media && atoms(media.body, media.end).find(atom => atom.type === 'hdlr');
      if (!handler || handler.body + 12 > handler.end || typeAt(handler.body + 8) !== 'vide') continue;
      const header = children.find(atom => atom.type === 'tkhd');
      if (!header || header.body + 4 > header.end) continue;
      const version = bytes[header.body];
      if (version !== 0 && version !== 1) continue;
      const matrix = header.body + (version === 1 ? 52 : 40);
      if (matrix + 44 > header.end) continue;
      const a = view.getInt32(matrix), b = view.getInt32(matrix + 4);
      const c = view.getInt32(matrix + 12), d = view.getInt32(matrix + 16);
      if (!view.getUint32(matrix + 36) || !view.getUint32(matrix + 40)) continue;
      return a === 0 && d === 0 && b !== 0 && c !== 0;
    }
    return null;
  };
  const moov = atoms(0, bytes.length).find(atom => atom.type === 'moov');
  if (moov) return inspect(moov);
  // An unoptimized MP4 keeps moov after mdat. The suffix starts inside mdat,
  // so find a complete moov and validate its child track structure.
  for (let at = 0; at + 8 <= bytes.length; at++) {
    if (bytes[at + 4] !== 109 || bytes[at + 5] !== 111 || bytes[at + 6] !== 111 || bytes[at + 7] !== 118) continue;
    const size = view.getUint32(at);
    if (size < 8 || at + size > bytes.length) continue;
    const result = inspect({ type: 'moov', body: at + 8, end: at + size });
    if (result !== null) return result;
  }
  return null;
}

const rotations = new Map<string, Promise<boolean | null>>();

/** Native track sizes omit the MP4 display matrix. Probe only conflicting
 * poster/track orientations, once per source, with two bounded byte ranges. */
export function videoQuarterTurn(url: string): Promise<boolean | null> {
  const cached = rotations.get(url);
  if (cached) return cached;
  const request = (async () => {
    for (const range of ['bytes=0-65535', 'bytes=-131072']) {
      const response = await fetch(url, { headers: { Range: range } });
      if (response.status !== 206) return null;
      const result = mp4QuarterTurn(await response.arrayBuffer());
      if (result !== null) return result;
    }
    return null;
  })().catch(() => null);
  rotations.set(url, request);
  if (rotations.size > 500) rotations.delete(rotations.keys().next().value!);
  return request;
}
