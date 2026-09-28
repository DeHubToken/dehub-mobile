import { iconPaths } from "../../components/ui/iconPaths";

describe("iconPaths", () => {
  it("starts every merged path with an absolute moveto", () => {
    for (const [name, entry] of Object.entries(iconPaths)) {
      expect({ name, start: entry![0][0] }).toEqual({ name, start: "M" });
    }
  });

  it("turns a leading relative moveto into moveto plus relative lineto", () => {
    // lucide's check is "m9 11 3 3L22 4"-style: extra pairs after m are linetos.
    expect(iconPaths.Bookmark![0]).toBe("M19 21l-7 -4 -7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z");
  });

  it("merges every shape of a multi-shape icon", () => {
    const [d, parts] = iconPaths.Share2!;
    expect(parts).toBe(5);
    expect(d.match(/M/g)).toHaveLength(5);
  });
});
