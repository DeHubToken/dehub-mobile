import { importGeneratedMedia } from "../../libs/editor/importGeneratedMedia";
import { probeGeneratedMedia } from "../../libs/editor/generatedMediaProbe";
import { importPicture, importClipFile } from "../../libs/editor/storage";
import * as FileSystem from "expo-file-system/legacy";

jest.mock("../../libs/editor/generatedMediaProbe", () => ({ probeGeneratedMedia: jest.fn(), throwIfImportAborted: (signal?: AbortSignal) => { if (signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" }); } }));
jest.mock("../../libs/editor/storage", () => ({ importPicture: jest.fn(), importClipFile: jest.fn(), MAX_MEDIA_BYTES: 400 * 1024 * 1024, MediaTooLargeError: class extends Error {} }));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "cache/", EncodingType: { Base64: "base64" }, downloadAsync: jest.fn(), getInfoAsync: jest.fn(), writeAsStringAsync: jest.fn(), moveAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, headers: { "Content-Type": "audio/wav" } } as never);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 100 } as never);
  jest.mocked(probeGeneratedMedia).mockResolvedValue({ duration: 12.5, width: 1920, height: 1080 });
  jest.mocked(importClipFile).mockResolvedValue({ id: "audio-1", kind: "audio", duration: 12.5 } as never);
  jest.mocked(importPicture).mockResolvedValue({ id: "picture-1", kind: "image" } as never);
});

it("retains WAV response type and complete duration despite the provider's MP3 URL", async () => {
  expect(await importGeneratedMedia({ url: "https://media.example/voice.mp3", kind: "audio", name: "A new voice" })).toMatchObject({ duration: 12.5 });
  expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio", mimeType: "audio/wav", fileName: "a-new-voice.wav", duration: 12.5 }));
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: expect.stringMatching(/\.mp3$/), to: expect.stringMatching(/\.wav$/) });
  expect(probeGeneratedMedia).toHaveBeenCalledWith(expect.stringMatching(/\.wav$/), "audio", undefined);
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});
it("preserves a PNG image through picture storage rather than treating it as video", async () => {
  await importGeneratedMedia({ url: "data:image/png;base64,aGVsbG8=", kind: "image", name: "Transparent image" });
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  expect(importPicture).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/png", width: 1920, height: 1080, fileName: "transparent-image.png" }));
  expect(importClipFile).not.toHaveBeenCalled();
});
it.each([403, 500])("rejects an HTTP %s result and removes its temporary file", async status => {
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status } as never);
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" })).rejects.toThrow();
  expect(importClipFile).not.toHaveBeenCalled(); expect(probeGeneratedMedia).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});
it("rejects HTML, empty files and oversized media before decoder/storage work", async () => {
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, headers: { "content-type": "text/html" } } as never);
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" })).rejects.toThrow();
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 0 } as never);
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" })).rejects.toThrow("Empty");
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 401 * 1024 * 1024 } as never);
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" })).rejects.toThrow("too large");
  expect(probeGeneratedMedia).not.toHaveBeenCalled(); expect(importClipFile).not.toHaveBeenCalled();
});
it("stops a late result after leaving the screen and cleans up failed metadata", async () => {
  const controller = new AbortController();
  jest.mocked(FileSystem.downloadAsync).mockImplementation(async () => { controller.abort(); return { status: 200 } as never; });
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(importClipFile).not.toHaveBeenCalled(); expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, headers: { "content-type": "video/mp4" } } as never);
  jest.mocked(probeGeneratedMedia).mockRejectedValue(new Error("Unsupported codec"));
  await expect(importGeneratedMedia({ url: "https://media.example/video.mp4", kind: "video" })).rejects.toThrow("Unsupported codec");
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2); expect(importClipFile).not.toHaveBeenCalled();
});
it("rejects browser-only or invalid URLs without downloading anything", async () => {
  for (const url of ["javascript:bad", "blob:provider", "file:///unrelated", "data:image/png,unencoded"]) {
    await expect(importGeneratedMedia({ url, kind: "image" })).rejects.toThrow();
  }
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled(); expect(importPicture).not.toHaveBeenCalled();
});
