import * as ImagePicker from "expo-image-picker";
import ImageCropPicker from "react-native-image-crop-picker";
import * as ImageManipulator from "expo-image-manipulator";

export const requestMediaLibraryPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
};

export type CropOptions = {
  width: number;
  height: number;
  forceJpg?: boolean;
  quality?: number; // 0..1
  circle?: boolean;
};

export const openCroppedImagePicker = async (
  opts: CropOptions
): Promise<string | null> => {
  const { width, height, forceJpg = true, quality = 0.9, circle = false } = opts;
  const img = await ImageCropPicker.openPicker({
    width,
    height,
    cropping: true,
    cropperCircleOverlay: circle,
    mediaType: "photo",
    compressImageQuality: quality,
    forceJpg,
  });
  const pickedUri = (img as any)?.path || (img as any)?.sourceURL;
  return pickedUri ?? null;
};

export type ResizeOptions = {
  width: number;
  height: number;
  compress?: number; // 0..1
  format?: "jpeg" | "png" | "webp";
};

const saveFormat = (fmt: ResizeOptions["format"]) => {
  switch (fmt) {
    case "png":
      return ImageManipulator.SaveFormat.PNG;
    case "webp":
      return ImageManipulator.SaveFormat.WEBP;
    case "jpeg":
    default:
      return ImageManipulator.SaveFormat.JPEG;
  }
};

export const resizeAndCompress = async (
  uri: string,
  { width, height, compress = 0.85, format = "jpeg" }: ResizeOptions
): Promise<string> => {
  const manip = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width, height } }],
    { compress, format: saveFormat(format) }
  );
  return manip.uri;
};

export type RNFile = { uri: string; name: string; type: string };

export const createRNImageFile = (
  uri: string,
  namePrefix: string,
  mime: string = "image/jpeg"
): RNFile => ({
  uri,
  name: `${namePrefix}_${Date.now()}.jpg`,
  type: mime,
});
