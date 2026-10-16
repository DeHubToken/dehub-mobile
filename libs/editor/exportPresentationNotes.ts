import { Buffer } from "buffer";
import { presentationNotesText } from "./presentationNotesText";
import { openVideoExport } from "./storage";
import { saveEditorDownload } from "./saveEditorDownload";
import type { PageExportScope } from "./pageExports";
import type { ProjectSnapshot } from "./types";
export async function exportPresentationNotes(project: ProjectSnapshot, time: number, scope: PageExportScope): Promise<void> {
  const content = presentationNotesText(project, time, scope), out = openVideoExport((project.title || "design") + "-notes", "txt");
  try { out.append(Buffer.from("\uFEFF" + content, "utf8").toString("base64")); out.close(); await saveEditorDownload(out.uri, (project.title || "design") + "-notes", "txt", "text/plain"); }
  finally { out.discard(); }
}
