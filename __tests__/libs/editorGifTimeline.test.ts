import { createHash } from "node:crypto";
import { GIF_TIMELINE_RUNTIME } from "../../libs/editor/gifTimelineRuntime";
import fixtureData from "./fixtures/gifTimeline.json";

type Timeline = { width: number; height: number; duration: number; frameCount: number; repeats: number; indexAt: (seconds: number) => number; frameAt: (seconds: number) => Uint8ClampedArray };
const decode = new Function(GIF_TIMELINE_RUNTIME + "; return createGifTimeline;")() as (bytes: Uint8Array) => Timeline;
const bytesOf = (data: string) => new Uint8Array(Buffer.from(data, "base64"));
function digest(pixels: Uint8ClampedArray): string {
  const copy = pixels.slice();
  for (let i = 0; i < copy.length; i += 4) if (!copy[i + 3]) copy.fill(0, i, i + 3);
  return createHash("sha256").update(copy).digest("hex");
}

describe("GIF source frames at timeline time", () => {
  for (const fixture of fixtureData.fixtures) {
    it(`matches independently decoded ${fixture.name} frames when seeking forwards and backwards`, () => {
      const timeline = decode(bytesOf(fixture.base64));
      const delays = fixture.delays.map(delay => delay < 0.02 ? 0.1 : delay);
      expect(timeline).toMatchObject({ width: fixture.width, height: fixture.height, frameCount: fixture.frames.length, repeats: fixture.repeats });
      expect(timeline.duration).toBeCloseTo(delays.reduce((a, b) => a + b, 0), 8);
      let start = 0;
      const samples = delays.map((delay, index) => { const sample = { time: start + delay / 2, index }; start += delay; return sample; });
      for (const sample of [...samples, ...samples.slice().reverse(), ...samples]) {
        expect(timeline.indexAt(sample.time)).toBe(sample.index);
        expect(digest(timeline.frameAt(sample.time))).toBe(fixture.frames[sample.index]);
      }
      const final = fixture.frames.length - 1;
      if (fixture.repeats === 0) {
        expect(timeline.indexAt(timeline.duration + samples[0].time)).toBe(0);
        expect(digest(timeline.frameAt(timeline.duration * 10 + samples[0].time))).toBe(fixture.frames[0]);
      } else {
        if (fixture.repeats > 0) expect(timeline.indexAt(timeline.duration + samples[0].time)).toBe(0);
        expect(timeline.indexAt(timeline.duration * (fixture.repeats < 0 ? 1 : fixture.repeats + 1))).toBe(final);
        expect(digest(timeline.frameAt(timeline.duration * 100))).toBe(fixture.frames[final]);
      }
    });
  }

  it("changes frames on their exact source-time boundary and ignores wall time", () => {
    const timeline = decode(bytesOf(fixtureData.fixtures[0].base64));
    expect(timeline.indexAt(0.119)).toBe(0);
    expect(timeline.indexAt(0.12)).toBe(1);
    expect(timeline.indexAt(0.29)).toBe(2);
    const before = digest(timeline.frameAt(0.13));
    timeline.frameAt(0.7);
    expect(digest(timeline.frameAt(0.13))).toBe(before);
    expect(timeline.indexAt(-1)).toBe(0);
    expect(timeline.indexAt(NaN)).toBe(0);
  });

  it("rejects incomplete data and excessive dimensions before allocating a frame", () => {
    const original = bytesOf(fixtureData.fixtures[0].base64);
    for (const length of [0, 6, 13, original.length - 1]) expect(() => decode(original.slice(0, length))).toThrow();
    const oversized = original.slice(); oversized[6] = 255; oversized[7] = 255; oversized[8] = 255; oversized[9] = 255;
    expect(() => decode(oversized)).toThrow("dimensions too large");
    const wrongHeader = original.slice(); wrongHeader[0] = 0;
    expect(() => decode(wrongHeader)).toThrow("header");
  });
});
