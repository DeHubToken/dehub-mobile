import { exportBaseName, exportFilename } from "../../libs/editor/exportName";

describe("portable export names", () => {
  it.each([
    ["Summer launch", "Summer_launch.mp4"],
    [" Café 東京 🎬 ", "Café_東京_🎬.mp4"],
    ["Cafe\u0301", "Café.mp4"],
    ["my/video\\draft:*?\"<>|", "my_video_draft.mp4"],
    ["..", "video.mp4"],
    [" \u0000\u001f ", "video.mp4"],
    ["CON", "_CON.mp4"],
    ["nul.story", "_nul.story.mp4"],
    ["LPT¹", "_LPT¹.mp4"],
    ["construction", "construction.mp4"],
  ])("exports %j as %j", (title, expected) => {
    expect(exportFilename(title, "mp4")).toBe(expected);
    expect(exportFilename(exportBaseName(title), "mp4")).toBe(expected);
  });

  it("keeps archive suffixes and every clip number on long Unicode titles", () => {
    const title = "🎬東京".repeat(100);
    const names = Array.from({ length: 110 }, (_, i) => exportFilename(title, "mp4", `-clip-${String(i + 1).padStart(3, "0")}`));
    expect(new Set(names).size).toBe(110);
    expect(names[109]).toMatch(/-clip-110\.mp4$/);
    for (const name of names) {
      expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(164);
      expect(name).not.toMatch(/[\ud800-\udfff]/u);
      expect(exportFilename(name.slice(0, -4), "mp4")).toBe(name);
    }
    expect(exportFilename(title, "zip", "-clips")).toMatch(/-clips\.zip$/);
    expect(exportFilename("", "png", "-01", "design")).toBe("design-01.png");
  });
});
