/**
 * Everything the sender works out before an attachment is encrypted: the
 * file actually uploaded (big photos shrunk), its layout (w/h/dur) and a tiny
 * blurred placeholder, all of which travel inside the encrypted descriptor.
 *
 * Every native step is optional. A missing or failing thumbnailer or
 * manipulator just leaves the field out (or sends the photo at its original
 * size); none of it can stop the attachment from being sent.
 */
import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { fileKeyToString, newFileKey, type MediaDescriptor, type MediaKind } from "./media";
import { deleteQuietly } from "./media-files";

/** Same bounds as post photos (libs/assets.util UPLOAD_IMAGE_MAX_SIDE). */
const MAX_IMAGE_SIDE = 2048;
const IMAGE_QUALITY = 0.85;
const THUMB_MAX_CHARS = 1500;

function imageSize(uri: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      Image.getSize(
        uri,
        (w, h) => resolve(w > 0 && h > 0 ? { w, h } : null),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

async function readSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return (info as { size?: number }).size ?? 0;
  } catch {
    return 0;
  }
}

/** ~24-32px JPEG data URL, or undefined when it cannot be made small enough. */
async function tinyThumb(uri: string, w?: number, h?: number): Promise<string | undefined> {
  const landscape = !w || !h || w >= h;
  for (const [side, compress] of [[32, 0.5], [24, 0.35]] as const) {
    let out: string | undefined;
    try {
      const res = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: landscape ? { width: side } : { height: side } }],
        { compress, format: ImageManipulator.SaveFormat.JPEG },
      );
      out = res.uri;
      const b64 = await FileSystem.readAsStringAsync(res.uri, { encoding: FileSystem.EncodingType.Base64 });
      const dataUrl = `data:image/jpeg;base64,${b64}`;
      if (dataUrl.length <= THUMB_MAX_CHARS) return dataUrl;
    } catch {
      return undefined;
    } finally {
      await deleteQuietly(out);
    }
  }
  return undefined;
}

const isGif = (mime: string, uri: string): boolean =>
  mime.toLowerCase() === "image/gif" || uri.toLowerCase().split("?")[0].endsWith(".gif");

export interface PreparedMedia {
  descriptor: MediaDescriptor;
  fileKey: Uint8Array;
  /** The file to encrypt: the original, or a shrunk copy of a big photo. */
  plainUri: string;
}

export async function prepareMediaDescriptor(input: {
  uri: string;
  kind: MediaKind;
  mime: string;
  caption?: string;
  name?: string;
  /** seconds */
  duration?: number;
  /** video poster the picker already made */
  thumbnailUri?: string;
}): Promise<PreparedMedia> {
  const fileKey = newFileKey();
  let plainUri = input.uri;
  let mime = input.mime;
  const d: Partial<MediaDescriptor> = {};

  if (input.kind === "image") {
    let size = await imageSize(input.uri);
    if (size && !isGif(mime, input.uri) && Math.max(size.w, size.h) > MAX_IMAGE_SIDE) {
      const scale = MAX_IMAGE_SIDE / Math.max(size.w, size.h);
      try {
        const res = await ImageManipulator.manipulateAsync(
          input.uri,
          [{ resize: { width: Math.round(size.w * scale), height: Math.round(size.h * scale) } }],
          { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
        );
        plainUri = res.uri;
        mime = "image/jpeg";
        size = { w: res.width, h: res.height };
      } catch { /* send it at its original size */ }
    }
    if (size) {
      d.w = size.w;
      d.h = size.h;
    }
    d.thumb = await tinyThumb(plainUri, size?.w, size?.h);
  } else if (input.kind === "video") {
    let poster = input.thumbnailUri;
    let made: string | undefined;
    let size: { w: number; h: number } | null = null;
    if (!poster) {
      try {
        const res = await VideoThumbnails.getThumbnailAsync(input.uri, { time: 500 });
        poster = made = res.uri;
        if (res.width > 0 && res.height > 0) size = { w: res.width, h: res.height };
      } catch { /* no poster */ }
    }
    if (poster) {
      size = size || (await imageSize(poster));
      d.thumb = await tinyThumb(poster, size?.w, size?.h);
    }
    if (size) {
      d.w = size.w;
      d.h = size.h;
    }
    await deleteQuietly(made);
    if (input.duration && input.duration > 0) d.dur = Math.round(input.duration * 10) / 10;
  } else if (input.kind === "audio") {
    if (input.duration && input.duration > 0) d.dur = Math.round(input.duration * 10) / 10;
  }
  if (input.kind === "file" && input.name) d.name = input.name;

  const descriptor: MediaDescriptor = {
    k: fileKeyToString(fileKey),
    kind: input.kind,
    mime: mime || "application/octet-stream",
    size: await readSize(plainUri),
    ...d,
    ...(input.caption ? { caption: input.caption } : {}),
  };
  return { descriptor, fileKey, plainUri };
}
