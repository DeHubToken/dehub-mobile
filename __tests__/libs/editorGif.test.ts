import { GIF_RUNTIME, GIF_WORKER } from "../../libs/editor/gifRuntime";
import { gifFrameDelay, gifPlan } from "../../libs/editor/gif";

const createEncoder = new Function(GIF_RUNTIME + "; return createGifEncoder;")() as (w: number, h: number, limit?: number) => { frame: (data: Uint8ClampedArray, delay: number) => void; finish: () => ArrayBuffer };

/** Independent GIF block reader and variable-width LZW decoder. */
function readGif(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const word = (p: number) => bytes[p] + bytes[p + 1] * 256;
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
  const width = word(6), height = word(8), palette = bytes.slice(13, 13 + 768);
  let p = 13 + 768, delay = 0, transparent = -1, disposal = 0, loop = -1;
  const frames: { pixels: number[]; delay: number; transparent: number; disposal: number }[] = [];
  const blocks = () => { const data: number[] = []; while (bytes[p]) { const n = bytes[p++]; data.push(...bytes.slice(p, p + n)); p += n; } p++; return data; };
  while (bytes[p] !== 59) {
    const marker = bytes[p++];
    if (marker === 33) {
      const kind = bytes[p++];
      if (kind === 249) { expect(bytes[p++]).toBe(4); const packed = bytes[p++]; delay = word(p); p += 2; transparent = packed & 1 ? bytes[p] : -1; disposal = (packed >> 2) & 7; p += 2; }
      else if (kind === 255) { const n = bytes[p++]; expect(String.fromCharCode(...bytes.slice(p, p + n))).toBe("NETSCAPE2.0"); p += n; const data = blocks(); loop = data[1] + 256 * data[2]; }
      else blocks();
    } else {
      expect(marker).toBe(44); expect(word(p + 4)).toBe(width); expect(word(p + 6)).toBe(height); p += 9;
      const min = bytes[p++], compressed = blocks(), clear = 1 << min, end = clear + 1;
      let bit = 0, bits = min + 1, next = end + 1, previous: number[] | undefined, table: number[][] = [];
      const reset = () => { table = Array.from({ length: clear }, (_, n) => [n]); bits = min + 1; next = end + 1; previous = undefined; };
      reset(); const pixels: number[] = [];
      while (bit + bits <= compressed.length * 8) {
        let code = 0;
        for (let i = 0; i < bits; i++, bit++) code |= ((compressed[bit >> 3] >> (bit & 7)) & 1) << i;
        if (code === clear) { reset(); continue; }
        if (code === end) break;
        const entry = table[code] ?? (code === next && previous ? previous.concat(previous[0]) : undefined);
        if (!entry) throw new Error("invalid LZW code");
        pixels.push(...entry);
        if (previous) { table[next++] = previous.concat(entry[0]); if (next === (1 << bits) && bits < 12) bits++; }
        previous = entry;
      }
      expect(pixels).toHaveLength(width * height); frames.push({ pixels, delay, transparent, disposal });
    }
    if (p >= bytes.length) throw new Error("missing trailer");
  }
  expect(p).toBe(bytes.length - 1);
  return { width, height, palette, frames, loop };
}

describe("animated GIF download", () => {
  it("retains aspect ratio, caps output, and uses cumulative hundredths without timing drift", () => {
    const plan = gifPlan(1920, 1080, 1, 12.2, 30);
    expect(plan).toMatchObject({ width: 640, height: 360, fps: 15, frames: 183 });
    expect(Array.from({ length: plan.frames }, (_, i) => gifFrameDelay(i, plan)).reduce((a, b) => a + b, 0)).toBe(1220);
    expect(gifPlan(1080, 1920, 1, 12.2, 10)).toMatchObject({ width: 360, height: 640, fps: 10 });
    expect(gifPlan(320, 180, 0.5, 12.2, 30).width).toBe(160);
    for (const args of [[0, 100, 1, 1, 30], [100, 100, 0, 1, 30], [100, 100, 1, 63, 30], [100, 100, 1, 1, NaN]]) expect(() => gifPlan(...args as [number, number, number, number, number])).toThrow();
  });
  it("decodes two frames, their exact delays, loop flag and transparent disposal", () => {
    const encoder = createEncoder(2, 1);
    encoder.frame(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]), 7);
    encoder.frame(new Uint8ClampedArray([0, 255, 0, 255, 255, 255, 255, 255]), 6);
    const gif = readGif(encoder.finish());
    expect(gif.loop).toBe(0);
    expect(gif.frames.map(f => f.delay)).toEqual([7, 6]);
    expect(gif.frames.every(f => f.transparent === 255 && f.disposal === 2)).toBe(true);
    expect(gif.frames[0].pixels[1]).toBe(255);
    const colour = (index: number) => Array.from(gif.palette.slice(index * 3, index * 3 + 3));
    expect(colour(gif.frames[0].pixels[0])).toEqual([255, 0, 0]);
    expect(colour(gif.frames[1].pixels[0])).toEqual([0, 255, 0]);
    expect(colour(gif.frames[1].pixels[1])).toEqual([255, 255, 255]);
  });
  it("survives repeated LZW dictionary resets and compresses flat frames", () => {
    const data = new Uint8ClampedArray(320 * 240 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = (i * 13) & 255; data[i + 1] = (i * 47) & 255; data[i + 2] = (i * 7) & 255; data[i + 3] = 255; }
    const mixed = createEncoder(320, 240); mixed.frame(data, 10);
    const decoded = readGif(mixed.finish()).frames[0].pixels;
    expect(decoded.every(i => i < 255)).toBe(true);
    const flat = createEncoder(320, 240); data.fill(255); flat.frame(data, 10);
    expect(flat.finish().byteLength).toBeLessThan(2000);
  });
  it("rejects malformed frames, empty files and the size ceiling", () => {
    expect(() => createEncoder(641, 1)).toThrow();
    const encoder = createEncoder(1, 1); expect(() => encoder.finish()).toThrow();
    expect(() => encoder.frame(new Uint8ClampedArray(3), 10)).toThrow();
    expect(() => encoder.frame(new Uint8ClampedArray(4), 0)).toThrow();
    expect(() => createEncoder(1, 1, 20)).toThrow();
    encoder.frame(new Uint8ClampedArray(4), 10); encoder.finish(); expect(() => encoder.finish()).toThrow();
  });
  it("runs the actual worker protocol and transfers the final GIF", () => {
    const messages: { type: string; buffer?: ArrayBuffer }[] = [];
    const self: { onmessage?: (e: { data: unknown }) => void; postMessage: (m: { type: string; buffer?: ArrayBuffer }) => void } = { postMessage: m => messages.push(m) };
    new Function("self", GIF_WORKER)(self);
    self.onmessage!({ data: { type: "init", width: 1, height: 1 } });
    self.onmessage!({ data: { type: "frame", buffer: new Uint8ClampedArray([255, 0, 0, 255]).buffer, delay: 10 } });
    self.onmessage!({ data: { type: "finish" } });
    expect(messages.map(m => m.type)).toEqual(["ready", "ready", "done"]);
    expect(readGif(messages[2].buffer!).frames).toHaveLength(1);
    self.onmessage!({ data: { type: "finish" } }); expect(messages.at(-1)?.type).toBe("error");
  });
});

import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
it("injects a complete GIF renderer into the native page", () => {
  expect(EDITOR_CANVAS_HTML).not.toContain("__GIF_RUNTIME__");
  const script = EDITOR_CANVAS_HTML.slice(EDITOR_CANVAS_HTML.indexOf("<script>") + 8, EDITOR_CANVAS_HTML.lastIndexOf("</script>"));
  expect(() => new Function(script)).not.toThrow();
});
