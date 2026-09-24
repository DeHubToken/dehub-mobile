import { applyOps, describeScene } from "../../libs/editor/agent";
import { applyBrand, EMPTY_BRAND } from "../../libs/editor/brand";
import { TEMPLATES, templateOps } from "../../libs/editor/templates";
import { newProject } from "../../libs/editor/project";
import type { ShapeClip, TextClip } from "../../libs/editor/types";

const t = ((k: string) => k) as unknown as import("i18next").TFunction;

describe("editor agent on the phone (same ops as the web)", () => {
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

  it("reports what only the web does instead of failing silently", async () => {
    const { report } = await applyOps(newProject("1:1", "t"), [{ op: "captions" }, { op: "add_page" }]);
    expect(report.unsupported).toEqual(["captions", "add_page"]);
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
