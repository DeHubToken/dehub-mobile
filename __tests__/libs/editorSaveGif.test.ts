import { saveGif } from "../../libs/editor/saveGif";
import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

jest.mock("react-native", () => ({ Platform: { OS: "android" }, Share: { share: jest.fn().mockResolvedValue({}) } }));
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(), readAsStringAsync: jest.fn().mockResolvedValue("YWJj"), writeAsStringAsync: jest.fn().mockResolvedValue(undefined), deleteAsync: jest.fn().mockResolvedValue(undefined),
  StorageAccessFramework: { requestDirectoryPermissionsAsync: jest.fn(), createFileAsync: jest.fn().mockResolvedValue("content://gif") },
}));

beforeEach(() => {
  jest.clearAllMocks(); Platform.OS = "android";
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 1_600_000, uri: "file://gif", modificationTime: 1 });
  jest.mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValue({ granted: true, directoryUri: "content://downloads" });
});
it("writes the GIF in bounded base64 pieces without replacing earlier chunks", async () => {
  await saveGif("file://gif", "my/video");
  expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith("content://downloads", "my-video.gif", "image/gif");
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(3);
  expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(1, "file://gif", { encoding: "base64", position: 0, length: 786432 });
  expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(3, "file://gif", { encoding: "base64", position: 1572864, length: 27136 });
  expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(1, "content://gif", "YWJj", { encoding: "base64", append: false });
  expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(2, "content://gif", "YWJj", { encoding: "base64", append: true });
});
it("does nothing when folder selection is cancelled and removes a failed partial copy", async () => {
  jest.mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValueOnce({ granted: false });
  await saveGif("file://gif", "video"); expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  jest.mocked(FileSystem.writeAsStringAsync).mockRejectedValueOnce(new Error("disk"));
  await expect(saveGif("file://gif", "video")).rejects.toThrow("disk");
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith("content://gif", { idempotent: true });
});
it("opens the existing iOS file share sheet", async () => {
  Platform.OS = "ios"; await saveGif("file://gif", "video");
  expect(Share.share).toHaveBeenCalledWith({ url: "file://gif" });
  expect(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
});
