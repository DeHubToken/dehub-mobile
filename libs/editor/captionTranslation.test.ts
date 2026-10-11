import { applyCaptionTranslation, planCaptionTranslation, translateCaptionPlan } from "./captionTranslation";
import { subtitleLayers, exportSubtitles, parseSubtitles } from "./subtitles";

function fixture(texts = ["First caption", "Second caption"]) {
  let id = 0;
  const result = subtitleLayers(texts.map((text, i) => ({ start: i * 3 + 0.25, end: i * 3 + 2.5, text })), () => `cue-${++id}`);
  return { id: "project", clips: result.clips, tracks: [result.track], settings: { background: "#000000" }, title: "Caption test" };
}
const translate = (text: string) => Promise.resolve(`Translated ${text}`);

describe("caption translation", () => {
  it("passes complete long cues and more than forty cues without scene truncation", async () => {
    const texts = Array.from({ length: 55 }, (_, i) => `${i}: ${"full caption ".repeat(50)}`);
    const project = fixture(texts), plan = planCaptionTranslation(project), inputs: string[] = [];
    const updates = await translateCaptionPlan(plan, "fr", { signal: new AbortController().signal, translate: async text => { inputs.push(text); return `French ${text}`; } });
    expect(inputs).toEqual(texts);
    expect(updates).toHaveLength(55);
    expect(updates[54].text).toBe(`French ${texts[54]}`);
  });
  it("reuses repeated cue text within the explicit request", async () => {
    const plan = planCaptionTranslation(fixture(["same", "same", "different"])), inputs: string[] = [], progress: number[] = [];
    const updates = await translateCaptionPlan(plan, "es", { signal: new AbortController().signal, translate: async text => { inputs.push(text); return translate(text); }, onProgress: done => progress.push(done) });
    expect(inputs).toEqual(["same", "different"]);
    expect(updates).toHaveLength(3);
    expect(progress).toEqual([0, 1, 2, 3]);
  });
  it("cancels an in-flight cue immediately and starts no subsequent request", async () => {
    const controller = new AbortController(), inputs: string[] = [];
    let finish!: (value: string) => void;
    const result = translateCaptionPlan(planCaptionTranslation(fixture()), "de", { signal: controller.signal, translate: text => { inputs.push(text); return new Promise(resolve => { finish = resolve; }); } });
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    finish("Late translation");
    await Promise.resolve();
    expect(inputs).toEqual(["First caption"]);
  });
  it("rejects partial or invalid provider results without altering source clips", async () => {
    const project = fixture(), before = JSON.stringify(project);
    for (const output of ["", "  ", null, "x".repeat(20_001)]) {
      await expect(translateCaptionPlan(planCaptionTranslation(project), "it", { signal: new AbortController().signal, translate: async () => output })).rejects.toThrow();
    }
    await expect(translateCaptionPlan(planCaptionTranslation(project), "it", { signal: new AbortController().signal, translate: async text => { if (text.startsWith("Second")) throw new Error("Unavailable"); return "Translated first"; } })).rejects.toThrow("Unavailable");
    expect(JSON.stringify(project)).toBe(before);
  });
  it("preserves timing, styles, media, settings and subtitle exports in one proposed snapshot", async () => {
    const project = fixture(), plan = planCaptionTranslation(project);
    project.clips[0].fontSize = 73;
    const styledPlan = planCaptionTranslation(project);
    const next = applyCaptionTranslation(project, styledPlan, await translateCaptionPlan(styledPlan, "ja", { signal: new AbortController().signal, translate }));
    next.clips.forEach((clip, index) => expect({ ...clip, text: project.clips[index].text }).toEqual(project.clips[index]));
    expect(next.tracks).toBe(project.tracks);
    expect(next.settings).toBe(project.settings);
    for (const format of ["srt", "vtt"] as const) expect(parseSubtitles(exportSubtitles(next.clips, format)).map(cue => cue.text)).toEqual(next.clips.map(clip => clip.text));
    expect(() => applyCaptionTranslation(project, plan, next.clips.map(({ id, text }) => ({ id, text })))).toThrow("changed");
  });
  it("excludes locked and hidden captions and refuses changes made during translation", () => {
    const project = fixture(["editable", "locked", "hidden"]);
    project.clips[1].locked = true; project.clips[2].hidden = true;
    const plan = planCaptionTranslation(project), updates = [{ id: plan.cues[0].id, text: "new" }];
    expect(plan.cues.map(cue => cue.text)).toEqual(["editable"]);
    for (const change of [{ text: "edited" }, { locked: true }, { hidden: true }, { start: 2 }]) {
      expect(() => applyCaptionTranslation({ ...project, clips: project.clips.map((clip, i) => i ? clip : { ...clip, ...change }) }, plan, updates)).toThrow("changed");
    }
    expect(() => applyCaptionTranslation({ ...project, tracks: project.tracks.map(track => ({ ...track, hidden: true })) }, plan, updates)).toThrow("changed");
  });
  it("refuses incomplete and duplicate results and preserves the no-op snapshot", () => {
    const project = fixture(), plan = planCaptionTranslation(project);
    expect(() => applyCaptionTranslation(project, plan, [{ id: plan.cues[0].id, text: "new" }])).toThrow("incomplete");
    expect(() => applyCaptionTranslation(project, plan, [{ id: plan.cues[0].id, text: "new" }, { id: plan.cues[0].id, text: "other" }])).toThrow("incomplete");
    expect(applyCaptionTranslation(project, plan, plan.cues)).toBe(project);
  });
  it("keeps the original footage and audio controls alongside translated captions", () => {
    const base = fixture();
    const video = { id: "footage", trackId: "video", kind: "video" as const, mediaId: "original", start: 0, duration: 12, trimIn: 3, speed: 1.5, audio: { volume: 0.7, fadeIn: 0.2, fadeOut: 0.4 } };
    const project = { ...base, clips: [...base.clips, video] };
    const plan = planCaptionTranslation(project);
    const next = applyCaptionTranslation(project, plan, plan.cues.map(cue => ({ id: cue.id, text: `Translated ${cue.text}` })));
    expect(next.clips.at(-1)).toBe(video);
    expect(next.clips.at(-1)).toEqual(video);
    expect(next.title).toBe(project.title);
    expect(next.settings).toBe(project.settings);
  });
});
