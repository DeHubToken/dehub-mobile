import type { DesignPdfLink } from "./designLinks";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system/legacy";
import { pageExportFrames, type PageExportScope } from "./pageExports";
import { writePdfDocument } from "./pdfDocument";
import { base64ToBytes, openVideoExport } from "./storage";
import { saveEditorDownload } from "./saveEditorDownload";
import type { ProjectSnapshot } from "./types";

/** Only one rendered page is decoded at once; the document is written straight to a temporary file. */
export async function exportPdf(snapshot: ProjectSnapshot, time: number, scope: PageExportScope,
  capture: (time: number) => Promise<{ dataUrl: string; links: DesignPdfLink[]; width?: number; height?: number }>, signal?: AbortSignal, progress?: (fraction: number) => void, cropMarks = false, bookmarks = true): Promise<void> {
  const frames = pageExportFrames(snapshot, time, scope, "jpg");
  const out = openVideoExport(snapshot.title || "design", "pdf");
  try {
    await writePdfDocument(frames.length, async index => {
      progress?.(index / frames.length * 0.95);
      const { dataUrl, links, width, height } = await capture(frames[index].time);
      if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("PDF page capture failed");
      return { jpeg: base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1)), width: width ?? snapshot.settings.width, height: height ?? snapshot.settings.height, designWidth: snapshot.settings.width, designHeight: snapshot.settings.height, dpi: snapshot.settings.printDpi, cropMarks, links };
    }, bytes => out.append(Buffer.from(bytes).toString("base64")), signal, frames.map(frame => frame.index), { title: snapshot.title, bookmarks, pageSections: frames.map(frame => snapshot.settings.pageDetails?.[frame.index]?.section ?? ""), pageTitles: frames.map(frame => snapshot.settings.pageDetails?.[frame.index]?.title ?? ""), pageLabels: frames.map(frame => String(frame.index + 1)) });
    out.close(); progress?.(1);
    await saveEditorDownload(out.uri, snapshot.title || "design", "pdf", "application/pdf", signal);
  } finally {
    out.close();
    await FileSystem.deleteAsync(out.uri, { idempotent: true }).catch(() => {});
  }
}
