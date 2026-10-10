import { importStockAsset, importStockItem, importStockLibraryItem, searchStockPage, pickStock } from "../../libs/editor/stock";
import { searchFreeAssets } from "../../libs/editor/freeAssets";
import { importClipFile, importPicture } from "../../libs/editor/storage";
import * as FileSystem from "expo-file-system/legacy";
jest.mock("../../libs/editor/freeAssets", () => ({ searchFreeAssets: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ importClipFile: jest.fn(), importPicture: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "cache/", downloadAsync: jest.fn(), deleteAsync: jest.fn(async () => {}) }));
const clip = { title: "Ocean", downloadUrl: "https://example.com/ocean.webm", mimeType: "video/webm", duration: 12, source: "Wikimedia Commons", landingUrl: "https://example.com/source", creator: "Creator", license: "CC BY 4.0", attributionRequired: true, attributionText: "Ocean by Creator" };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ uri: "cache/download.webm", status: 200 } as FileSystem.FileSystemDownloadResult); });
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
  jest.mocked(importClipFile).mockResolvedValue({ id: "audio1", kind: "audio" } as never);
  await importStockItem(audio, "audio");
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio", duration: 4 }));
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ uri: "cache/fail.ogg", status: 403 } as FileSystem.FileSystemDownloadResult);
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
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});
