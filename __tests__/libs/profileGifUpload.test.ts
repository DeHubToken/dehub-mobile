jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file:///cache/out.jpg" })),
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));
jest.mock("react-native-image-crop-picker", () => ({
  __esModule: true,
  default: { openPicker: jest.fn(), openCropper: jest.fn() },
}));

import ImageCropPicker from "react-native-image-crop-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { createRNImageFile, isGifUri, openCroppedImagePicker, resizeAndCompress } from "../../libs/assets.util";

const picker = ImageCropPicker as unknown as { openPicker: jest.Mock; openCropper: jest.Mock };

describe("profile GIF uploads keep their animation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("recognises GIF paths", () => {
    expect(isGifUri("file:///cache/pic.GIF")).toBe(true);
    expect(isGifUri("https://x/a.gif?v=2")).toBe(true);
    expect(isGifUri("file:///cache/pic.jpg")).toBe(false);
    expect(isGifUri(undefined)).toBe(false);
  });

  it("returns a picked GIF uncropped", async () => {
    picker.openPicker.mockResolvedValue({ path: "file:///cache/loop.gif", mime: "image/gif" });
    const uri = await openCroppedImagePicker({ width: 800, height: 800, forceJpg: true, keepGif: true });
    expect(uri).toBe("file:///cache/loop.gif");
    expect(picker.openCropper).not.toHaveBeenCalled();
  });

  it("still crops a photo", async () => {
    picker.openPicker.mockResolvedValue({ path: "file:///cache/photo.heic", mime: "image/heic" });
    picker.openCropper.mockResolvedValue({ path: "file:///cache/cropped.jpg" });
    const uri = await openCroppedImagePicker({ width: 800, height: 800, forceJpg: true, keepGif: true });
    expect(uri).toBe("file:///cache/cropped.jpg");
    expect(picker.openCropper).toHaveBeenCalledWith(expect.objectContaining({ path: "file:///cache/photo.heic", width: 800, height: 800 }));
  });

  it("skips the JPEG re-encode and uploads as image/gif", async () => {
    expect(await resizeAndCompress("file:///cache/loop.gif", { width: 512, height: 512 })).toBe("file:///cache/loop.gif");
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(createRNImageFile("file:///cache/loop.gif", "avatar")).toMatchObject({ type: "image/gif", uri: "file:///cache/loop.gif" });
    expect(createRNImageFile("file:///cache/a.jpg", "avatar").type).toBe("image/jpeg");
  });
});
