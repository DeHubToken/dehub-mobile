import { applyOps, askAgent, describeScene } from "../../libs/editor/agent";
import { templateOps } from "../../libs/editor/templates";
import { newProject } from "../../libs/editor/project";
import { VIDEO_TEMPLATES, VIDEO_TEMPLATE_FORMATS, videoTemplateCommand } from "../../libs/editor/videoTemplates";
import type { TextClip } from "../../libs/editor/types";
import en from "../../i18n/locales/en.json";

const timings: Record<string, number[][]> = {"question": [[0, 3], [3, 7], [7, 10]], "beforeAfter": [[0, 2], [2, 6], [6, 10], [10, 12]], "tips": [[0, 2], [2, 5], [5, 8], [8, 11], [11, 14]], "tutorial": [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15]], "countdown": [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 13], [13, 15]], "mythFact": [[0, 3], [3, 8], [8, 12]], "product": [[0, 3], [3, 8], [8, 12]], "announcement": [[0, 3], [3, 7], [7, 10]], "story": [[0, 5], [5, 10], [10, 15]], "quote": [[0, 7], [7, 10]]};
const t = ((key: string) => {
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, en);
  if (typeof value !== "string") throw new Error(`Missing template words: ${key}`);
  return value;
}) as unknown as import("i18next").TFunction;

describe("timed video starters", () => {
  for (const template of VIDEO_TEMPLATES) for (const aspect of VIDEO_TEMPLATE_FORMATS) {
    it(`${template.id} keeps sequential scenes in ${aspect}`, async () => {
      const base = newProject(aspect, "Original");
      base.settings.pages = [0, 5];
      const before = JSON.stringify(base);
      const { project, report } = await applyOps(base, [{ op: "use_template", template: template.id, aspect }], { templateOps: (id, format) => templateOps(id, t, format) });
      expect(report).toMatchObject({ applied: 1, failed: 0, cursorTime: 0 });
      const beats = timings[template.id.replace("video-", "")];
      const end = beats[beats.length - 1][1];
      expect(project.settings.aspectPreset).toBe(aspect);
      expect(project.settings.pages).toBeUndefined();
      expect(Math.max(...project.clips.map(clip => clip.start + clip.duration))).toBe(end);
      const words = project.clips.filter((clip): clip is TextClip => clip.kind === "text");
      expect(words).toHaveLength(beats.length * 3);
      expect(words.every(clip => clip.maxWidth === 0.78 && typeof clip.maxHeight === "number" && clip.animateIn && clip.animateOut)).toBe(true);
      expect(words.every(clip => clip.text && !clip.text.startsWith("editor."))).toBe(true);
      beats.forEach(([start, finish]) => {
        const active = words.filter(clip => clip.start <= start + 0.6 && clip.start + clip.duration > start + 0.6);
        expect(active).toHaveLength(3);
        expect(active.every(clip => clip.start === start && clip.duration === finish - start)).toBe(true);
      });
      expect(words.filter(clip => clip.start + clip.duration > end)).toHaveLength(0);
      expect(JSON.stringify(base)).toBe(before);
    });
  }

  it("recognizes named requests while retaining the requested or current format", () => {
    expect(videoTemplateCommand("Use a question hook template in 16:9")).toEqual({ op: "use_template", template: "video-question", aspect: "16:9" });
    expect(videoTemplateCommand("Please make a top 5 video in 1:1 format!")).toEqual({ op: "use_template", template: "video-countdown", aspect: "1:1" });
    expect(videoTemplateCommand("Apply the before and after starter", { page: { aspect: "4:5" } })).toEqual({ op: "use_template", template: "video-beforeAfter", aspect: "4:5" });
    expect(videoTemplateCommand("Create a product reveal video", { page: { aspect: "custom" } })?.aspect).toBe("9:16");
    expect(videoTemplateCommand("Use a question hook template in 16:10")).toBeNull();
    expect(videoTemplateCommand("Add a question to my existing video")).toBeNull();
    expect(videoTemplateCommand("Create a video of ocean waves")).toBeNull();
  });

  it("routes a named starter without a network planner", async () => {
    const base = newProject("9:16", "Original");
    const fetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const result = await askAgent([{ role: "user", content: "Use a three tips template in 16:9" }], describeScene(base, null, null));
      expect(result.ops).toEqual([{ op: "use_template", template: "video-tips", aspect: "16:9" }]);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("keeps text fitting bounds and resets them explicitly", async () => {
    const base = newProject("9:16", "Original");
    const first = await applyOps(base, [{ op: "add_text", text: "A long headline that should wrap instead of permanently shrinking", fontSize: 100, maxWidth: 0.6, maxHeight: 0.2 }]);
    const word = first.project.clips[0];
    expect(word).toMatchObject({ kind: "text", fontSize: 100, maxWidth: 0.6, maxHeight: 0.2 });
    const second = await applyOps(first.project, [{ op: "update", id: word.id, maxWidth: null, maxHeight: null }]);
    expect(second.project.clips[0]).toMatchObject({ maxWidth: undefined, maxHeight: undefined });
    expect(base.clips).toHaveLength(0);
  });
});
