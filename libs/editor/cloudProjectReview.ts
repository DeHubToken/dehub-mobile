import { localCopyOfCloudProject, parseCloudProjectDocument, type CloudProjectDocument, type CloudProjectMedia } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";

export type ProjectReviewRole = "viewer" | "commenter";
export interface ProjectReviewMember {
  ownerWallet: string; projectId: string; memberWallet: string; role: ProjectReviewRole;
  accepted: boolean; revoked: boolean; stateVersion: number;
}
export interface ProjectReviewInvitation extends ProjectReviewMember { title: string; revision: number; savedAt: string }
export interface ProjectReviewTarget { ownerWallet: string; projectId: string; title: string; revision: number; role: ProjectReviewRole | "owner" }
export interface ProjectReviewComment {
  id: string; ownerWallet: string; projectId: string; authorWallet: string; revision: number; atSeconds: number;
  clipId: string | null; body: string; parentId: string | null; assigneeWallet: string | null;
  resolved: boolean; stateVersion: number; createdAt: string; updatedAt: string;
}
export interface ProjectReviewDraft { body: string; atSeconds: number; revision: number; clipId?: string | null; parentId?: string | null; assigneeWallet?: string | null }
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function projectReviewWallet(value: string): string {
  const wallet = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new Error("Enter a valid DeHub wallet address");
  return wallet;
}
export function projectReviewDraft(draft: ProjectReviewDraft): ProjectReviewDraft {
  const body = draft.body.trim();
  if (!body || Array.from(body).length > 2000) throw new Error("Comments must contain 1 to 2000 characters");
  if (!Number.isSafeInteger(draft.revision) || draft.revision <= 0 || !Number.isFinite(draft.atSeconds) || draft.atSeconds < 0 || draft.atSeconds > 86400) throw new Error("Choose a valid saved version and comment time");
  if (draft.parentId && !uuidPattern.test(draft.parentId)) throw new Error("Invalid comment thread");
  if (draft.clipId != null && (!draft.clipId || draft.clipId.length > 200)) throw new Error("Invalid comment clip");
  return { ...draft, body, clipId: draft.clipId ?? null, parentId: draft.parentId ?? null,
    assigneeWallet: draft.assigneeWallet ? projectReviewWallet(draft.assigneeWallet) : null };
}

/** Review imports have fresh local source IDs and cannot overwrite the owner's project or source cache. */
export function projectReviewCopy(document: CloudProjectDocument, owner: string, uuid: () => string, now = Date.now()): { snapshot: ProjectSnapshot; media: CloudProjectMedia[] } {
  const wallet = projectReviewWallet(owner), source = parseCloudProjectDocument(document, wallet);
  const used = new Set(source.media.map(media => media.id)); used.add(source.snapshot.id);
  const nextId = () => { const id = uuid(); if (!uuidPattern.test(id) || used.has(id)) throw new Error("Review copy IDs must be unique"); used.add(id); return id; };
  const snapshot = localCopyOfCloudProject(source, wallet, nextId(), now);
  const ids = new Map<string, string>();
  const media = source.media.map(item => { const id = nextId(); ids.set(item.id, id); return { ...item, id }; });
  for (const clip of snapshot.clips) if ("mediaId" in clip) {
    clip.mediaId = ids.get(clip.mediaId)!;
    if (clip.kind === "video" && clip.videoMatte) {
      clip.videoMatte.mediaId = ids.get(clip.videoMatte.mediaId)!;
      clip.videoMatte.sourceMediaId = clip.mediaId;
    }
  }
  return { snapshot, media };
}
export function projectReviewTime(seconds: number): string {
  const ticks = Math.round(Math.max(0, seconds) * 100), whole = Math.floor(ticks / 100);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}
export function projectReviewSnapshotKey(snapshot: ProjectSnapshot): string {
  return JSON.stringify({ ...snapshot, updatedAt: 0 });
}
