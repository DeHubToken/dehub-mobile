import { requestDesignPagePreview } from "./designPagePreviews";
import { decodePaletteImage } from "./paletteImageDecoder";
import type { ProjectSnapshot } from "./types";
export async function extractDesignPagePalette(project: ProjectSnapshot, time: number, signal: AbortSignal): Promise<string[]> {
  const source = await requestDesignPagePreview(project, time, 128, signal);
  return decodePaletteImage(project.id, source, signal);
}
