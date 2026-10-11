import { assemblyShotKey, assemblyRequest, assemblyPlan, assemblyProject, assemblyDuration, AssemblySession, persistAssembly } from "../../libs/editor/assembly";
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
  it("splits draft ranges locally and retains trims, rate, caption and audio placement in the new project", () => {
    const source = project();
    source.clips[2] = { ...sound, start: 10, duration: 6, sourceDuration: 10 };
    source.clips.push({ id: "caption", trackId: "c", kind: "text", start: 14, duration: 1, trimIn: 0, text: "Second section", fontFamily: "Arial", fontSize: 50, fontWeight: 400, color: "#fff", align: "centre", x: 0.5, y: 0.5 });
    const before = JSON.stringify(source), session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
    session.start({ seconds: 6, selected: true, transition: "fade", music: false }, ["one"]);
    session.split(0);
    expect(session.state.shots).toEqual([{ id: "one", offset: 0, duration: 3 }, { id: "one", part: 1, offset: 3, duration: 3 }]);
    let nextId = 0; const copy = assemblyProject(source, session.state, { id: "copy", title: "Two sections" }, () => `id-${++nextId}`);
    const sections = copy.clips.filter(clip => clip.kind === "video");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ start: 0, duration: 3, trimIn: 2, speed: 2 });
    expect(sections[1]).toMatchObject({ start: 3, duration: 3, trimIn: 8, speed: 2 });
    expect(copy.clips.find(clip => clip.kind === "text")).toMatchObject({ start: 4, duration: 1, text: "Second section" });
    expect(copy.clips.filter(clip => clip.kind === "audio")).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(before);
    session.undo(); expect(session.state.shots).toEqual([{ id: "one", offset: 0, duration: 6 }]);
  });

  it("keeps source identity separate from collision-safe range identity and rejects malformed parts", () => {
    expect(assemblyShotKey({ id: 'one",1', offset: 0, duration: 1 })).not.toBe(assemblyShotKey({ id: "one", part: 1, offset: 0, duration: 1 }));
    const source = project(), first = { id: "one", offset: 0, duration: 1 };
    for (const part of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assemblyProject(source, { shots: [first, { ...first, part, offset: 2 }], transition: null, soundId: null }, { id: "copy", title: "Invalid" }, () => "id")).toThrow("assembly_invalid");
    }
    expect(() => assemblyProject(source, { shots: [first, { ...first, offset: 2 }], transition: null, soundId: null }, { id: "copy", title: "Duplicate" }, () => "id")).toThrow("assembly_invalid");
  });

  it("routes explicit assembly while leaving generation, captions, edits and highlights alone", () => {
    expect(assemblyRequest("Create a 10 second video from my clips with fades and music")).toEqual(request);
    expect(assemblyRequest("Combine selected photos without music")).toMatchObject({ selected: true, music: false });
    expect(assemblyRequest("Peux-tu créer une vidéo de 10 secondes à partir de mes clips avec musique")).toMatchObject({ seconds: 10, music: true });
    for (const text of ["Create a photo using my images", "Create captions from my video", "Generate a video of a forest", "Split this video into ten clips", "Create highlights from my video"]) expect(assemblyRequest(text)).toBeNull();
  });
  it("honours coordinated exclusions in either order, comma lists and named-file requests", () => {
    for (const suffix of ["without music or transitions", "without transitions and music", "no fades, music or transitions", "no music and no transitions", "without music, fades, and transitions"]) {
      expect(assemblyRequest(`Create a 6 second video from editor-multiple-scenes-source.mp4 ${suffix}`)).toMatchObject({ seconds: 6, transition: null, music: false, musicExcluded: true });
    }
    expect(assemblyRequest("Combiner les photos sélectionnées sans musique ni fondus")).toMatchObject({ selected: true, transition: null, music: false });
  });
  it("ends exclusion lists before positive instructions and ignores words inside filenames", () => {
    expect(assemblyRequest("Create a video from my clips without music with fades")).toMatchObject({ transition: "fade", music: false });
    expect(assemblyRequest("Create a video from my clips without transitions with music")).toMatchObject({ transition: null, music: true });
    expect(assemblyRequest('Create a video from "No Music.mp4" with transitions and music')).toMatchObject({ transition: "fade", music: true, musicExcluded: false });
  });
  it("removes draft music and transitions together in one undoable review change", () => {
    const source = project(), before = JSON.stringify(source);
    const session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
    session.start(request, []);
    const shots = session.state.shots;
    expect(session.state).toMatchObject({ transition: "fade", soundId: "sound" });
    expect(session.review("without music or transitions")).toBe(true);
    expect(session.state).toMatchObject({ transition: null, soundId: null, shots });
    session.undo(); expect(session.state).toMatchObject({ transition: "fade", soundId: "sound", shots });
    expect(JSON.stringify(source)).toBe(before);
  });
  it("does not partially execute a coordinated review with unrecognised instructions", () => {
    const source = project(), session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
    session.start(request, []);
    expect(session.review("without music or transitions and delete the original project")).toBe(false);
    expect(session.state).toMatchObject({ transition: "fade", soundId: "sound" });
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

  it("retains trimmed picture-in-picture videos and image backgrounds with their source stacking, motion and audio", () => {
    const source = project();
    const backdrop: MediaClip = { id: "backdrop", mediaId: "backdrop-file", kind: "image", trackId: "b", start: 9, duration: 9, trimIn: 0, fit: "cover" };
    const pip: MediaClip = { id: "pip", mediaId: "pip-file", kind: "video", trackId: "p", start: 10.5, duration: 6, trimIn: 3, speed: 0.5, sourceDuration: 10,
      transform: { x: 0.8, y: 0.2, scale: 0.25, rotation: 12, opacity: 0.7 }, crop: { left: 0.1, right: 0, top: 0, bottom: 0.1 }, effects: { grayscale: 0.5 },
      keyframes: { x: [{ t: 0, v: 0.7 }, { t: 6, v: 0.9 }] }, audio: { volume: 0.35, fadeIn: 1 }, animateIn: { kind: "fade", duration: 1 } };
    source.clips.push(backdrop, pip); source.tracks.find(t => t.id === "p")!.muted = true;
    const before = JSON.stringify(source); let id = 0;
    const copy = assemblyProject(source, { shots: [{ id: "one", offset: 1, duration: 4 }], transition: null, soundId: null }, { id: "copy", title: "Pip" }, () => `pip-copy-${++id}`);
    const main = copy.clips.find(c => c.kind === "video" && c.mediaId === "source")!;
    const background = copy.clips.find(c => c.kind === "image" && c.mediaId === "backdrop-file")!;
    const overlay = copy.clips.find(c => c.kind === "video" && c.mediaId === "pip-file") as MediaClip;
    expect([background.start, background.duration, background.trimIn]).toEqual([0, 4, 0]);
    expect([overlay.start, overlay.duration, overlay.trimIn, overlay.speed]).toEqual([0, 4, 3.25, 0.5]);
    expect(overlay.transform).toEqual(pip.transform); expect(overlay.crop).toEqual(pip.crop); expect(overlay.effects).toEqual(pip.effects);
    expect(overlay.keyframes?.x?.map(k => k.t)).toEqual([-0.5, 5.5]); expect(overlay.audio?.envelope?.[0].time).toBe(-0.5);
    expect(overlay.audio?.volume).toBe(0.35); expect(overlay.animateIn).toBeUndefined(); expect(overlay.transitionOut).toBeUndefined();
    expect(copy.tracks.find(t => t.id === overlay.trackId)?.muted).toBe(true);
    expect(copy.tracks.findIndex(t => t.id === background.trackId)).toBeLessThan(copy.tracks.findIndex(t => t.id === main.trackId));
    expect(copy.tracks.findIndex(t => t.id === overlay.trackId)).toBeGreaterThan(copy.tracks.findIndex(t => t.id === main.trackId));
    expect(JSON.stringify(source)).toBe(before);
  });
  it("does not duplicate chosen primary shots as overlays when their source times overlap", () => {
    const source = project(); source.clips[1] = { ...photo, start: 11, duration: 4 };
    let id = 0; const copy = assemblyProject(source, plan(), { id: "copy", title: "Chosen" }, () => `chosen-${++id}`);
    expect(copy.clips.filter(c => c.kind === "video" || c.kind === "image")).toHaveLength(2);
    expect(copy.clips.filter(c => c.kind === "video" && c.mediaId === "source")).toHaveLength(1);
    expect(copy.clips.filter(c => c.kind === "image" && c.mediaId === "photo")).toHaveLength(1);
  });
  it("holds a photo's image overlay without stretching its picture-in-picture footage or narration", () => {
    const source = project(); source.clips = [photo,
      { ...photo, id: "image-overlay", mediaId: "logo", trackId: "b" },
      { ...video, id: "moving-overlay", mediaId: "motion", trackId: "v", start: 20, duration: 6, trimIn: 0, speed: 1 },
      { ...sound, start: 20 }];
    let id = 0; const copy = assemblyProject(source, { shots: [{ id: "two", offset: 0, duration: 15 }], transition: null, soundId: null }, { id: "copy", title: "Held" }, () => `hold-${++id}`);
    expect(copy.clips.find(c => c.kind === "image" && c.mediaId === "logo")?.duration).toBe(15);
    expect(copy.clips.find(c => c.kind === "video" && c.mediaId === "motion")?.duration).toBe(6);
    expect(copy.clips.find(c => c.kind === "audio")?.duration).toBe(3);
  });
  it("clips moving overlays at their available source length and keeps hidden/locked layers editable without making them visible", () => {
    const source = project(); source.clips.push({ ...video, id: "short-overlay", mediaId: "short", trackId: "p", start: 10, duration: 8, trimIn: 4, speed: 2, sourceDuration: 8, hidden: true, locked: true });
    source.tracks.find(t => t.id === "p")!.hidden = true;
    let id = 0; const copy = assemblyProject(source, { shots: [{ id: "one", offset: 1, duration: 4 }], transition: null, soundId: null }, { id: "copy", title: "Bounded" }, () => `bound-${++id}`);
    const overlay = copy.clips.find(c => c.kind === "video" && c.mediaId === "short") as MediaClip;
    expect([overlay.start, overlay.duration, overlay.trimIn]).toEqual([0, 1, 6]);
    expect(overlay.hidden).toBe(true); expect(overlay.locked).toBe(true); expect(copy.tracks.find(t => t.id === overlay.trackId)?.hidden).toBe(true);
  });
  it("keeps each overlay fragment aligned across reordered primary shots", () => {
    const source = project(); source.clips.push({ ...photo, id: "logo-overlay", mediaId: "logo", trackId: "b", start: 11, duration: 12 });
    const reordered = { ...plan(), shots: [...plan().shots].reverse() }; let id = 0;
    const copy = assemblyProject(source, reordered, { id: "copy", title: "Reordered" }, () => `order-${++id}`);
    expect(copy.clips.filter(c => c.kind === "image" && c.mediaId === "logo").map(c => [c.start, c.duration])).toEqual([[0, 3], [3, 4]]);
    expect(new Set(copy.clips.map(c => c.id)).size).toBe(copy.clips.length);
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

it("refreshes changed structural ranges while preserving typed numeric drafts and reordered sections", () => {
  const source = project(), session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
  session.start({ seconds: 6, selected: true, transition: null, music: false }, ["one"]);
  const key = assemblyShotKey(session.state.shots[0]), originalScope = session.state.shotScopes![key];
  session.range(key, 0, 2);
  expect(session.state.shotScopes![key]).toBe(originalScope);
  session.split(0);
  expect(session.state.shots.map(shot => shot.duration)).toEqual([1, 1]);
  expect(session.state.shotScopes![key]).not.toBe(originalScope);
  const splitScopes = { ...session.state.shotScopes };
  session.move(1, -1);
  expect(session.state.shotScopes).toEqual(splitScopes);
  const movedKey = assemblyShotKey(session.state.shots[0]);
  session.range(movedKey, Number.NaN, 1);
  expect(session.state.shotScopes![movedKey]).toBe(splitScopes[movedKey]);
  expect(session.state.error).toBe("limit");
  session.undo();
  expect(session.state.shots[0].offset).toBe(1);
  expect(session.state.shotScopes![movedKey]).not.toBe(splitScopes[movedKey]);
});

it("refreshes surviving numeric fields when source selection reallocates the duration", () => {
  const source = project(), session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
  session.start({ seconds: 8, selected: false, transition: null, music: false }, [], [{ id: "extra", kind: "image", name: "Extra" }]);
  const photoKey = assemblyShotKey(session.state.shots.find(shot => shot.id === "two")!);
  const initialScope = session.state.shotScopes![photoKey];
  expect(session.state.shots.find(shot => shot.id === "two")!.duration).toBe(4);
  session.remove(0);
  expect(session.state.shots).toEqual([{ id: "two", offset: 0, duration: 8 }]);
  expect(session.state.shotScopes![photoKey]).not.toBe(initialScope);
});
