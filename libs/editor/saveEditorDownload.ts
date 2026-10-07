import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { ZIP_DOWNLOAD_LIMIT } from "./zipArchive";

export async function saveEditorDownload(uri: string, title: string, ext: string, mime: string, signal?: AbortSignal): Promise<void> {
  const abort = () => { if (signal?.aborted) { const error = new Error("Download cancelled"); error.name = "AbortError"; throw error; } };
  abort();
  if (Platform.OS !== "android") { await Share.share({ url: uri }); return; }
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  abort();
  if (!permission.granted) return;
  const info = await FileSystem.getInfoAsync(uri);
  const limit = ext === "gif" ? 100 * 1024 * 1024 : ZIP_DOWNLOAD_LIMIT;
  if (!info.exists || info.isDirectory || !info.size || info.size > limit || !/^(gif|mp4|webm|zip)$/.test(ext)) throw new Error("Download file unavailable");
  const name = (title || "video").replace(/[\\/:*?"<>|\s.]+/g, "-").slice(0, 60) + "." + ext;
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, name, mime);
  try {
    const chunk = 3 * 256 * 1024;
    for (let position = 0; position < info.size; position += chunk) {
      abort();
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length: Math.min(chunk, info.size - position) });
      abort();
      await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64, append: position > 0 });
    }
    abort();
  } catch (error) { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {}); throw error; }
}
