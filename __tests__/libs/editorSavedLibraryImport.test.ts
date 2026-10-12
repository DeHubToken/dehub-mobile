import { openLibraryAssetInEditor } from "../../libs/editor/openLibraryAssetInEditor";
import { importGeneratedMedia } from "../../libs/editor/importGeneratedMedia";
import { saveProject } from "../../libs/editor/storage";
import type { CreatorAsset } from "../../services/creator.service";
import type { MediaMeta } from "../../libs/editor/storage";

jest.mock("../../libs/editor/importGeneratedMedia", () => ({ importGeneratedMedia: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ saveProject: jest.fn() }));
const source = { id: "saved-media", prompt: "Saved source", modelName: "Creator", createdAt: 1, url: "https://media.example/source" };
const media = (kind: "image" | "video" | "audio"): MediaMeta => ({ id: "imported", name: `source.${kind === "image" ? "png" : kind === "video" ? "mp4" : "wav"}`, kind, width: 1080, height: 1920, duration: kind === "audio" ? 14.14 : 6, mimeType: kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/wav", file: "imported-media", createdAt: 1, size: 20 });
beforeEach(() => { jest.clearAllMocks(); });

it.each(["image", "video", "audio"] as const)("opens a complete saved %s source without starting a generation", async kind => {
  jest.mocked(importGeneratedMedia).mockResolvedValue(media(kind));
  const signal = new AbortController().signal, onOpen = jest.fn();
  expect(await openLibraryAssetInEditor({ ...source, kind }, { signal, isCurrent: () => true, onOpen })).toBe(true);
  expect(importGeneratedMedia).toHaveBeenCalledWith({ url: source.url, kind, name: source.prompt }, signal);
  const project = jest.mocked(saveProject).mock.calls[0][0];
  expect(project.clips).toHaveLength(1);
  expect(project.clips[0]).toMatchObject({ kind, mediaId: "imported" });
  if (kind !== "image") expect(project.clips[0].duration).toBe(kind === "audio" ? 14.14 : 6);
  expect(onOpen).toHaveBeenCalledWith(project.id);
});

it.each(["cancel", "account"])("ignores a late import after %s changes", async change => {
  let finish!: (value: MediaMeta) => void;
  jest.mocked(importGeneratedMedia).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(), onOpen = jest.fn(); let active = true;
  const pending = openLibraryAssetInEditor({ ...source, kind: "video" }, { signal: controller.signal, isCurrent: () => active, onOpen });
  if (change === "cancel") controller.abort(); else active = false;
  finish(media("video")); expect(await pending).toBe(false);
  expect(saveProject).not.toHaveBeenCalled(); expect(onOpen).not.toHaveBeenCalled();
});

it("keeps unsupported 3D models out of the timeline", async () => {
  await expect(openLibraryAssetInEditor({ ...source, kind: "model3d" } as CreatorAsset, { signal: new AbortController().signal, isCurrent: () => true, onOpen: jest.fn() })).rejects.toThrow();
  expect(importGeneratedMedia).not.toHaveBeenCalled(); expect(saveProject).not.toHaveBeenCalled();
});
