import { importStockAsset, importStockItem, importStockLibraryItem, searchStockPage, pickStock } from "../../libs/editor/stock";
import { searchFreeAssets } from "../../libs/editor/freeAssets";
import { importClipFile, importPicture } from "../../libs/editor/storage";
import { probeGeneratedMedia } from "../../libs/editor/generatedMediaProbe";
import * as FileSystem from "expo-file-system/legacy";
jest.mock("../../libs/editor/freeAssets", () => ({ searchFreeAssets: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ importClipFile: jest.fn(), importPicture: jest.fn(), MAX_MEDIA_BYTES: 500 * 1024 * 1024, MediaTooLargeError: class extends Error {} }));
jest.mock("../../libs/editor/generatedMediaProbe", () => ({ probeGeneratedMedia: jest.fn(), throwIfImportAborted: (signal?: AbortSignal) => { if (signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" }); } }));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "cache/", createDownloadResumable: jest.fn(), getInfoAsync: jest.fn(), moveAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}) }));
const download = jest.fn(), cancel = jest.fn();
const clip = { title: "Ocean", downloadUrl: "https://example.com/ocean.webm", mimeType: "video/webm", duration: 12, source: "Wikimedia Commons", landingUrl: "https://example.com/source", creator: "Creator", license: "CC BY 4.0", attributionRequired: true, attributionText: "Ocean by Creator" };
beforeEach(() => {
  jest.clearAllMocks(); download.mockResolvedValue({ uri: "cache/download.webm", status: 200 }); cancel.mockResolvedValue(undefined);
  jest.mocked(FileSystem.createDownloadResumable).mockReturnValue({ downloadAsync: download, cancelAsync: cancel } as never);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 100 } as never);
  jest.mocked(probeGeneratedMedia).mockResolvedValue({ duration: 12, width: 1920, height: 1080 });
});
it("imports a real video with its duration and source credit", async () => {
  jest.mocked(searchFreeAssets).mockResolvedValue({ items: [clip] } as never);
  jest.mocked(importClipFile).mockResolvedValue({ id: "video1", kind: "video" } as never);
  expect(await importStockAsset("ocean", "landscape", "video")).toMatchObject({ kind: "video" });
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "video", duration: 12, provenance: expect.objectContaining({ attributionRequired: true, attributionText: "Ocean by Creator" }) }));
  expect(importPicture).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});
it("imports sound as audio and deletes the temporary download on failure", async () => {
  const audio = { ...clip, mimeType: "audio/ogg", duration: 4 };
  jest.mocked(probeGeneratedMedia).mockResolvedValue({ duration: 4, width: 0, height: 0 });
  jest.mocked(importClipFile).mockResolvedValue({ id: "audio1", kind: "audio" } as never);
  await importStockItem(audio, "audio");
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio", duration: 4 }));
  download.mockResolvedValue({ uri: "cache/fail.ogg", status: 403 } as FileSystem.FileSystemDownloadResult);
  expect(await importStockItem(audio, "audio")).toBeNull();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
});
it("rejects oversized-duration stock and mismatched media", () => {
  expect(pickStock([{ ...clip, duration: 200 }, { ...clip, mimeType: "image/jpeg" }], "video")).toBeUndefined();
  expect(pickStock([{ ...clip, mimeType: "audio/ogg" }], "audio")).toBeDefined();
});
it("requests the selected stock type, shape and next provider page", async () => {
  const controller = new AbortController();
  jest.mocked(searchFreeAssets).mockResolvedValue({ items: [], page: 2, hasMore: true } as never);
  expect(await searchStockPage("abstract", "portrait", "animation", 2, controller.signal)).toMatchObject({ page: 2, hasMore: true });
  expect(searchFreeAssets).toHaveBeenCalledWith({ kind: "animation", query: "abstract", orientation: "portrait", page: 2, signal: controller.signal });
});
it("imports motion assets as video without treating them as pictures", async () => {
  jest.mocked(importClipFile).mockResolvedValue({ id: "motion", kind: "video" } as never);
  expect(await importStockLibraryItem(clip, "animation")).toMatchObject({ kind: "video" });
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "video", duration: 12 }));
  expect(importPicture).not.toHaveBeenCalled();
});
it.each([["graphic", "image/svg+xml", "svg"], ["gif", "image/gif", "gif"]] as const)("keeps %s source format and credits through import", async (kind, mimeType, ext) => {
  jest.mocked(importPicture).mockResolvedValue({ id: "art", kind: "image" } as never);
  expect(await importStockLibraryItem({ ...clip, mimeType }, kind)).toMatchObject({ kind: "image" });
  expect(importPicture).toHaveBeenCalledWith(expect.objectContaining({ mimeType, fileName: `Ocean.${ext}`, provenance: expect.objectContaining({ attributionText: "Ocean by Creator" }) }));
});
it("rejects a provider file whose media type does not match its stock category", async () => {
  expect(await importStockLibraryItem(clip, "gif")).toBeNull();
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
});

it("imports the entire downloaded soundtrack when the provider omits or understates duration", async () => {
  jest.mocked(probeGeneratedMedia).mockResolvedValue({ duration: 28.5, width: 0, height: 0 });
  const audio = { ...clip, downloadUrl: "https://media.example/song.mp3", mimeType: "audio/mpeg", duration: undefined };
  await importStockItem(audio, "audio");
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ duration: 28.5, kind: "audio", provenance: expect.objectContaining({ attributionText: "Ocean by Creator" }) }));
  await importStockItem({ ...audio, duration: 5 }, "audio");
  expect(importClipFile).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 28.5 }));
});
it("uses the actual downloaded codec before probing and storing the soundtrack", async () => {
  download.mockResolvedValue({ status: 200, headers: { "Content-Type": "audio/x-wav" } });
  jest.mocked(probeGeneratedMedia).mockResolvedValue({ duration: 28.5, width: 0, height: 0 });
  await importStockItem({ ...clip, downloadUrl: "https://media.example/song.mp3", mimeType: "audio/mpeg" }, "audio");
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: expect.stringMatching(/\.mp3$/), to: expect.stringMatching(/\.wav$/) });
  expect(probeGeneratedMedia).toHaveBeenCalledWith(expect.stringMatching(/\.wav$/), "audio", undefined);
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "audio/wav", fileName: "Ocean.wav", duration: 28.5 }));
});
it("rejects error pages, empty downloads and oversized files before probing", async () => {
  download.mockResolvedValue({ status: 200, headers: { "content-type": "text/html" } });
  expect(await importStockItem(clip, "video")).toBeNull();
  download.mockResolvedValue({ status: 200 });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 0 } as never);
  expect(await importStockItem(clip, "video")).toBeNull();
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 501 * 1024 * 1024 } as never);
  expect(await importStockItem(clip, "video")).toBeNull();
  expect(probeGeneratedMedia).not.toHaveBeenCalled(); expect(importClipFile).not.toHaveBeenCalled();
});
it("stops a cancelled stock transfer without importing its late result", async () => {
  let finish!: (value: undefined) => void;
  download.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  cancel.mockImplementation(async () => { finish(undefined); });
  const controller = new AbortController();
  const pending = importStockItem(clip, "video", controller.signal); controller.abort();
  expect(cancel).toHaveBeenCalledTimes(1); expect(await pending).toBeNull();
  expect(probeGeneratedMedia).not.toHaveBeenCalled(); expect(importClipFile).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});
