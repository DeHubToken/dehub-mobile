import { mp4QuarterTurn, videoQuarterTurn } from '../../libs/video-display-aspect';

function atom(type: string, ...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(8 + parts.reduce((size, part) => size + part.length, 0));
  new DataView(result.buffer).setUint32(0, result.length);
  result.set(Array.from(type, char => char.charCodeAt(0)), 4);
  let offset = 8;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function track(rotated: boolean, version = 0, handler = 'vide'): Uint8Array {
  const matrix = version === 1 ? 52 : 40;
  const payload = new Uint8Array(matrix + 44);
  payload[0] = version;
  const data = new DataView(payload.buffer);
  data.setInt32(matrix, rotated ? 0 : 65536);
  data.setInt32(matrix + 4, rotated ? 65536 : 0);
  data.setInt32(matrix + 12, rotated ? -65536 : 0);
  data.setInt32(matrix + 16, rotated ? 0 : 65536);
  data.setUint32(matrix + 36, 1280 * 65536);
  data.setUint32(matrix + 40, 720 * 65536);
  const mediaHandler = new Uint8Array(12);
  mediaHandler.set(Array.from(handler, char => char.charCodeAt(0)), 8);
  return atom('trak', atom('tkhd', payload), atom('mdia', atom('hdlr', mediaHandler)));
}

afterEach(() => jest.restoreAllMocks());

describe('MP4 display orientation', () => {
  it.each([0, 1])('reads the quarter-turn display matrix in version %s track headers', version => {
    const file = atom('moov', track(true, version));
    expect(mp4QuarterTurn(file.buffer as ArrayBuffer)).toBe(true);
  });

  it('keeps an unrotated landscape clip landscape even with a portrait cover', () => {
    expect(mp4QuarterTurn(atom('moov', track(false)).buffer as ArrayBuffer)).toBe(false);
  });

  it('ignores audio matrices and finds the video track', () => {
    expect(mp4QuarterTurn(atom('moov', track(false, 0, 'soun'), track(true)).buffer as ArrayBuffer)).toBe(true);
  });

  it('finds metadata in a suffix beginning inside media payload', () => {
    const moov = atom('moov', track(true));
    const suffix = new Uint8Array(25 + moov.length);
    suffix.set(moov, 25);
    expect(mp4QuarterTurn(suffix.buffer)).toBe(true);
  });

  it('returns unknown for missing or truncated metadata', () => {
    expect(mp4QuarterTurn(new ArrayBuffer(4))).toBeNull();
    const file = atom('moov', track(true));
    expect(mp4QuarterTurn(file.buffer.slice(0, 20))).toBeNull();
  });

  it('deduplicates a bounded header request for the same clip', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 206, arrayBuffer: async () => atom('moov', track(true)).buffer,
    } as Response);
    const values = await Promise.all([videoQuarterTurn('clip-rotated'), videoQuarterTurn('clip-rotated')]);
    expect(values).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('clip-rotated', { headers: { Range: 'bytes=0-65535' } });
  });

  it('checks one bounded suffix when the header has no track metadata', async () => {
    const fetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ status: 206, arrayBuffer: async () => new ArrayBuffer(0) } as Response)
      .mockResolvedValueOnce({ status: 206, arrayBuffer: async () => atom('moov', track(true)).buffer } as Response);
    await expect(videoQuarterTurn('clip-suffix')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('clip-suffix', { headers: { Range: 'bytes=-131072' } });
  });
});
