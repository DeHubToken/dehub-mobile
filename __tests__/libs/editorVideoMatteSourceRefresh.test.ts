import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

function branch(type: string, next: string) {
  const startText = '} else if (m.type === "' + type + '") {';
  const start = EDITOR_CANVAS_HTML.indexOf(startText) + startText.length;
  const end = EDITOR_CANVAS_HTML.indexOf('} else if (m.type === "' + next + '") {', start);
  expect(start).toBeGreaterThan(startText.length); expect(end).toBeGreaterThan(start);
  return EDITOR_CANVAS_HTML.slice(start, end);
}
it("releases a failed native preview when a known page becomes available", () => {
  const cache = { refreshSources: jest.fn() }, schedule = jest.fn(), meta = new Map();
  const receive = new Function("m", "allowedMatteImages", "matteMeta", "mattePageCache", "schedule", branch("matteMeta", "mattePage"));
  receive({ id: "page", width: 100, height: 100 }, new Set(["page"]), meta, cache, schedule);
  expect(meta.get("page")).toEqual({ width: 100, height: 100 }); expect(cache.refreshSources).toHaveBeenCalledTimes(1); expect(schedule).toHaveBeenCalledTimes(1);
  receive({ id: "removed", width: 100, height: 100 }, new Set(["page"]), meta, cache, schedule);
  expect(meta.has("removed")).toBe(false); expect(cache.refreshSources).toHaveBeenCalledTimes(1);
});
it("invalidates stale decoded pages when the native project sources change", () => {
  const cache = { refreshSources: jest.fn() }, meta = new Map([["old", {}]]), image = { src: "old" }, images = new Map([["old", image]]), mattes = new Set(["old"]);
  const receive = new Function("m", "mattePageCache", "matteMeta", "matteImages", "images", 'var allowedMatteImages; ' + branch("mattePrune", "imagePrune") + '; return allowedMatteImages;');
  const allowed = receive({ ids: ["new"] }, cache, meta, mattes, images);
  expect(cache.refreshSources).toHaveBeenCalledTimes(1); expect([...allowed]).toEqual(["new"]); expect(meta.size).toBe(0); expect(images.size).toBe(0); expect(image.src).toBe("");
});
