import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { shareEditorFile } from "../../libs/editor/shareEditorFile";
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

describe("finished local export sharing", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, uri: "file:///cache/edit.mp4", size: 1234, modificationTime: 1 }); jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true); jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined); });
  it.each([["video/mp4", "public.mpeg-4"], ["image/png", "public.png"], ["image/jpeg", "public.jpeg"], ["image/gif", "com.compuserve.gif"], ["application/zip", "public.zip-archive"]])("opens the device picker for %s", async (mimeType, UTI) => {
    await shareEditorFile("file:///cache/edit.mp4", mimeType);
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/edit.mp4", { mimeType, UTI });
  });
  it("never shares a source URL, missing file or cancelled export", async () => {
    await expect(shareEditorFile("https://example.com/video.mp4", "video/mp4")).rejects.toThrow("unavailable");
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false, isDirectory: false, uri: "file:///cache/edit.mp4" });
    await expect(shareEditorFile("file:///cache/edit.mp4", "video/mp4")).rejects.toThrow("unavailable");
    const controller = new AbortController(); controller.abort();
    await expect(shareEditorFile("file:///cache/edit.mp4", "video/mp4", controller.signal)).rejects.toHaveProperty("name", "AbortError");
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
  it("keeps a device without file sharing from starting a transfer", async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(shareEditorFile("file:///cache/edit.mp4", "video/mp4")).rejects.toThrow("Sharing unavailable");
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
