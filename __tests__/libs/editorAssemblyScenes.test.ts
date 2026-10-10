import { assemblyFocus, findAssemblyScenes, type AssemblyScene } from "../../libs/editor/assemblyScenes";
import { assemblyDuration, assemblyProject, assemblyRequest, AssemblySession, type AssemblyPlan } from "../../libs/editor/assembly";
import { visualSampleTimes, type VisualBatch } from "../../libs/editor/visualHighlightContract";
import type { VisualSampler } from "../../libs/editor/visualHighlights";
import type { AssemblyAsset } from "../../libs/editor/assemblyLibrary";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooorjPmD/9k=";

const video: MediaClip = { id: "video", kind: "video", mediaId: "private-video-id", trackId: "v", start: 4, duration: 12, trimIn: 2, speed: 2, sourceDuration: 30, audio: { volume: 0.4 }, transform: { x: 0.6, y: 0.4, scale: 0.8, rotation: 5, opacity: 0.9 } };
const photo: MediaClip = { id: "photo", kind: "image", mediaId: "private-photo-id", trackId: "p", start: 30, duration: 6, trimIn: 0 };
const project = (): ProjectSnapshot => ({ id: "source", title: "Private source title", clips: [{ ...video }, { ...photo }], tracks: [
  { id: "v", kind: "video", name: "Video", hidden: false, muted: false },
  { id: "p", kind: "video", name: "Photo", hidden: false, muted: false },
], settings: { width: 1080, height: 1920, fps: 30, aspectPreset: "9:16", background: "#000" }, updatedAt: 1 });
const request = { seconds: 6, selected: false, transition: "fade" as const, music: false, focus: "forest animals" };
const scene = (id = "video", offset = 6, duration = 6, score = 0.9): AssemblyScene => ({ id, offset, duration, score, text: "Deer beside forest trees" });
const frames: VisualSampler = async (_clip, windows, _signal, progress) => {
  progress(1);
  return windows.flatMap(window => visualSampleTimes(window).map(at => ({ windowId: window.id, at, dataUrl: JPEG })));
};
const assets: AssemblyAsset[] = [
  { id: video.mediaId, kind: "video", name: "movie.mp4", duration: 30 },
  { id: photo.mediaId, kind: "image", name: "photo.png" },
];

describe("content-aware assembly", () => {
  it("extracts a topic without sending ordinary join commands or named-file prompts to analysis", () => {
    expect(assemblyRequest("Create a 6 second video of forest animals from my clips without music")).toMatchObject({ seconds: 6, focus: "forest animals", music: false });
    expect(assemblyFocus("Create a montage showing a sunset using my photos with fades")).toBe("a sunset");
    expect(assemblyRequest("Combine selected clips into a 6 second video without music")?.focus).toBeUndefined();
    expect(assemblyRequest('Combine "movie.mp4" and "photo.png" showing forest animals')?.focus).toBeUndefined();
    expect(assemblyRequest("Generate a video of forest animals")).toBeNull();
  });

  it("samples a still once and real video windows, sending bounded frames and the topic without file identities", async () => {
    const clips = [{ ...video }, { ...photo, duration: 150 }];
    const before = JSON.stringify(clips), sampled: MediaClip[] = [], batches: VisualBatch[] = [];
    const result = await findAssemblyScenes(clips, "forest animals", { optIn: true }, async (...args) => { sampled.push(args[0]); return frames(...args); }, async batch => {
      batches.push(batch);
      const window = batch.windows.at(-1)!;
      return [{ start: window.start, end: window.end, score: batch.duration === 1 ? 0.95 : 0.9, text: "Deer beside forest trees" }];
    }, new AbortController().signal, () => {});
    expect(sampled[0]).toMatchObject({ duration: 12, trimIn: 2, speed: 2 });
    expect(sampled[1]).toMatchObject({ kind: "image", duration: 1, trimIn: 0, speed: 1 });
    expect(batches.map(batch => batch.frames.length)).toEqual([12, 6]);
    expect(result).toEqual([scene("photo", 0, 150, 0.95), scene()]);
    expect(batches.every(batch => batch.optIn && batch.focus === "forest animals")).toBe(true);
    expect(JSON.stringify(batches)).not.toContain("private-");
    expect(JSON.stringify(clips)).toBe(before);
  });

  it("requires opt-in and validates every chosen source before making a provider call", async () => {
    let sampled = 0, analysed = 0;
    for (const clips of [[{ ...video, duration: 0.5 }], [{ ...video }, { ...video, duration: 601 }], Array.from({ length: 11 }, (_, index) => ({ ...photo, id: String(index) }))]) {
      await expect(findAssemblyScenes(clips, "forest", { optIn: true }, async (...args) => { sampled++; return frames(...args); }, async () => { analysed++; return []; }, new AbortController().signal, () => {})).rejects.toThrow("assembly_scene_limit");
    }
    await expect(findAssemblyScenes([video], "forest", { optIn: false as unknown as true }, frames, async () => { analysed++; return []; }, new AbortController().signal, () => {})).rejects.toThrow("assembly_scene_limit");
    expect([sampled, analysed]).toEqual([0, 0]);
  });

  it("cancels before a provider request when sampling is interrupted", async () => {
    const controller = new AbortController(); let analysed = 0;
    await expect(findAssemblyScenes([video], "forest", { optIn: true }, async (...args) => { const result = await frames(...args); controller.abort(); return result; }, async () => { analysed++; return []; }, controller.signal, () => {})).rejects.toThrow("cancelled");
    expect(analysed).toBe(0);
  });

  it("creates the exact budget from matching ranges and retains source trims, rate, layout, sound and undo", async () => {
    const source = project(), before = JSON.stringify(source); let created: ProjectSnapshot | undefined;
    const session = new AssemblySession({ current: () => source, match: async () => [scene(), scene("photo", 0, 6, 0.95)], create: async (original, plan) => {
      let id = 0; created = assemblyProject(original, plan, { id: "copy", title: "Forest" }, () => `copy-${++id}`); return true;
    } }, () => {});
    session.start(request, []); const originalPlan = [...session.state.shots];
    expect(await session.match(true)).toBe(true);
    expect(session.state.shots).toEqual([{ id: "photo", offset: 0, duration: 3 }, { id: "video", offset: 6, duration: 3 }]);
    expect(assemblyDuration(session.state)).toBe(6);
    expect(session.state.sceneMatches?.video).toBe("Deer beside forest trees");
    session.undo(); expect(session.state.shots).toEqual(originalPlan); expect(session.state.sceneMatches).toEqual({});
    expect(await session.match(true)).toBe(true); expect(await session.create()).toBe(true);
    expect(created?.clips.find(clip => clip.kind === "video")).toMatchObject({ start: 3, duration: 3, trimIn: 14, speed: 2, transform: video.transform, audio: video.audio });
    expect(created?.settings).toEqual(source.settings); expect(JSON.stringify(source)).toBe(before);
  });

  it("does not fall back to unrelated footage after no match, too little footage or a provider failure", async () => {
    for (const failure of ["noMatch", "matchDuration", "matchFailed"] as const) {
      let created = 0;
      const source = project(); source.clips = [video];
      const session = new AssemblySession({ current: () => source, match: async () => {
        if (failure === "matchFailed") throw new Error("provider unavailable");
        return failure === "noMatch" ? [] : [scene("video", 6, 1)];
      }, create: async () => { created++; return true; } }, () => {});
      session.start(request, []); const before = [...session.state.shots];
      expect(await session.match(true)).toBe(false); expect(session.state.error).toBe(failure);
      expect(session.state.shots).toEqual(before); expect(await session.create()).toBe(false); expect(created).toBe(0);
    }
  });

  it("rejects invented identities, ranges, duplicates and confidence values", async () => {
    for (const answer of [[scene("foreign")], [scene("video", 11, 3)], [scene(), scene()], [scene("video", 6, 6, 0.5)]]) {
      const source = project();
      const session = new AssemblySession({ current: () => source, match: async () => answer, create: async () => true }, () => {});
      session.start(request, []); const before = [...session.state.shots];
      expect(await session.match(true)).toBe(false); expect(session.state.error).toBe("matchFailed");
      expect(session.state.shots).toEqual(before); expect(await session.create()).toBe(false);
    }
  });

  it("aborts further analysis when the source changes while a scan is in flight", async () => {
    let source = project(), report: ((fraction: number) => void) | undefined, signal: AbortSignal | undefined, finish: ((scenes: AssemblyScene[]) => void) | undefined;
    const session = new AssemblySession({ current: () => source, match: async (_clips, _focus, abort, progress) => { signal = abort; report = progress; return new Promise(resolve => { finish = resolve; }); }, create: async () => true }, () => {});
    session.start(request, []); const pending = session.match(true);
    source = { ...source, clips: [{ ...video, trimIn: 3 }, photo] }; report!(0.5);
    expect(signal?.aborted).toBe(true); finish!([scene()]);
    expect(await pending).toBe(false); expect(session.state.error).toBe("changed"); expect(session.state.busy).toBe(false);
  });

  it("drops late completion after closing the review", async () => {
    const source = project(); let finish: ((scenes: AssemblyScene[]) => void) | undefined;
    const session = new AssemblySession({ current: () => source, match: async () => new Promise(resolve => { finish = resolve; }), create: async () => true }, () => {});
    session.start(request, []); const pending = session.match(true); session.reset(); finish!([scene()]);
    expect(await pending).toBe(false); expect(session.state.sourceId).toBeNull(); expect(session.state.sceneMatches).toEqual({});
  });

  it("keeps an explicit named-file order despite confidence ranking", async () => {
    const source = project(); let saved: AssemblyPlan | undefined;
    const session = new AssemblySession({ current: () => source, library: () => assets, match: async () => [scene("photo", 0, 6, 0.99), scene()], create: async (_source, plan) => { saved = plan; return true; } }, () => {});
    session.start({ ...request, filePrompt: 'Combine "movie.mp4" then "photo.png" into a video' }, [], assets);
    expect(await session.match(true)).toBe(true); expect(session.state.shots.map(shot => shot.id)).toEqual(["video", "photo"]);
    expect(await session.create()).toBe(true); expect(saved?.shots.map(shot => shot.id)).toEqual(["video", "photo"]);
  });

  it("rejects a library selection removed during analysis", async () => {
    const source = project(); source.clips = [];
    let currentAssets = assets, finish: ((scenes: AssemblyScene[]) => void) | undefined;
    const session = new AssemblySession({ current: () => source, library: () => currentAssets, match: async () => new Promise(resolve => { finish = resolve; }), create: async () => true }, () => {});
    session.start(request, [], assets); session.toggle("@assembly-library:" + video.mediaId);
    const pending = session.match(true); currentAssets = []; finish!([scene("@assembly-library:" + video.mediaId, 6, 6)]);
    expect(await pending).toBe(false); expect(session.state.error).toBe("changed");
  });
});
