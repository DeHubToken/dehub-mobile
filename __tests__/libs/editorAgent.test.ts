import { applyOps, askAgent, describeScene } from "../../libs/editor/agent";
import { applyBrand, EMPTY_BRAND } from "../../libs/editor/brand";
import { TEMPLATES, templateOps } from "../../libs/editor/templates";
import { addImage, newProject } from "../../libs/editor/project";
import type { MediaClip, ShapeClip, TextClip } from "../../libs/editor/types";

const t = ((k: string) => k) as unknown as import("i18next").TFunction;

describe("editor agent on the phone (same ops as the web)", () => {
  it("replaces scene layouts with a template starting at zero", async () => {
    const base = newProject("16:9", "old scenes");
    base.settings.pages = [0, 5, 10];
    const { project, report } = await applyOps(base, [{ op: "use_template", template: "test" }], { time: 12, templateOps: () => [{ op: "add_text", text: "New design" }] });
    expect(report).toMatchObject({ applied: 1, failed: 0, cursorTime: 0 });
    expect(project.settings.pages).toBeUndefined();
    expect(project.clips[0]).toMatchObject({ kind: "text", start: 0 });
    expect(base.settings.pages).toEqual([0, 5, 10]);
  });
  it("navigates scenes and adds layers to the chosen scene", async () => {
    const base = newProject("16:9", "scenes");
    const { project, report } = await applyOps(base, [
      { op: "add_text", text: "First" }, { op: "add_page" }, { op: "add_text", text: "Second" },
      { op: "goto_page", index: 0 }, { op: "add_shape" },
    ]);
    expect(report).toMatchObject({ applied: 5, failed: 0, cursorTime: 0 });
    expect(project.settings.pages).toEqual([0, 5]);
    expect(project.clips[1]).toMatchObject({ start: 5, duration: 5 });
    expect(project.clips[2]).toMatchObject({ start: 0, duration: 5 });
    expect(describeScene(project, null, null, 6).currentPage).toBe(1);
  });
  it("performs precise numeric cuts without a network planner", async () => {
    const base = newProject("16:9", "video");
    base.tracks = [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }];
    base.clips = [{ id: "v1", trackId: "v", kind: "video", mediaId: "m", start: 0, trimIn: 0, duration: 10 }];
    const fetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const result = await askAgent([{ role: "user", content: "break up the video into 10 1 second clips" }], describeScene(base, "v1", null));
      expect(fetch).not.toHaveBeenCalled();
      const { project, report } = await applyOps(base, result.ops);
      expect(report).toMatchObject({ applied: 1, failed: 0 });
      expect(project.clips.map(c => c.trimIn)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    } finally { fetch.mockRestore(); }
  });
  it("adds editable speed-aware captions on a separate track in one snapshot", async () => {
    const base = newProject("16:9", "speech");
    const video: MediaClip = { id: "v", trackId: "t", kind: "video", mediaId: "m", start: 3, trimIn: 5, duration: 2, speed: 2 };
    base.clips = [video];
    const transcribe = jest.fn(async () => [{ text: "Hello.", start: 0, end: 1 }, { text: "World.", start: 2, end: 4 }]);
    const { project, report } = await applyOps(base, [{ op: "captions", id: "v", style: "bold" }], { transcribe });
    expect(transcribe).toHaveBeenCalledWith(video);
    expect(report).toMatchObject({ applied: 1, failed: 0 });
    expect(project.clips[1]).toMatchObject({ kind: "text", text: "Hello.", start: 3, color: "#f9ee58" });
    expect(project.clips[2].start + project.clips[2].duration).toBe(5);
    expect(base.clips).toEqual([video]);
  });
  it("imports stock video and sound, then reuses library media without losing source bounds", async () => {
    const base = newProject("16:9", "video");
    const importStock = jest.fn(async (_q: string, _o: string, kind?: "photo" | "video" | "audio") => ({ id: kind + "1", kind: kind === "audio" ? "audio" as const : "video" as const, duration: kind === "audio" ? 4 : 12 }));
    const media = [{ id: "local1", kind: "video" as const, duration: 8, name: "Local recording" }];
    const { project, report } = await applyOps(base, [
      { op: "add_stock", query: "ocean", kind: "video" }, { op: "add_stock", query: "ambient", kind: "audio" },
      { op: "add_media", mediaId: "local1" }, { op: "trim", id: "new:2", offset: 1, duration: 5 },
    ], { importStock, media, time: 2 });
    expect(report).toMatchObject({ applied: 4, failed: 0 });
    expect(project.clips[0]).toMatchObject({ kind: "video", duration: 12, sourceDuration: 12 });
    expect(project.clips[1]).toMatchObject({ kind: "audio", start: 2, duration: 4 });
    expect(project.clips[2]).toMatchObject({ kind: "video", mediaId: "local1", trimIn: 1, duration: 5, sourceDuration: 8 });
    expect(describeScene(project, null, null, 0, media).library).toEqual(media);
    expect(base.clips).toHaveLength(0);
  });
  it("segments video and exposes real video and audio timing to the shared planner", async () => {
    const base = newProject("16:9", "video");
    const video: MediaClip = { id: "v1", trackId: "v", kind: "video", mediaId: "m1", start: 0, duration: 10, trimIn: 3, sourceDuration: 30 };
    base.tracks = [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }];
    base.clips = [video, { ...video, id: "a1", kind: "audio", trackId: "a", start: 5, duration: 10 }];
    const scene = describeScene(base, "v1", null);
    expect(scene.page.duration).toBe(15);
    expect(scene.layers).toHaveLength(2);
    expect(scene.capabilities).toContain("segment");
    expect(scene.layers[1]).toMatchObject({ id: "a1", kind: "audio", trimIn: 3 });
    const { project, report } = await applyOps(base, [{ op: "segment", id: "v1", count: 10, duration: 1 }, { op: "audio", id: "new:0", volume: 0 }]);
    expect(report).toMatchObject({ applied: 2, failed: 0 });
    expect(project.clips.filter((c) => c.kind === "video")).toHaveLength(10);
    expect(project.clips[1]).toMatchObject({ trimIn: 4, audio: { volume: 0 } });
    expect(base.clips[0].duration).toBe(10);
  });
  it("builds a design from ops in one new snapshot, leaving the input untouched", async () => {
    const base = newProject("16:9", "t");
    const { project, report } = await applyOps(base, [
      { op: "set_canvas", x: 1080, y: 1080 },
      { op: "add_shape", shape: "rect", w: 0.8, h: 0.2, fill: "#000000", radius: 24 },
      { op: "add_text", text: "SUMMER SALE", fontSize: 400, fontWeight: 900, fontFamily: "Anton", color: "#ffffff", y: 0.2 },
      { op: "update", id: "new:0", blend: "multiply", locked: true },
    ]);
    expect(report).toMatchObject({ applied: 4, failed: 0 });
    expect(project.settings.aspectPreset).toBe("1:1");
    const shape = project.clips.find((c) => c.kind === "shape") as ShapeClip;
    expect(shape).toMatchObject({ fill: "#000000", radius: 24, blend: "multiply", locked: true });
    const text = project.clips.find((c) => c.kind === "text") as TextClip;
    expect(text.fontFamily).toContain("Anton");
    // 400px uppercase on a 1080 page cannot fit; it is shrunk to stay on the page.
    expect(text.fontSize).toBeLessThan(200);
    expect(base.clips).toHaveLength(0);
  });

  it("reports unsupported generation and fails captions with no media target", async () => {
    const { report } = await applyOps(newProject("1:1", "t"), [{ op: "captions" }, { op: "generate" }]);
    expect(report.unsupported).toEqual(["generate"]);
    expect(report.failed).toBe(2);
  });

  it("swaps a picture for its cut-out when the phone can remove backgrounds", async () => {
    const { project: base, clipId } = addImage(newProject("1:1", "t"), "photo1");
    const without = await applyOps(base, [{ op: "remove_background", id: clipId }]);
    expect(without.report.unsupported).toEqual(["remove_background"]);
    const { project, report } = await applyOps(base, [{ op: "remove_background", id: clipId }], {
      removeBackground: async (mediaId) => mediaId + "-cut",
    });
    expect(report.applied).toBe(1);
    expect(project.clips.find((c) => c.id === clipId)).toMatchObject({ mediaId: "photo1-cut" });
  });

  it("keyframes a layer, and later placement keys it at the playhead", async () => {
    const { project: base, clipId } = addImage(newProject("1:1", "t"), "photo1");
    const { project, report } = await applyOps(base, [
      { op: "keyframes", id: clipId, x: [{ t: 0, v: -2, ease: "easeOutBack" }, { t: 99, v: 0.5 }], scale: "none", rotation: [] },
    ]);
    expect(report).toMatchObject({ applied: 1, failed: 0 });
    const keys = project.clips[0].keyframes;
    expect(keys?.x).toEqual([{ t: 0, v: -0.5, ease: "easeOutBack" }, { t: 5, v: 0.5 }]);
    expect(keys?.scale).toBeUndefined();
    expect(describeScene(project, null, null).layers[0]).toMatchObject({ keys });
    const moved = await applyOps(project, [{ op: "place", id: clipId, x: 0.2, y: 0.7 }], { time: 2 });
    const c = moved.project.clips[0];
    expect(c.keyframes?.x?.map((k) => [k.t, k.v])).toEqual([[0, -0.5], [2, 0.2], [5, 0.5]]);
    expect(c.transform?.y).toBe(0.7);
    const cleared = await applyOps(project, [{ op: "keyframes", id: clipId, x: "none" }]);
    expect(cleared.project.clips[0].keyframes).toBeUndefined();
  });

  it("describes the brand kit only when one is set", () => {
    const p = newProject("1:1", "t");
    expect(describeScene(p, null, EMPTY_BRAND).brand).toBeUndefined();
    expect(describeScene(p, null, { ...EMPTY_BRAND, colors: ["#ff5500"] }).brand).toMatchObject({ colors: ["#ff5500"] });
  });
});

describe("brand kit", () => {
  it("keeps text readable on the page background", async () => {
    const { project } = await applyOps(newProject("1:1", "t"), [
      { op: "set_canvas", background: "#000000" },
      { op: "add_text", text: "Title", fontSize: 160 },
      { op: "add_shape", shape: "star" },
    ]);
    const out = applyBrand(project, { ...EMPTY_BRAND, colors: ["#0a0a0a", "#ff5500"], headingFont: "'Anton', system-ui" });
    const text = out.clips.find((c) => c.kind === "text") as TextClip;
    expect(text).toMatchObject({ color: "#ff5500", fontFamily: "'Anton', system-ui" });
    expect((out.clips.find((c) => c.kind === "shape") as ShapeClip).fill).toBe("#0a0a0a");
  });
});

describe("templates", () => {
  it("builds every template without stock photos", async () => {
    for (const tpl of TEMPLATES) {
      const ops = templateOps(tpl.id, t)!.filter((o) => o.op !== "add_stock");
      const { project, report } = await applyOps(newProject(tpl.aspect as "1:1", "t"), ops);
      expect(project.settings.aspectPreset).toBe(tpl.aspect);
      expect(project.clips.length).toBeGreaterThan(0);
      expect(report.failed).toBeLessThanOrEqual(ops.filter((o) => typeof o.id === "string" && o.id.startsWith("new:")).length);
    }
  });
});
