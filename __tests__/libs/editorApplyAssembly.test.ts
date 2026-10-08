import { createAssemblyEdit } from "../../libs/editor/applyAssembly";
import { getMedia, saveProject, type MediaMeta } from "../../libs/editor/storage";
import { getInfoAsync } from "expo-file-system/legacy";
import type { AssemblyPlan } from "../../libs/editor/assembly";
import type { ProjectSnapshot } from "../../libs/editor/types";

jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ getMedia: jest.fn(), mediaFileUri: (meta: { file: string }) => `file:///${meta.file}`, saveProject: jest.fn() }));

const original = (): ProjectSnapshot => ({ id: "source", title: "Original", clips: [], tracks: [],
  settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" }, updatedAt: 1 });
const media: MediaMeta[] = [
  { id: "photo", kind: "image", name: "Photo.png", mimeType: "image/png", width: 640, height: 360, file: "photo.png", size: 100, createdAt: 1 },
  { id: "music", kind: "audio", name: "Music.wav", mimeType: "audio/wav", width: 0, height: 0, duration: 3, file: "music.wav", size: 200, createdAt: 2 },
];
const plan: AssemblyPlan = { shots: [{ id: "@assembly-library:photo", offset: 0, duration: 10 }], transition: null, soundId: "@assembly-library:music" };

describe("native imported-file assembly persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getMedia).mockImplementation(async id => media.find(item => item.id === id) ?? null);
    jest.mocked(getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 100, uri: "file:///asset", modificationTime: 1 });
    jest.mocked(saveProject).mockResolvedValue(undefined);
  });
  it("checks real files, saves the unchanged original and copy, then commits the separate project", async () => {
    const source = original(), commit = jest.fn();
    expect(await createAssemblyEdit(source, plan, "Copy", { current: () => source, commit }, new AbortController().signal, media)).toBe(true);
    expect(jest.mocked(getInfoAsync).mock.calls.map(call => call[0])).toEqual(["file:///photo.png", "file:///music.wav"]);
    const saved = jest.mocked(saveProject).mock.calls.map(call => call[0]);
    expect(saved[0]).toBe(source); expect(saved[1].id).not.toBe(source.id); expect(saved[1].title).toBe("Copy");
    expect(saved[1].clips.filter(clip => clip.kind === "audio").map(clip => [clip.start, clip.duration])).toEqual([[0, 3], [3, 3], [6, 3], [9, 1]]);
    expect(commit).toHaveBeenCalledWith(source, saved[1]); expect(source.clips).toEqual([]);
  });
  it("refuses deleted metadata, missing or empty files and replaced media before saving", async () => {
    const source = original(), commit = jest.fn();
    for (const problem of ["metadata", "missing", "empty", "replaced"] as const) {
      jest.mocked(getMedia).mockImplementation(async id => problem === "metadata" ? null : { ...media.find(item => item.id === id)!, ...(problem === "replaced" ? { createdAt: 999 } : {}) });
      jest.mocked(getInfoAsync).mockResolvedValue(problem === "missing" ? { exists: false, isDirectory: false, uri: "file:///missing" } : { exists: true, isDirectory: false, uri: "file:///asset", size: problem === "empty" ? 0 : 100, modificationTime: 1 });
      expect(await createAssemblyEdit(source, plan, "Copy", { current: () => source, commit }, new AbortController().signal, media)).toBe(false);
    }
    expect(saveProject).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled(); expect(source.clips).toEqual([]);
  });
  it("does not save after cancelled validation and does not switch after cancellation or a source edit during saving", async () => {
    for (const stop of ["validation", "save", "changed"] as const) {
      const source = original(); let current = source; const commit = jest.fn(), controller = new AbortController();
      jest.mocked(getInfoAsync).mockImplementation(async () => { if (stop === "validation") controller.abort(); return { exists: true, isDirectory: false, size: 100, uri: "file:///asset", modificationTime: 1 }; });
      jest.mocked(saveProject).mockImplementation(async () => { if (stop === "save") controller.abort(); if (stop === "changed") current = { ...source, clips: [...source.clips] }; });
      expect(await createAssemblyEdit(source, plan, "Copy", { current: () => current, commit }, controller.signal, media)).toBe(false);
      expect(commit).not.toHaveBeenCalled(); expect(source.clips).toEqual([]);
    }
  });
});
