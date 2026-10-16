import qrcode from "qrcode-generator";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";

export interface QrGraphic { content: string; foreground: string; background: string; cells: string[] }

export function createQrGraphic(content: string, foreground = "#000000", background = "#ffffff"): QrGraphic {
  if (!content.trim() || content.length > 1500 || !/^#[0-9a-f]{6}$/i.test(foreground) || !/^#[0-9a-f]{6}$/i.test(background) || foreground.toLowerCase() === background.toLowerCase()) throw new Error("Enter text or a link and two different hex colours");
  const previous = qrcode.stringToBytes;
  try {
    qrcode.stringToBytes = text => {
      const bytes: number[] = [];
      for (const letter of text) {
        let code = letter.codePointAt(0)!;
        if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
        if (code < 128) bytes.push(code);
        else if (code < 2048) bytes.push(192 | code >> 6, 128 | code & 63);
        else if (code < 65536) bytes.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
        else bytes.push(240 | code >> 18, 128 | code >> 12 & 63, 128 | code >> 6 & 63, 128 | code & 63);
      }
      return bytes;
    };
    const qr = qrcode(0, "M"); qr.addData(content, "Byte"); qr.make();
    const size = qr.getModuleCount();
    return { content, foreground, background, cells: Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => qr.isDark(row, col) ? "1" : "0").join("")) };
  } finally { qrcode.stringToBytes = previous; }
}

interface QrContext { fillStyle: unknown; fillRect(x: number, y: number, width: number, height: number): void }

/** A four-module quiet zone is retained in every preview and export. */
export function drawQrGraphic(ctx: QrContext, width: number, height: number, qr: QrGraphic): void {
  const count = qr.cells?.length;
  if (!count || count < 21 || count > 177 || qr.cells.some(row => typeof row !== "string" || row.length !== count || !/^[01]+$/.test(row))) return;
  const size = Math.min(width, height), left = -size / 2, top = -size / 2, cell = size / (count + 8);
  ctx.fillStyle = qr.background; ctx.fillRect(left, top, size, size);
  ctx.fillStyle = qr.foreground;
  qr.cells.forEach((row, y) => {
    for (let x = 0; x < count; x++) if (row[x] === "1") {
      const x0 = Math.round((x + 4) * cell), y0 = Math.round((y + 4) * cell);
      ctx.fillRect(left + x0, top + y0, Math.round((x + 5) * cell) - x0, Math.round((y + 5) * cell) - y0);
    }
  });
}

export function putQrGraphic(project: ProjectSnapshot, time: number, qr: QrGraphic, makeId: () => string, selectedId?: string | null) {
  const existing = project.clips.find(c => c.id === selectedId && c.kind === "shape" && c.qr);
  if (existing?.locked) return null;
  if (existing) return { project: { ...project, clips: project.clips.map(c => c.id === existing.id ? { ...c, qr } as ShapeClip : c) }, id: existing.id };
  const page = pageAt(getPages(project.settings, project.clips), time);
  const track: Track = { id: makeId(), kind: "video", name: "QR code", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", start: page.start, duration: page.end - page.start,
    trimIn: 0, w: 0.3, h: 0.3 * project.settings.width / project.settings.height, fill: null, stroke: null, qr };
  return { project: { ...project, tracks: [...project.tracks, track], clips: [...project.clips, clip] }, id: clip.id };
}

export function validQrGraphic(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const qr = value as Record<string, unknown>, cells = qr.cells;
  return typeof qr.content === "string" && qr.content.length > 0 && qr.content.length <= 1500 &&
    typeof qr.foreground === "string" && /^#[0-9a-f]{6}$/i.test(qr.foreground) && typeof qr.background === "string" && /^#[0-9a-f]{6}$/i.test(qr.background) &&
    Array.isArray(cells) && cells.length >= 21 && cells.length <= 177 && cells.every(row => typeof row === "string" && row.length === cells.length && /^[01]+$/.test(row));
}
