import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

/** Copy in bounded pieces so saving a GIF never creates a second full base64 string. */
export async function saveGif(uri: string, title: string): Promise<void> {
  if (Platform.OS !== "android") { await Share.share({ url: uri }); return; }
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || !info.size || info.size > 100 * 1024 * 1024) throw new Error("GIF file unavailable");
  const name = (title || "video").replace(/[\\/:*?"<>|\s.]+/g, "-").slice(0, 60) + ".gif";
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, name, "image/gif");
  try {
    const chunk = 3 * 256 * 1024;
    for (let position = 0; position < info.size; position += chunk) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length: Math.min(chunk, info.size - position) });
      await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64, append: position > 0 });
    }
  } catch (error) { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {}); throw error; }
}
