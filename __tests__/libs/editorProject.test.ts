import {
  addImage,
  addShape,
  addStroke,
  addText,
  layerList,
  updateClip,
  arrangeClip,
  duplicateClip,
  getClip,
  getTransform,
  mediaIds,
  newProject,
  parseProject,
  placementPatch,
  removeClip,
  setAspect,
  visibleLayers,
  STILL_TIME,
} from "../../libs/editor/project";
import { matchPreset, FILTER_PRESETS } from "../../libs/editor/filterPresets";
import { fontStylesheet, nearestWeight, fontFamilyCss, EDITOR_FONTS } from "../../libs/editor/fonts";
import type { ShapeClip, TextClip } from "../../libs/editor/types";

describe("editor project", () => {
  it("starts with the web editor's page sizes and tracks", () => {
    const p = newProject("9:16", "Untitled");
    expect(p.settings).toMatchObject({ width: 1080, height: 1920, aspectPreset: "9:16", background: "#000000" });
    expect(p.tracks.map((t) => t.kind)).toEqual(["video", "audio", "text"]);
    expect(setAspect(p, "4:5").settings).toMatchObject({ width: 1080, height: 1350 });
  });

  it("stacks each new layer above the previous one", () => {
    let p = newProject("1:1", "t");
    const a = addImage(p, "m1");
    p = a.project;
    const b = addText(p, "Hello");
    p = b.project;
    const c = addImage(p, "m2");
    p = c.project;
    const order = visibleLayers(p, STILL_TIME).map((cl) => cl.id);
    expect(order).toEqual([a.clipId, b.clipId, c.clipId]);
    // The first picture reuses the empty Video 1 track instead of adding one.
    expect(getClip(p, a.clipId)!.trackId).toBe(p.tracks[0].id);
    expect(mediaIds(p)).toEqual(["m1", "m2"]);
  });

  it("keeps a new layer visible across a whole web timeline", () => {
    let p = newProject("16:9", "t");
    p = { ...p, clips: [{ ...addImage(p, "m").project.clips[0], duration: 12 }] };
    const { project, clipId } = addText(p, "x");
    expect(getClip(project, clipId)!.duration).toBe(12);
  });

  it("stores text placement in x/y and media placement in transform, like the web", () => {
    let p = newProject("1:1", "t");
    const t = addText(p, "Hi");
    p = t.project;
    const text = getClip(p, t.clipId) as TextClip;
    const patch = placementPatch(text, { x: 0.2, rotation: 30 }) as Partial<TextClip>;
    expect(patch.x).toBe(0.2);
    expect(patch.transform?.rotation).toBe(30);

    const i = addImage(p, "m");
    const img = getClip(i.project, i.clipId)!;
    expect(placementPatch(img, { scale: 2 })).toEqual({ transform: { x: 0.5, y: 0.5, scale: 2, rotation: 0 } });
    expect(getTransform(img)).toEqual({ x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  });

  it("reorders layers by moving their track", () => {
    let p = newProject("1:1", "t");
    const a = addImage(p, "a"); p = a.project;
    const b = addImage(p, "b"); p = b.project;
    p = arrangeClip(p, b.clipId, "back");
    expect(visibleLayers(p, STILL_TIME).map((c) => c.id)).toEqual([b.clipId, a.clipId]);
    p = arrangeClip(p, b.clipId, "forward");
    expect(visibleLayers(p, STILL_TIME).map((c) => c.id)).toEqual([a.clipId, b.clipId]);
  });

  it("duplicates on top with a nudge, and removes", () => {
    let p = newProject("1:1", "t");
    const a = addImage(p, "a"); p = a.project;
    const d = duplicateClip(p, a.clipId)!;
    expect(getTransform(getClip(d.project, d.clipId)!).x).toBeCloseTo(0.54);
    expect(visibleLayers(d.project, STILL_TIME).slice(-1)[0].id).toBe(d.clipId);
    expect(removeClip(d.project, d.clipId).clips).toHaveLength(1);
  });

  it("hides layers on hidden tracks", () => {
    let p = newProject("1:1", "t");
    const a = addImage(p, "a"); p = a.project;
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, hidden: true })) };
    expect(visibleLayers(p, STILL_TIME)).toEqual([]);
  });

  it("round-trips through JSON and refuses anything else", () => {
    const p = addText(newProject("4:5", "My design"), "Hi").project;
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(parseProject("{}")).toBeNull();
    expect(parseProject("not json")).toBeNull();
  });
});

describe("editor presets", () => {
  it("recognises the preset a clip is using", () => {
    expect(matchPreset(undefined)).toBe("none");
    expect(matchPreset({ ...FILTER_PRESETS.find((f) => f.id === "noir")!.effects })).toBe("noir");
    expect(matchPreset({ brightness: 1.01 })).toBeNull();
  });

  it("asks Google Fonts only for weights a family has", () => {
    const bebas = fontFamilyCss(EDITOR_FONTS.find((f) => f.family === "Bebas Neue")!);
    expect(fontStylesheet(bebas)).toBe("https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&display=swap");
    expect(nearestWeight(bebas, 700)).toBe(400);
    expect(fontStylesheet("'Some Web Font', sans-serif")).toBe("https://fonts.googleapis.com/css2?family=Some+Web+Font&display=swap");
    expect(fontStylesheet("system-ui, sans-serif")).toBeNull();
  });
});

describe("shapes and drawing (parity with the web editor)", () => {
  it("adds a shape on its own top track with the web's defaults", () => {
    const base = newProject("1:1", "t");
    const { project, clipId } = addShape(base, "star");
    const clip = project.clips.find((c) => c.id === clipId)!;
    expect(clip).toMatchObject({ kind: "shape", shape: "star", w: 0.3, h: 0.3, fill: "#7c5cff", start: 0 });
    // Reuses a free video track when nothing sits above it, as addImage does.
    expect(project.tracks.find((t) => t.id === clip.trackId)?.kind).toBe("video");
  });

  it("turns a finger stroke into a path whose points fill its own box", () => {
    const base = newProject("1:1", "t");
    const r = addStroke(base, [[100, 100], [300, 200], [500, 100]], { color: "#ff0000", width: 10 })!;
    const clip = r.project.clips[0] as ShapeClip;
    expect(clip.shape).toBe("path");
    expect(clip.w).toBeCloseTo(400 / 1080);
    expect(clip.h).toBeCloseTo(100 / 1080);
    expect(clip.points![0]).toEqual([-0.5, -0.5]);
    expect(clip.points![2]).toEqual([0.5, -0.5]);
    expect(clip.transform).toMatchObject({ x: 300 / 1080, y: 150 / 1080 });
  });

  it("lists every layer front first, hidden ones included, and skips hidden ones on the page", () => {
    let p = newProject("1:1", "t");
    const a = addShape(p, "rect");
    p = a.project;
    const b = addText(p, "hi");
    p = updateClip(b.project, a.clipId, { hidden: true });
    expect(layerList(p).map((c) => c.id)).toEqual([b.clipId, a.clipId]);
    expect(visibleLayers(p, 1).map((c) => c.id)).toEqual([b.clipId]);
    expect(mediaIds(p)).toEqual([]);
  });
});
