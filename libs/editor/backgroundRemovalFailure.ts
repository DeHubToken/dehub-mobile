import type { Clip } from "./types";

export interface BackgroundRemovalScope {
  projectId: string;
  clipId: string;
  mediaId: string;
  kind: "image" | "video";
  trimIn: number;
  duration: number;
  speed: number;
}
export interface BackgroundRemovalFailure extends BackgroundRemovalScope { message: string }

export function backgroundRemovalScope(projectId: string | undefined, clip: Clip | undefined): BackgroundRemovalScope | null {
  if (!projectId || !clip || clip.locked || (clip.kind !== "image" && clip.kind !== "video")) return null;
  return { projectId, clipId: clip.id, mediaId: clip.mediaId, kind: clip.kind, trimIn: clip.trimIn, duration: clip.duration, speed: clip.speed ?? 1 };
}

export function matchesBackgroundRemovalScope(scope: BackgroundRemovalScope | null, projectId: string | undefined, clip: Clip | undefined): boolean {
  const current = backgroundRemovalScope(projectId, clip);
  return !!scope && !!current && scope.projectId === current.projectId && scope.clipId === current.clipId && scope.mediaId === current.mediaId && scope.kind === current.kind && scope.trimIn === current.trimIn && scope.duration === current.duration && scope.speed === current.speed;
}

export function backgroundRemovalFailureMessage(error: unknown, fallback: string): string {
  return (error instanceof Error && error.message.trim() ? error.message : fallback).slice(0, 1000);
}
