import * as FileSystem from "expo-file-system/legacy";
import { File as FsFile, Paths } from "expo-file-system";
import { base64ToBytes } from "./storage";
import { exportBaseName } from "./exportName";
import { writeZipArchive, type ZipEntry } from "./zipArchive";

/** Write directly to a cache file without keeping the video archive in memory. */
export async function zipDownloadFiles(files: { name: string; uri: string }[], title: string, signal?: AbortSignal, kind: "clips" | "pages" = "clips"): Promise<string> {
  const entries: ZipEntry[] = [];
  for (const file of files) {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (!info.exists || info.isDirectory || typeof info.size !== "number" || !Number.isSafeInteger(info.size)) throw new Error("Download file unavailable");
    entries.push({ name: file.name, size: info.size,
      read: async (position, length) => base64ToBytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64, position, length })),
    });
  }
  const name = exportBaseName(title);
  const file = new FsFile(Paths.cache, `${name}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  file.create({ overwrite: true });
  const handle = file.open();
  try {
    await writeZipArchive(entries, bytes => handle.writeBytes(bytes), signal);
    handle.close();
    return file.uri;
  } catch (error) {
    try { handle.close(); } catch { /* already closed */ }
    try { file.delete(); } catch { /* unavailable cache file */ }
    throw error;
  }
}
