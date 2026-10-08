import { pageExportFrames } from "../../libs/editor/pageExports";
import type { ProjectSnapshot } from "../../libs/editor/types";

const snapshot = { title: "Café 東京", settings: { pages: [0, 5, 12] }, clips: [] } as unknown as ProjectSnapshot;
describe("page export frames", () => {
  it("exports all pages at their own starts with ordered names and no source mutation", () => {
    const before = JSON.stringify(snapshot);
    expect(pageExportFrames(snapshot, 6.7, "all", "png")).toEqual([
      { index: 0, time: 0, filename: "Café_東京-01.png" },
      { index: 1, time: 5, filename: "Café_東京-02.png" },
      { index: 2, time: 12, filename: "Café_東京-03.png" },
    ]);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("exports only the chosen page using its start, including the final page", () => {
    expect(pageExportFrames(snapshot, 6.7, "current", "jpg")).toEqual([{ index: 1, time: 5, filename: "Café_東京.jpg" }]);
    expect(pageExportFrames(snapshot, 20, "current", "png")[0].time).toBe(12);
  });
  it("keeps the playhead for a single-page frame and handles blank titles", () => {
    expect(pageExportFrames({ ...snapshot, title: "", settings: { ...snapshot.settings, pages: undefined } }, 3.4, "all", "jpg")).toEqual([{ index: 0, time: 3.4, filename: "design.jpg" }]);
  });
  it("keeps every index for more than 99 pages and long titles", () => {
    const many = { ...snapshot, title: "🎬東京".repeat(100), settings: { ...snapshot.settings, pages: Array.from({ length: 105 }, (_, i) => i * 5) } };
    const frames = pageExportFrames(many, 0, "all", "png");
    expect(new Set(frames.map(frame => frame.filename)).size).toBe(105);
    expect(frames.at(-1)?.filename).toMatch(/-105\.png$/);
  });
});
