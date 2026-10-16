import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system/legacy";
import { pageExportFrames, type PageExportScope } from "./pageExports";
import { pageDetails } from "./pageDetails";
import { presentationDocumentEntries, presentationSlideSize, PRESENTATION_IMAGE_LIMIT, PRESENTATION_MIME, type PresentationSlide } from "./presentationDocument";
import { writeZipArchive, type ZipEntry } from "./zipArchive";
import { base64ToBytes, openVideoExport } from "./storage";
import { saveEditorDownload } from "./saveEditorDownload";
import type { DesignPdfLink } from "./designLinks";
import type { ProjectSnapshot } from "./types";

export async function exportPresentation(snapshot: ProjectSnapshot, time: number, scope: PageExportScope,
  capture: (time: number) => Promise<{ dataUrl: string; links: DesignPdfLink[] }>, signal?: AbortSignal, progress?: (fraction: number) => void): Promise<void> {
  const frames = pageExportFrames(snapshot, time, scope, "jpg"), images: ZipEntry[] = [], slides: PresentationSlide[] = [], temporary: string[] = [];
  presentationSlideSize(snapshot.settings.width, snapshot.settings.height);
  let total = 0;
  const check = () => { if (signal?.aborted) { const error = new Error("Export cancelled"); error.name = "AbortError"; throw error; } };
  const out = openVideoExport(snapshot.title || "design", "pptx");
  try {
    for (const [index, frame] of frames.entries()) {
      check(); progress?.(index / frames.length * 0.8);
      const { dataUrl, links } = await capture(frame.time); check();
      if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("Presentation page capture failed");
      const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (total + encoded.length * 0.75 > PRESENTATION_IMAGE_LIMIT) throw new Error("This presentation exceeds 256 MiB. Export fewer pages");
      const file = openVideoExport(`presentation-slide-${index + 1}-${Math.random().toString(36).slice(2, 10)}`, "jpg"); temporary.push(file.uri);
      try { file.append(encoded); } finally { file.close(); }
      const info = await FileSystem.getInfoAsync(file.uri); check();
      if (!info.exists || info.isDirectory || typeof info.size !== "number" || info.size <= 0) throw new Error("Presentation page capture failed");
      total += info.size;
      const details = pageDetails(snapshot, frame.index);
      slides.push({ index: frame.index, title: details.title, notes: details.notes, hidden: details.presentationHidden, links });
      images.push({ name: `ppt/media/image${index + 1}.jpg`, size: info.size, read: async (position, length) => base64ToBytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64, position, length })) });
    }
    const entries = [...presentationDocumentEntries(snapshot.settings.width, snapshot.settings.height, snapshot.title, slides), ...images], size = entries.reduce((sum, entry) => sum + entry.size, 0);
    let written = 0;
    await writeZipArchive(entries, bytes => { out.append(Buffer.from(bytes).toString("base64")); written += bytes.length; progress?.(Math.min(0.99, 0.8 + written / Math.max(1, size) * 0.19)); }, signal);
    out.close(); check(); progress?.(1);
    await saveEditorDownload(out.uri, snapshot.title || "design", "pptx", PRESENTATION_MIME, signal);
  } finally {
    out.close();
    for (const uri of [...temporary, out.uri]) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
