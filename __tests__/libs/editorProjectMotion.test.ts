import { newProject } from "../../libs/editor/project";
import { applyOps } from "../../libs/editor/agent";
import { templateOps } from "../../libs/editor/templates";
import { VIDEO_TEMPLATES } from "../../libs/editor/videoTemplates";
import { isVideoProject } from "../../libs/editor/timeline";
import type { Clip } from "../../libs/editor/types";
import { hasTimelineMotion } from "../../libs/editor/projectMotion";
import en from "../../i18n/locales/en.json";

const t = ((key: string, options?: { defaultValue?: string }) => {
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, en);
  return typeof value === "string" ? value : options?.defaultValue ?? key;
}) as unknown as import("i18next").TFunction;
const layer = (patch: Partial<Clip> = {}) => ({ id: "text", trackId: "words", kind: "text", start: 0, duration: 4, trimIn: 0, text: "A static card", fontFamily: "Inter", fontSize: 48, color: "#ffffff", x: 0.5, y: 0.5, ...patch }) as Clip;

describe("motion export classification", () => {
  it("keeps unanimated cards and empty projects as stills", () => {
    expect(hasTimelineMotion([])).toBe(false);
    expect(hasTimelineMotion([layer()])).toBe(false);
    expect(hasTimelineMotion([layer({ keyframes: { opacity: [{ t: 0, v: 1 }, { t: 3, v: 1 }] } })])).toBe(false);
    expect(hasTimelineMotion([layer({ animateOut: { kind: "fade", duration: 0 } })])).toBe(false);
  });
  it("keeps recorded video and audio as timeline exports", () => {
    expect(hasTimelineMotion([layer({ kind: "video" })])).toBe(true);
    expect(hasTimelineMotion([layer({ kind: "audio" })])).toBe(true);
  });
  it("exports entrances, exits, transitions and moving keyframes", () => {
    expect(hasTimelineMotion([layer({ animateIn: { kind: "rise", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ animateOut: { kind: "fade", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ transitionOut: { kind: "fade", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ keyframes: { x: [{ t: 0, v: 0.2 }, { t: 3, v: 0.8 }] } })])).toBe(true);
  });
  for (const template of VIDEO_TEMPLATES) it(`${template.id} exposes MP4 without a video source`, async () => {
    const base = newProject("9:16", "Starter");
    const { project } = await applyOps(base, [{ op: "use_template", template: template.id }], { templateOps: id => templateOps(id, t) });
    expect(project.clips.some(clip => clip.kind === "video" || clip.kind === "audio")).toBe(false);
    expect(isVideoProject(project)).toBe(true);
    expect(isVideoProject(base)).toBe(false);
  });
});
