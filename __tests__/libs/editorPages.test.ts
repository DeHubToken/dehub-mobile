import { appendPage, removePage, timelineDuration } from "../../libs/editor/pages";
import { DEFAULT_SETTINGS, type Clip } from "../../libs/editor/types";
const settings = { ...DEFAULT_SETTINGS, pages: [0, 5, 10] };
const clip: Clip = { id: "v", kind: "video", trackId: "t", mediaId: "m", start: 0, trimIn: 2, duration: 15, speed: 2, sourceDuration: 40 };
describe("scene editing", () => {
  it("duplicates the portion of a layer crossing into the current scene", () => {
    const page = appendPage(settings, [clip], 6, true, () => "copy");
    expect(page.clips[1]).toMatchObject({ id: "copy", start: 15, duration: 5, trimIn: 12, sourceDuration: 40 });
    expect(page.settings.pages).toEqual([0, 5, 10, 15]);
    expect(clip.duration).toBe(15);
  });
  it("removes the middle scene and preserves source ranges on either side", () => {
    const page = removePage(settings, [clip], 1, () => "tail")!;
    expect(page.clips).toEqual([
      expect.objectContaining({ id: "v", start: 0, duration: 5, trimIn: 2 }),
      expect.objectContaining({ id: "tail", start: 5, duration: 5, trimIn: 22 }),
    ]);
    expect(page.settings.pages).toEqual([0, 5]);
    expect(removePage(settings, [{ ...clip, locked: true }], 1, () => "id")).toBeNull();
  });
  it("includes empty appended scenes in playback and export duration", () => {
    const page = appendPage(DEFAULT_SETTINGS, [{ ...clip, duration: 10 }], 0, false, () => "id");
    expect(timelineDuration(page.settings, page.clips)).toBe(15);
    expect(timelineDuration(DEFAULT_SETTINGS, [{ ...clip, duration: 2 }])).toBe(2);
  });
});
