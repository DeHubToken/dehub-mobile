import { validTextListStyle } from "./textList";
import { validShapeGeometry } from "./shapeGeometry";
import { validPageNumberFormat } from "./pageNumbering";
import { VECTOR_SYMBOLS } from "./vectorSymbols";
import { MEDIA_FRAMES, type MediaFrame } from "./mediaFrames";
import { validConnector } from "./connectors";
import { validPhotoTone } from "./photoTone";
import { validBrandStyles } from "./brandStyles";
import { normaliseDesignLink } from "./designLinks";
import { translateCopy as _translateCopy } from '../../i18n/copy';
import { videoMatteMediaIds, validVideoMatte } from "./videoMatte";
import type { ProjectSnapshot } from "./types";
import { validDataVisuals } from "./dataVisuals";
import { validGradientFill } from "./gradientFill";
import { validQrGraphic } from "./qrGraphic";

export class CloudProjectConflict extends Error {}
/** A live edit that needs recovery. The class marks it, because the message is translated. */
export class CloudDraftRecovery extends Error {}

export const CLOUD_PROJECT_BUCKET = "editor-project-media";
export const CLOUD_PROJECT_MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WALLET = /^0x[a-f0-9]{40}$/;

export interface CloudProjectMedia {
  id: string;
  storagePath: string;
  name: string;
  kind: "video" | "audio" | "image";
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  provenance?: { source: string; sourceUrl: string; creator?: string; creatorUrl?: string; license: string; licenseUrl?: string; attributionRequired: boolean; attributionText: string };
}
export interface CloudProjectDocument { version: 1; snapshot: ProjectSnapshot; media: CloudProjectMedia[] }
export interface CloudProjectSummary { projectId: string; title: string; revision: number; savedAt: string; stateVersion?: number; trashedAt?: string | null }
export interface CloudProjectVersion { projectId: string; revision: number; headRevision: number; savedAt: string; document: CloudProjectDocument }
export interface CloudProjectSaved { projectId: string; revision: number; savedAt: string }
export interface CloudProjectBinding { wallet: string; projectId: string; revision: number }

function fail(): never { throw new Error(_translateCopy("copy.3154e16634a3", { defaultValue: "Invalid or incomplete cloud project" })); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function positive(value: unknown, limit: number): boolean { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= limit; }
function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) { const point = char.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  return bytes;
}
function compatible(clip: string, source: string): boolean { return clip === source || (clip === "audio" && source === "video"); }
function finiteTree(value: unknown, depth = 0): void {
  if (depth > 64 || (typeof value === "number" && !Number.isFinite(value))) fail();
  if (Array.isArray(value)) for (const part of value) finiteTree(part, depth + 1);
  else if (object(value)) for (const part of Object.values(value)) finiteTree(part, depth + 1);
}

/** A saved document contains durable private paths, never device or signed URLs. */
export function parseCloudProjectDocument(value: unknown, wallet: string): CloudProjectDocument {
  if (!WALLET.test(wallet) || !object(value) || value.version !== 1 || !object(value.snapshot) || !Array.isArray(value.media)) fail();
  finiteTree(value);
  if (utf8Length(JSON.stringify(value)) > CLOUD_PROJECT_MAX_BYTES) fail();
  const s = value.snapshot;
  if (typeof s.id !== "string" || !UUID.test(s.id) || typeof s.title !== "string" || s.title.length > 200 || !object(s.settings)
    || !positive(s.settings.width, 16384) || !positive(s.settings.height, 16384) || !positive(s.settings.fps, 16384)
    || !Array.isArray(s.tracks) || s.tracks.length > 200 || !Array.isArray(s.clips) || s.clips.length > 10000 || value.media.length > 2000) fail();
  if (!validBrandStyles(s.settings.brandStyles)) fail();
  if (Array.isArray(s.settings.pageDetails) && s.settings.pageDetails.some(detail => object(detail) && detail.section !== undefined && (typeof detail.section !== "string" || detail.section.length > 80))) fail();
  if (object(s.settings.guides) && s.settings.guides.unit !== undefined && !["px", "in", "cm", "mm"].includes(String(s.settings.guides.unit))) fail();
  if (s.settings.printDpi !== undefined && (typeof s.settings.printDpi !== "number" || !Number.isInteger(s.settings.printDpi) || s.settings.printDpi < 72 || s.settings.printDpi > 600)) fail();
  const tracks = new Set<string>(), media = new Map<string, CloudProjectMedia>(), clips = new Set<string>();
  for (const track of s.tracks) {
    if (!object(track) || typeof track.id !== "string" || !track.id || tracks.has(track.id) || !["video", "audio", "text"].includes(String(track.kind))) fail();
    tracks.add(track.id);
  }
  for (const source of value.media) {
    if (!object(source) || typeof source.id !== "string" || !UUID.test(source.id) || media.has(source.id)
      || !["video", "audio", "image"].includes(String(source.kind)) || typeof source.name !== "string" || typeof source.mimeType !== "string"
      || typeof source.size !== "number" || !Number.isSafeInteger(source.size) || source.size < 0
      || typeof source.storagePath !== "string" || !new RegExp(`^${wallet}/${source.id}/source\\.[a-z0-9]{1,5}$`).test(source.storagePath)) fail();
    for (const key of ["width", "height", "duration"] as const) if (source[key] !== undefined && !positive(source[key], key === "duration" ? 86400 : 16384)) fail();
    media.set(source.id, source as unknown as CloudProjectMedia);
  }
  for (const clip of s.clips) {
    if (!object(clip) || typeof clip.id !== "string" || !clip.id || clips.has(clip.id) || typeof clip.trackId !== "string" || !tracks.has(clip.trackId)
      || !["video", "audio", "image", "text", "shape"].includes(String(clip.kind)) || !positive(clip.duration, 86400)) fail();
    for (const key of ["start", "trimIn"]) if (typeof clip[key] !== "number" || !Number.isFinite(clip[key]) || (clip[key] as number) < 0 || (clip[key] as number) > 86400) fail();
    if (["video", "audio", "image"].includes(String(clip.kind))) {
      if (clip.frame !== undefined && !MEDIA_FRAMES.includes(clip.frame as MediaFrame)) fail();
      const source = media.get(String(clip.mediaId));
      if (!source || !compatible(String(clip.kind), source.kind)) fail();
      if (clip.kind === "video" && clip.videoMatte) {
        if (!object(clip.videoMatte) || clip.videoMatte.sourceMediaId !== clip.mediaId || !media.has(String(clip.videoMatte.mediaId)) || media.get(String(clip.videoMatte.mediaId))?.kind !== "image") fail();
        if (clip.videoMatte.pages !== undefined) {
          const typedClip = clip as unknown as import("./types").MediaClip;
          if (!validVideoMatte(typedClip)) fail();
          for (const id of videoMatteMediaIds(typedClip.videoMatte)) if (media.get(id)?.kind !== "image") fail();
          for (const page of typedClip.videoMatte!.pages!) if (media.get(page.mediaId)?.width !== page.atlasWidth || media.get(page.mediaId)?.height !== page.atlasHeight) fail();
        }
      }
    }
    if (clip.kind === "shape" && clip.symbol !== undefined && (typeof clip.symbol !== "string" || !VECTOR_SYMBOLS.some(symbol => symbol.id === clip.symbol) || clip.shape !== "rect" || clip.connector !== undefined || clip.chart !== undefined || clip.table !== undefined || clip.qr !== undefined || clip.photoFrame)) fail();
    if (clip.kind === "shape" && (!validConnector(clip.connector) || (clip.connector !== undefined && (clip.shape !== "line" || clip.chart !== undefined || clip.table !== undefined || clip.qr !== undefined)))) fail();
    if (clip.kind === "shape") {
      if (!validShapeGeometry(clip.geometry)) fail();
      if (clip.pathSmoothing !== undefined && (typeof clip.pathSmoothing !== "number" || !Number.isFinite(clip.pathSmoothing) || clip.pathSmoothing < 0 || clip.pathSmoothing > 1)) fail();
      if (clip.closedPath !== undefined && typeof clip.closedPath !== "boolean") fail();
      if (clip.strokeCap !== undefined && !["round", "butt", "square"].includes(String(clip.strokeCap))) fail();
      if (clip.strokeJoin !== undefined && !["round", "bevel", "miter"].includes(String(clip.strokeJoin))) fail();
    }
    if (clip.kind === "shape" && !validDataVisuals({ chart: clip.chart, table: clip.table })) fail();
    if ((clip.kind === "shape" || clip.kind === "text") && !validGradientFill(clip.gradient)) fail();
    if (clip.kind === "shape" && (!validQrGraphic(clip.qr) || (clip.qr !== undefined && (clip.chart !== undefined || clip.table !== undefined)))) fail();
    if (clip.isPageBackground !== undefined && (typeof clip.isPageBackground !== "boolean" || (clip.kind !== "shape" && clip.kind !== "image"))) fail();
    if (clip.groupId !== undefined && (typeof clip.groupId !== "string" || !clip.groupId || clip.groupId.length > 128)) fail();
    if (clip.href !== undefined && (typeof clip.href !== "string" || !normaliseDesignLink(clip.href))) fail();
    if (clip.kind === "text" && object(clip.background) && clip.background.perLine !== undefined && typeof clip.background.perLine !== "boolean") fail();
    if (clip.pageNumber !== undefined && (clip.kind !== "text" || !validPageNumberFormat(clip.pageNumber))) fail();
    if (clip.fillOpacity !== undefined && (!["text", "shape"].includes(String(clip.kind)) || typeof clip.fillOpacity !== "number" || !Number.isFinite(clip.fillOpacity) || clip.fillOpacity < 0 || clip.fillOpacity > 1)) fail();
    for (const paint of [clip.stroke, clip.border]) if (object(paint) && paint.opacity !== undefined && (typeof paint.opacity !== "number" || !Number.isFinite(paint.opacity) || paint.opacity < 0 || paint.opacity > 1)) fail();
    for (const paint of [clip.stroke, clip.border]) if (object(paint) && paint.dashOffset !== undefined && (typeof paint.dashOffset !== "number" || !Number.isFinite(paint.dashOffset) || Math.abs(paint.dashOffset) > 1000000)) fail();
    if (clip.paragraphSpacing !== undefined && (clip.kind !== "text" || typeof clip.paragraphSpacing !== "number" || !Number.isFinite(clip.paragraphSpacing) || clip.paragraphSpacing < 0 || clip.paragraphSpacing > 300)) fail();
    if (clip.balance !== undefined && (clip.kind !== "text" || typeof clip.balance !== "boolean")) fail();
    if (clip.direction !== undefined && (clip.kind !== "text" || !["auto", "ltr", "rtl"].includes(String(clip.direction)))) fail();
    if (clip.listStyle !== undefined && (clip.kind !== "text" || !validTextListStyle(clip.listStyle))) fail();
    if (clip.label !== undefined && (typeof clip.label !== "string" || clip.label.length > 80)) fail();
    if (clip.kind === "text" && clip.echo !== undefined && (!Array.isArray(clip.echo) || clip.echo.length > 3 || clip.echo.some(layer =>
      !object(layer) || typeof layer.colour !== "string" || !/^#[\da-f]{6}$/i.test(layer.colour) ||
      typeof layer.x !== "number" || Math.abs(layer.x) > 100 || typeof layer.y !== "number" || Math.abs(layer.y) > 100 ||
      typeof layer.opacity !== "number" || layer.opacity < 0 || layer.opacity > 1))) fail();
    if ((clip.kind === "image" || clip.kind === "video") && clip.effects !== undefined && (!object(clip.effects) || !validPhotoTone(clip.effects as import("./photoTone").PhotoTone))) fail();
    clips.add(clip.id);
  }
  return JSON.parse(JSON.stringify(value)) as CloudProjectDocument;
}

/** Media uploads finish first; the user's timeline and local media IDs stay intact. */
export function makeCloudProjectDocument(snapshot: ProjectSnapshot, projectId: string, wallet: string, uploaded: ReadonlyMap<string, CloudProjectMedia>): CloudProjectDocument {
  const refs = new Map<string, CloudProjectMedia>();
  finiteTree(snapshot);
  const copy = JSON.parse(JSON.stringify(snapshot)) as ProjectSnapshot;
  copy.id = projectId;
  for (const clip of copy.clips) {
    if (clip.kind === "video" || clip.kind === "audio" || clip.kind === "image") {
      const source = uploaded.get(clip.mediaId);
      if (!source || !compatible(clip.kind, source.kind)) fail();
      clip.mediaId = source.id;
      refs.set(source.id, source);
      if (clip.kind === "video" && clip.videoMatte) {
        const ids = new Map<string, string>();
        for (const id of videoMatteMediaIds(clip.videoMatte)) {
          const matte = uploaded.get(id);
          if (!matte || matte.kind !== "image") fail();
          ids.set(id, matte.id); refs.set(matte.id, matte);
        }
        clip.videoMatte.mediaId = ids.get(clip.videoMatte.mediaId)!;
        if (clip.videoMatte.pages) clip.videoMatte.pages = clip.videoMatte.pages.map(page => ({ ...page, mediaId: ids.get(page.mediaId)! }));
        clip.videoMatte.sourceMediaId = source.id;
      }
    }
  }
  return parseCloudProjectDocument({ version: 1, snapshot: copy, media: [...refs.values()] }, wallet);
}

/** Opening a cloud version makes a local copy, preserving an existing draft. */
export function localCopyOfCloudProject(document: CloudProjectDocument, wallet: string, localId: string, now = Date.now()): ProjectSnapshot {
  const validated = parseCloudProjectDocument(document, wallet);
  if (!UUID.test(localId) || localId === validated.snapshot.id || !Number.isFinite(now)) fail();
  return { ...validated.snapshot, id: localId, updatedAt: now };
}
