import { POST_BACKGROUNDS, mergePostBg, parsePostBg } from "../postBackgrounds";

describe("profile post backgrounds", () => {
  it("ships 10 still and 10 moving backdrops with unique ids", () => {
    expect(POST_BACKGROUNDS.filter((b) => b.kind === "still")).toHaveLength(10);
    expect(POST_BACKGROUNDS.filter((b) => b.kind === "moving")).toHaveLength(10);
    expect(new Set(POST_BACKGROUNDS.map((b) => b.id)).size).toBe(20);
  });

  it("reads only known ids and keeps other customs keys on save", () => {
    expect(parsePostBg({ postBg: "aurora" })?.name).toBe("Aurora");
    expect(parsePostBg({ postBg: "url(x)" })).toBeNull();
    expect(mergePostBg({ defaultProfileTab: "posts" }, "holo")).toEqual({ defaultProfileTab: "posts", postBg: "holo" });
    expect(mergePostBg({ a: "1" }, null)).toEqual({ a: "1", postBg: "" });
  });
});
