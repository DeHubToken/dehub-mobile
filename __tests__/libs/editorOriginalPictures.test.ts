import { importPicture, MAX_MEDIA_BYTES, MediaTooLargeError } from "../../libs/editor/storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "doc/", getInfoAsync: jest.fn(), makeDirectoryAsync: jest.fn(), copyAsync: jest.fn(async () => {}), writeAsStringAsync: jest.fn(async () => {}) }));
jest.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg", PNG: "png" } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("../../libs/editor/project", () => ({ newId: () => "picture", mediaIds: jest.fn(), parseProject: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 256 } as never); });

it.each([["image/gif", "gif"], ["image/svg+xml", "svg"]])("copies the original %s source and licence without flattening it", async (mimeType, ext) => {
  const provenance = { source: "Wikimedia Commons", sourceUrl: "https://commons/source", license: "CC BY", attributionRequired: true, attributionText: "Artwork by Creator" };
  const media = await importPicture({ uri: "cache/artwork", width: 640, height: 360, fileName: `artwork.${ext}`, mimeType, provenance });
  expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: "cache/artwork", to: `doc/editor/media/picture.${ext}` });
  expect(media).toMatchObject({ kind: "image", mimeType, width: 640, height: 360, file: `picture.${ext}`, size: 256, provenance });
  expect(JSON.parse(jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0][1])).toMatchObject({ mimeType, provenance });
});
it("rejects an oversized original before copying it", async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: MAX_MEDIA_BYTES + 1 } as never);
  await expect(importPicture({ uri: "cache/large.gif", width: 1, height: 1, mimeType: "image/gif" })).rejects.toBeInstanceOf(MediaTooLargeError);
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
});
it("rejects an empty original instead of adding missing media", async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 0 } as never);
  await expect(importPicture({ uri: "cache/empty.svg", width: 1, height: 1, mimeType: "image/svg+xml" })).rejects.toThrow("empty picture");
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
});
