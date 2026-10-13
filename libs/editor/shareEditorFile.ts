import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ZIP_DOWNLOAD_LIMIT } from "./zipArchive";

const TYPES: Record<string, string> = { "video/mp4": "public.mpeg-4", "image/png": "public.png", "image/jpeg": "public.jpeg", "image/gif": "com.compuserve.gif", "application/zip": "public.zip-archive" };

/** Opens a device picker for a finished local export; the user chooses its destination. */
export async function shareEditorFile(uri: string, mimeType: string, signal?: AbortSignal): Promise<void> {
  const check = () => { if (signal?.aborted) { const error = new Error("Export cancelled"); error.name = "AbortError"; throw error; } };
  check();
  if (!uri.startsWith("file://") || !TYPES[mimeType]) throw new Error("Export file unavailable");
  const info = await FileSystem.getInfoAsync(uri); check();
  if (!info.exists || info.isDirectory || !info.size || info.size > ZIP_DOWNLOAD_LIMIT) throw new Error("Export file unavailable");
  if (!await Sharing.isAvailableAsync()) throw new Error("Sharing unavailable");
  check();
  await Sharing.shareAsync(uri, { mimeType, UTI: TYPES[mimeType] });
}
