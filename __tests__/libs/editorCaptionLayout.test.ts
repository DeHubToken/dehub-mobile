
import { captionLayers, groupWords } from "../../libs/editor/captionLayout";
import type { MediaClip } from "../../libs/editor/types";

describe("caption timing", () => {
  const source: MediaClip = { id: "v", trackId: "t", kind: "video", mediaId: "m", trimIn: 8, start: 4, duration: 2, speed: 2 };
  it("keeps short, speed-adjusted captions inside the source clip", () => {
    let seq = 0;
    const result = captionLayers(source, [
      { text: "One.", start: 0, end: 0.2 }, { text: "Two.", start: 0.25, end: 0.4 },
      { text: "Last.", start: 3.8, end: 4.2 }, { text: "Outside.", start: 4.3, end: 5 },
    ], () => String(seq++), "boxed");
    expect(result.clips).toHaveLength(3);
    expect(result.clips[0].duration).toBeCloseTo(0.125);
    expect(result.clips[2].start + result.clips[2].duration).toBe(6);
    expect(result.clips[0].background?.opacity).toBe(0.75);
    expect(result.clips[0].trackId).toBe(result.track.id);
  });
  it("breaks at pauses and sentence endings and ignores invalid words", () => {
    expect(groupWords([{ text: "Hello", start: 0, end: 0.3 }, { text: "world!", start: 0.4, end: 0.7 }, { text: "Again", start: 2, end: 2.3 }, { text: "bad", start: NaN, end: 3 }]).map(x => x.text)).toEqual(["Hello world!", "Again"]);
  });
});
