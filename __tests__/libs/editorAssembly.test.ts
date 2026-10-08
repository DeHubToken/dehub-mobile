import { assemblyRequest, assemblyPlan, assemblyProject, assemblyDuration, AssemblySession, persistAssembly } from "../../libs/editor/assembly";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const video: MediaClip = { id: "one", kind: "video", mediaId: "source", trackId: "v", start: 10, duration: 8, trimIn: 2, speed: 2, sourceDuration: 30, audio: { volume: 0.6, fadeIn: 2 }, keyframes: { x: [{ t: 0, v: 0.2 }, { t: 8, v: 0.8 }] } };
const photo: MediaClip = { id: "two", kind: "image", mediaId: "photo", trackId: "p", start: 20, duration: 6, trimIn: 0 };
const sound: MediaClip = { id: "sound", kind: "audio", mediaId: "song", trackId: "a", start: 0, duration: 3, trimIn: 1, speed: 0.5, audio: { volume: 0.2 } };
const project = (): ProjectSnapshot => ({ id: "original", title: "Source", clips: [video, photo, sound], tracks: [
  { id: "b", kind: "video", name: "Background", hidden: false, muted: false },
  { id: "v", kind: "video", name: "Video", hidden: false, muted: false },
  { id: "p", kind: "video", name: "Photo", hidden: false, muted: false },
  { id: "c", kind: "text", role: "captions", name: "Captions", hidden: false, muted: false },
  { id: "a", kind: "audio", name: "Music", hidden: false, muted: false }], settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000", pages: [0, 26] }, updatedAt: 1 });
const request = { seconds: 10, selected: false, transition: "fade" as const, music: true };
const plan = () => ({ shots: [{ id: "one", offset: 1, duration: 4 }, { id: "two", offset: 0, duration: 3 }], transition: "fade" as const, soundId: "sound" });
const build = (source = project()) => { let id = 0; return assemblyProject(source, plan(), { id: "copy", title: "Assembled" }, () => `copy-${++id}`); };

describe("editable assembly", () => {
  it("routes explicit assembly while leaving generation, captions, edits and highlights alone", () => {
    expect(assemblyRequest("Create a 10 second video from my clips with fades and music")).toEqual(request);
    expect(assemblyRequest("Combine selected photos without music")).toMatchObject({ selected: true, music: false });
    expect(assemblyRequest("Peux-tu créer une vidéo de 10 secondes à partir de mes clips avec musique")).toMatchObject({ seconds: 10, music: true });
    for (const text of ["Create a photo using my images", "Create captions from my video", "Generate a video of a forest", "Split this video into ten clips", "Create highlights from my video"]) expect(assemblyRequest(text)).toBeNull();
  });
  it("allocates exactly the budget, limits short shots, and respects explicit selection without fallback", () => {
    const source = project(); source.clips[1] = { ...photo, kind: "video", duration: 2 };
    const allocated = assemblyPlan(source, request, []);
    expect(allocated.shots.map(s => s.duration)).toEqual([8, 2]); expect(assemblyDuration(allocated)).toBe(10);
    expect(assemblyPlan(source, { ...request, seconds: 4, selected: true }, ["one"]).shots).toEqual([{ id: "one", offset: 0, duration: 4 }]);
    for (const bad of [0, Infinity, 601, 20]) expect(() => assemblyPlan(source, { ...request, seconds: bad }, [])).toThrow();
    expect(() => assemblyPlan(source, { ...request, selected: true }, [])).toThrow();
    source.clips[0] = { ...video, locked: true }; expect(() => assemblyPlan(source, request, [])).toThrow();
  });
  it("keeps the original and source offsets, rates, audio curve, captions and background stacking", () => {
    const source = project();
    source.clips.push({ id: "caption", trackId: "c", kind: "text", start: 11.5, duration: 1, trimIn: 0, text: "Source caption", fontFamily: "Arial", fontSize: 50, fontWeight: 400, color: "#fff", align: "centre", x: 0.5, y: 0.5 },
      { id: "bg", trackId: "b", kind: "shape", start: 0, duration: 26, trimIn: 0, shape: "rect", w: 1, h: 1, fill: "#111" });
    const before = JSON.stringify(source), copy = build(source), main = copy.clips.filter(c => c.kind === "video" || c.kind === "image") as MediaClip[];
    expect(JSON.stringify(source)).toBe(before); expect(copy.id).not.toBe(source.id); expect(copy.settings.pages).toBeUndefined();
    expect(main.map(c => [c.start, c.duration, c.trimIn, c.speed ?? 1])).toEqual([[0, 4, 4, 2], [4, 3, 0, 1]]);
    expect(main[0].keyframes?.x?.[0].t).toBe(-1); expect(main[0].audio?.envelope?.[0].time).toBe(-1);
    expect(main[0].transitionOut).toEqual({ kind: "fade", duration: 0.4 }); expect(main[1].transitionOut).toBeUndefined();
    const caption = copy.clips.find(c => c.kind === "text")!, background = copy.clips.find(c => c.kind === "shape")!;
    expect([caption.start, caption.duration]).toEqual([0.5, 1]);
    expect(copy.tracks.find(t => t.id === caption.trackId)?.role).toBe("captions");
    expect(copy.tracks.findIndex(t => t.id === background.trackId)).toBeLessThan(copy.tracks.findIndex(t => t.id === main[0].trackId));
    expect(copy.tracks.findIndex(t => t.id === caption.trackId)).toBeGreaterThan(copy.tracks.findIndex(t => t.id === main[0].trackId));
  });
  it("holds photos for the requested duration without extending neighbouring footage or audio", () => {
    const source = project(); source.clips = [photo, { ...sound, start: 20 },
      { id: "bg", trackId: "b", kind: "shape", start: 20, duration: 6, trimIn: 0, shape: "rect", w: 1, h: 1, fill: "#111" }];
    const allocated = assemblyPlan(source, { ...request, seconds: 15, music: false }, []);
    let id = 0; const copy = assemblyProject(source, allocated, { id: "copy", title: "Held photo" }, () => `held-${++id}`);
    expect(copy.clips.find(c => c.kind === "image")?.duration).toBe(15);
    expect(copy.clips.find(c => c.kind === "shape")?.duration).toBe(15);
    expect(copy.clips.find(c => c.kind === "audio")?.duration).toBe(3);
  });
  it("loops a chosen trimmed/rate-adjusted soundtrack through the complete edit without duplicating it as an overlay", () => {
    const copy = build(), sounds = copy.clips.filter(c => c.kind === "audio") as MediaClip[];
    expect(sounds.map(c => [c.start, c.duration, c.trimIn, c.speed, c.audio?.volume])).toEqual([[0, 3, 1, 0.5, 0.2], [3, 3, 1, 0.5, 0.2], [6, 1, 1, 0.5, 0.2]]);
    const defaults = project(); defaults.clips = defaults.clips.map(c => c.id === sound.id ? { ...c, audio: undefined } : c);
    const unchangedLevel = build(defaults);
    expect((unchangedLevel.clips.find(c => c.kind === "audio") as MediaClip).audio?.volume ?? 1).toBe(1);
    defaults.tracks.find(t => t.id === sound.trackId)!.muted = true;
    const mutedCopy = build(defaults), chosenSound = mutedCopy.clips.find(c => c.kind === "audio")!;
    expect(mutedCopy.tracks.find(t => t.id === chosenSound.trackId)?.muted).toBe(true);
    expect(new Set(copy.clips.map(c => c.id)).size).toBe(copy.clips.length);
    const source = project(); source.tracks[1].muted = true; expect((build(source).clips.find(c => c.kind === "video") as MediaClip).audio?.volume).toBe(0);
  });
  it("rejects malformed ranges, repeated ids, hidden sources and fabricated soundtrack identities", () => {
    for (const bad of [{ ...plan(), soundId: "fake" }, { ...plan(), shots: [...plan().shots, plan().shots[0]] }, { ...plan(), shots: [{ id: "one", offset: 7, duration: 4 }] }]) expect(() => assemblyProject(project(), bad, { id: "copy", title: "Copy" }, () => "x")).toThrow();
    const source = project(); source.tracks[1].hidden = true; expect(() => build(source)).toThrow();
  });
  it("review changes only a draft, supports ordering/ranges/music/undo and stops stale source creation", async () => {
    let source = project(), calls = 0;
    const before = JSON.stringify(source), session = new AssemblySession({ current: () => source, create: async () => { calls++; return true; } }, () => {});
    session.start(request, []); expect(session.state.shots).toHaveLength(2);
    session.move(1, -1); session.range("one", 2, 3); expect(session.preview(1)).toEqual({ id: "one", start: 12, end: 15 });
    expect(session.review("no music")).toBe(true); expect(session.state.soundId).toBeNull(); session.undo(); expect(session.state.soundId).toBe("sound");
    expect(session.review("remove clip 1")).toBe(true); expect(session.state.shots.map(s => s.id)).toEqual(["one"]);
    expect(session.review("use music 99")).toBe(false); expect(session.review("delete the original project")).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
    source = { ...source, clips: [...source.clips] }; expect(await session.create()).toBe(false); expect(session.state.error).toBe("changed"); expect(calls).toBe(0);
  });
  it("prevents duplicate creation and cancels an in-flight copy without later switching", async () => {
    const source = project(); let release!: (value: boolean) => void, calls = 0;
    const session = new AssemblySession({ current: () => source, create: async (_s, _p, signal) => { calls++; const done = await new Promise<boolean>(r => { release = r; }); return done && !signal.aborted; } }, () => {});
    session.start(request, []); const pending = session.create(); expect(await session.create()).toBe(false); session.reset(); release(true);
    expect(await pending).toBe(false); expect(calls).toBe(1); expect(session.state.sourceId).toBeNull();
  });
  it("keeps invalid range drafts visible and blocks preview/create until all fields are corrected", async () => {
    const source = project(); let calls = 0;
    const session = new AssemblySession({ current: () => source, create: async () => { calls++; return true; } }, () => {});
    session.start(request, []); session.range("one", 7, 5);
    expect(session.state.shots[0].offset).toBe(7); expect(session.state.error).toBe("limit"); expect(session.preview(0)).toBeNull();
    session.sound(null); expect(await session.create()).toBe(false); expect(calls).toBe(0);
    session.range("one", 7, 0.5); expect(session.state.error).toBeNull(); expect(session.preview(0)).toEqual({ id: "one", start: 17, end: 17.5 });
  });
  it("saves the source and copy before committing, and stops after either cancelled/failed save or changed source", async () => {
    const source = project(), next = build(source);
    for (const stop of [0, 1, 2, 3]) {
      const controller = new AbortController(); const saved: ProjectSnapshot[] = []; let commits = 0, current = source;
      const success = await persistAssembly(source, next, { current: () => current, save: async p => { saved.push(p); if (saved.length === stop) controller.abort(); if (stop === 3) current = { ...source, settings: { ...source.settings } }; }, commit: () => { commits++; } }, controller.signal);
      expect(success).toBe(stop === 0); expect(commits).toBe(stop === 0 ? 1 : 0); expect(saved[0]).toBe(source);
      if (stop === 0 || stop === 2) expect(saved[1]).toBe(next); else expect(saved).toHaveLength(1);
    }
    let commits = 0;
    await expect(persistAssembly(source, next, { current: () => source, save: async () => { throw new Error("disk"); }, commit: () => { commits++; } })).rejects.toThrow("disk"); expect(commits).toBe(0);
  });
});
