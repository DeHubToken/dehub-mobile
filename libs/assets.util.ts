import * as ImagePicker from "expo-image-picker";
import ImageCropPicker from "react-native-image-crop-picker";
import * as ImageManipulator from "expo-image-manipulator";

/**
 * @deprecated Use `runWithPermissions(["photos"], action)` from permissions.util instead.
 * Kept for backward compat — delegates to the centralized permission gate.
 */
export const requestMediaLibraryPermission = async (): Promise<boolean> => {
  const { ensureMediaLibraryPermission } = require("./permissions.util");
  const result = await ensureMediaLibraryPermission();
  return result.granted;
};

export type CropOptions = {
  width?: number; // omit for free crop
  height?: number; // omit for free crop
  forceJpg?: boolean;
  quality?: number; // 0..1
  circle?: boolean;
  free?: boolean; // enable free-style crop (no aspect lock)
};

export const openCroppedImagePicker = async (opts: CropOptions): Promise<string | null> => {
  const { width, height, forceJpg = true, quality = 0.9, circle = false, free = false } = opts;
  const pickerOpts: any = {
    cropping: true,
    cropperCircleOverlay: circle,
    mediaType: "photo",
    compressImageQuality: quality,
    forceJpg,
  };
  // If free crop, do not enforce width/height and enable freestyle if supported
  if (!free) {
    if (width) pickerOpts.width = width;
    if (height) pickerOpts.height = height;
  } else {
    pickerOpts.freeStyleCropEnabled = true;
  }
  const img = await ImageCropPicker.openPicker(pickerOpts);
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

/** Longest side a post photo is uploaded at. Phone cameras shoot 4000px+. */
export const UPLOAD_IMAGE_MAX_SIDE = 2048;
const UPLOAD_IMAGE_QUALITY = 0.85;

type UploadableImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

/**
 * Shrink a picked photo to at most UPLOAD_IMAGE_MAX_SIDE on its long side and
 * re-encode at 0.85 before it is uploaded. GIFs pass through untouched (a
 * re-encode would drop the animation), PNG and WebP keep their format so
 * transparency survives, and anything that fails comes back as picked.
 */
export async function prepareImageForUpload<T extends UploadableImage>(asset: T): Promise<T> {
  const lowerName = (asset.fileName || asset.uri || "").toLowerCase().split("?")[0];
  const mime = (asset.mimeType || "").toLowerCase();
  if (mime === "image/gif" || lowerName.endsWith(".gif")) return asset;

  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  if (!w || !h) return asset;

  const scale = Math.min(1, UPLOAD_IMAGE_MAX_SIDE / Math.max(w, h));
  const keepFormat: "png" | "webp" | null =
    mime === "image/png" || lowerName.endsWith(".png") ? "png"
    : mime === "image/webp" || lowerName.endsWith(".webp") ? "webp"
    : null;
  // A lossless format already within bounds gains nothing from a re-encode.
  if (keepFormat && scale === 1) return asset;

  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  try {
    const uri = await resizeAndCompress(asset.uri, {
      width,
      height,
      compress: UPLOAD_IMAGE_QUALITY,
      format: keepFormat ?? "jpeg",
    });
    const ext = keepFormat ?? "jpg";
    const base = (asset.fileName || "image").replace(/\.[^.]+$/, "");
    return {
      ...asset,
      uri,
      width,
      height,
      mimeType: keepFormat ? `image/${keepFormat}` : "image/jpeg",
      fileName: `${base}.${ext}`,
      fileSize: undefined,
    } as T;
  } catch {
    return asset;
  }
}

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

export const getFileName = (uri: string, fallback: string): string => {
  try {
    const p = uri.split('?')[0];
    const name = p.substring(p.lastIndexOf('/') + 1) || fallback;
    return name;
  } catch {
    return fallback;
  }
};

export const guessMime = (uri: string, fallback: string): string => {
  const lower = (uri || '').toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return fallback;
};
