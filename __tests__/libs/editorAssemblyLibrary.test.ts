import { AssemblySession, assemblyDuration, assemblyProject, type AssemblyPlan } from "../../libs/editor/assembly";
import { assemblyCatalog, assemblyCatalogMatches, assemblyLibrarySource, assemblyPreviewProject, type AssemblyAsset } from "../../libs/editor/assemblyLibrary";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const project = (): ProjectSnapshot => ({ id: "source", title: "Original", clips: [], tracks: [],
  settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000", pages: [0, 5] }, updatedAt: 1 });
const assets: AssemblyAsset[] = [
  { id: "photo-a", name: "First photo.png", kind: "image", width: 640, height: 360, size: 100 },
  { id: "photo-b", name: "Second photo.png", kind: "image", width: 640, height: 360, size: 200 },
  { id: "video", name: "Footage.mp4", kind: "video", duration: 6, size: 300 },
  { id: "music", name: "Music.wav", kind: "audio", duration: 3, size: 400 },
];
const request = { seconds: 10, selected: false, transition: "fade" as const, music: true };
const id = (asset: string) => `@assembly-library:${asset}`;
const plan = (): AssemblyPlan => ({ shots: [{ id: id("video"), offset: 1, duration: 4 }, { id: id("photo-a"), offset: 0, duration: 6 }], transition: "fade", soundId: id("music") });

describe("assembly from actual imported files", () => {
  it("offers each usable imported file once without changing the original or duplicating used media", () => {
    const source = project();
    source.tracks.push({ id: "v", kind: "video", name: "Video", hidden: false, muted: false });
    source.clips.push({ id: "existing", mediaId: "photo-a", trackId: "v", kind: "image", start: 5, duration: 5, trimIn: 0 });
    const before = JSON.stringify(source);
    const catalog = [...assets, assets[0], { id: "unknown", name: "Unprobed.mp4", kind: "video" as const },
      { id: "matte", name: ".dehub-video-matte-private.mp4", kind: "video" as const, duration: 5 }];
    const pool = assemblyLibrarySource(source, catalog);
    expect(pool.clips.map(c => c.id)).toEqual(["existing", id("photo-b"), id("video"), id("music")]);
    expect(pool.clips[2]).toMatchObject({ mediaId: "video", trimIn: 0, duration: 6, sourceDuration: 6, fit: "contain" });
    expect(assemblyCatalog(catalog)).toEqual(assets);
    expect(JSON.stringify(source)).toBe(before);
    const collision = { ...source, clips: [{ ...source.clips[0], id: id("photo-b") }] };
    expect(assemblyLibrarySource(collision, assets).clips.filter(c => c.id === id("photo-b"))).toHaveLength(1);
  });
  it("opens an empty source review, allocates the requested time to chosen files and keeps manual ranges", () => {
    const source = project(), before = JSON.stringify(source);
    const session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
    session.start(request, [], assets);
    expect(session.state.error).toBeNull(); expect(session.state.shots).toEqual([]);
    expect(session.state.media.map(c => c.mediaId)).toEqual(["photo-a", "photo-b", "video"]);
    session.toggle(id("photo-b")); expect(session.state.shots).toEqual([{ id: id("photo-b"), offset: 0, duration: 10 }]);
    session.toggle(id("photo-a")); expect(session.state.shots.map(s => [s.id, s.duration])).toEqual([[id("photo-b"), 5], [id("photo-a"), 5]]);
    session.sound(id("music")); expect(assemblyDuration(session.state)).toBe(10);
    session.range(id("photo-b"), 0, 2); session.toggle(id("video"));
    expect(session.state.shots[0].duration).toBe(2); expect(session.state.shots[1].duration).toBe(5);
    expect(session.state.soundId).toBe(id("music")); expect(JSON.stringify(source)).toBe(before);
  });
  it("never automatically chooses unrelated global files and keeps insufficient footage blocked after changing music", async () => {
    const source = project(); source.clips = [{ id: "existing", mediaId: "on-timeline", kind: "video", trackId: "v", start: 0, duration: 12, trimIn: 0 }];
    source.tracks = [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }];
    const session = new AssemblySession({ current: () => source, library: () => assets, create: async () => true }, () => {});
    session.start(request, [], assets); expect(session.state.shots.map(s => s.id)).toEqual(["existing"]);
    session.toggle("existing"); session.toggle(id("video")); expect(session.state.error).toBe("limit");
    session.sound(id("music")); session.transition(null);
    expect(session.state.error).toBe("limit"); expect(await session.create()).toBe(false);
    session.toggle(id("photo-a")); expect(session.state.error).toBeNull(); expect(assemblyDuration(session.state)).toBe(10);
  });
  it("builds an independent copy from real media, trims footage, holds photos and loops music at its original level", () => {
    const source = project(); source.tracks = [{ id: "t", kind: "text", name: "Caption", hidden: false, muted: false }];
    source.clips = [{ id: "caption", trackId: "t", kind: "text", start: 0, duration: 10, trimIn: 0, text: "Unrelated caption", fontFamily: "Arial", fontSize: 20, fontWeight: 400, color: "#fff", align: "centre", x: 0.5, y: 0.5 }];
    const before = JSON.stringify(source); let sequence = 0;
    const copy = assemblyProject(source, plan(), { id: "copy", title: "Assembled" }, () => `new-${++sequence}`, assets);
    expect(copy.clips.filter(c => c.kind !== "audio").map(c => [c.kind, c.start, c.duration, c.trimIn])).toEqual([["video", 0, 4, 1], ["image", 4, 6, 0]]);
    const music = copy.clips.filter(c => c.kind === "audio") as MediaClip[];
    expect(music.map(c => [c.mediaId, c.start, c.duration, c.audio?.volume ?? 1])).toEqual([["music", 0, 3, 1], ["music", 3, 3, 1], ["music", 6, 3, 1], ["music", 9, 1, 1]]);
    expect(copy.settings.pages).toBeUndefined(); expect(copy.clips.some(c => c.kind === "text")).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
    const session = new AssemblySession({ current: () => source, create: async () => true }, () => {});
    session.start({ ...request, seconds: 4 }, [], assets); session.toggle(id("video")); session.range(id("video"), 1, 4);
    const selected = session.preview(0)!; expect(selected.libraryClip).toMatchObject({ mediaId: "video", start: 0, trimIn: 1, duration: 4 });
    const preview = assemblyPreviewProject(source, selected.libraryClip!);
    expect(preview.id).not.toBe(source.id); expect(preview.clips).toHaveLength(1); expect(preview.settings.pages).toBeUndefined();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("rejects missing, replaced and unknown selections while ignoring changes to unchosen imports", async () => {
    const source = project(), chosen = plan();
    expect(assemblyCatalogMatches(source, chosen, assets, assets.filter(a => a.id !== "video"))).toBe(false);
    expect(assemblyCatalogMatches(source, chosen, assets, assets.map(a => a.id === "video" ? { ...a, duration: 7 } : a))).toBe(false);
    expect(assemblyCatalogMatches(source, { ...chosen, shots: [{ id: "fabricated", offset: 0, duration: 1 }] }, assets, assets)).toBe(false);
    expect(assemblyCatalogMatches(source, chosen, assets, assets.map(a => a.id === "photo-b" ? { ...a, size: 999 } : a))).toBe(true);
    let calls = 0;
    const session = new AssemblySession({ current: () => source, library: () => [], create: async () => { calls++; return true; } }, () => {});
    session.start(request, [], assets); session.toggle(id("photo-a"));
    expect(await session.create()).toBe(false); expect(session.state.error).toBe("changed"); expect(calls).toBe(0);
  });
  it("cancels asynchronous file validation and stops stale or duplicate creation before saving", async () => {
    for (const stop of ["cancel", "source", "success"] as const) {
      let current = project(), release!: (value: AssemblyAsset[]) => void, calls = 0;
      const source = current;
      const session = new AssemblySession({ current: () => current,
        library: () => new Promise<AssemblyAsset[]>(resolve => { release = resolve; }),
        create: async (original, chosen, signal, catalog) => {
          calls++; expect(original).toBe(source); expect(chosen.shots).toHaveLength(1); expect(catalog).toEqual(assets); expect(signal.aborted).toBe(false); return true;
        } }, () => {});
      session.start(request, [], assets); session.toggle(id("photo-a")); const pending = session.create();
      expect(await session.create()).toBe(false);
      if (stop === "cancel") session.reset();
      if (stop === "source") current = { ...source, clips: [...source.clips] };
      release(assets); expect(await pending).toBe(stop === "success"); expect(calls).toBe(stop === "success" ? 1 : 0);
      expect(source.clips).toEqual([]);
    }
  });
});
