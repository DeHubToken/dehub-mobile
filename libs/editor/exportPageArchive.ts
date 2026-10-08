import * as FileSystem from "expo-file-system/legacy";
import { exportBaseName } from "./exportName";
import { pageExportFrames } from "./pageExports";
import { saveEditorDownload } from "./saveEditorDownload";
import { writeExport } from "./storage";
import type { ProjectSnapshot } from "./types";
import { zipDownloadFiles } from "./zipDownloadFiles";

/** Capture one page at a time and stream the archive, cleaning every temporary file. */
export async function exportPageArchive(snapshot: ProjectSnapshot, time: number, format: "png" | "jpeg",
  capture: (format: "png" | "jpeg", quality: number, time: number) => Promise<string>,
  signal?: AbortSignal, onProgress?: (fraction: number, current: number, total: number) => void): Promise<void> {
  const check = () => { if (signal?.aborted) { const error = new Error("Export cancelled"); error.name = "AbortError"; throw error; } };
  const frames = pageExportFrames(snapshot, time, "all", format === "jpeg" ? "jpg" : "png");
  const files: { name: string; uri: string }[] = [];
  let archive: string | undefined;
  try {
    for (const [index, frame] of frames.entries()) {
      check(); onProgress?.(index / frames.length * 0.95, index + 1, frames.length);
      const dataUrl = await capture(format, 0.92, frame.time);
      check();
      const uri = await writeExport(dataUrl, format, frame.filename.slice(0, -4));
      files.push({ name: frame.filename, uri });
      check();
    }
    archive = await zipDownloadFiles(files, snapshot.title || "design", signal, "pages");
    check(); onProgress?.(1, frames.length, frames.length);
    await saveEditorDownload(archive, exportBaseName(snapshot.title, "design"), "zip", "application/zip", signal);
  } finally {
    for (const file of files) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
    if (archive) await FileSystem.deleteAsync(archive, { idempotent: true }).catch(() => {});
  }
}
