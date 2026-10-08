import type { MediaClip, ProjectSnapshot } from "./types";

export interface AssemblyAsset {
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  size?: number;
  createdAt?: number;
}
const libraryId = (id: string) => `@assembly-library:${id}`;
const valid = (asset: AssemblyAsset) => typeof asset.id === "string" && !!asset.id && typeof asset.name === "string"
  && !asset.name.startsWith(".dehub-video-matte-") && ["image", "video", "audio"].includes(asset.kind)
  && (asset.kind === "image" || (Number.isFinite(asset.duration) && (asset.duration ?? 0) >= 0.05));

export function assemblyCatalog(assets: readonly AssemblyAsset[]): AssemblyAsset[] {
  const seen = new Set<string>();
  return assets.filter(asset => {
    if (!valid(asset) || seen.has(asset.id)) return false;
    seen.add(asset.id); return true;
  }).map(asset => ({
    id: asset.id, name: asset.name, kind: asset.kind, duration: asset.duration,
    width: asset.width, height: asset.height, mimeType: asset.mimeType, size: asset.size, createdAt: asset.createdAt,
  }));
}

/** A review source contains actual imported files without editing the original. */
export function assemblyLibrarySource(original: ProjectSnapshot, assets: readonly AssemblyAsset[]): ProjectSnapshot {
  const used = new Set(original.clips.flatMap(clip => "mediaId" in clip ? [clip.mediaId] : []));
  const ids = new Set(original.clips.map(clip => clip.id));
  const trackIds = new Set(original.tracks.map(track => track.id));
  const clips = [...original.clips], tracks = [...original.tracks];
  for (const asset of assemblyCatalog(assets)) {
    if (used.has(asset.id) || ids.has(libraryId(asset.id))) continue;
    let trackId = `${libraryId(asset.id)}:track`;
    while (trackIds.has(trackId)) trackId += "_";
    trackIds.add(trackId);
    tracks.push({ id: trackId, kind: asset.kind === "audio" ? "audio" : "video", name: asset.name, hidden: false, muted: false });
    clips.push({ id: libraryId(asset.id), mediaId: asset.id, trackId, kind: asset.kind, start: 0,
      duration: asset.kind === "image" ? 5 : asset.duration!, trimIn: 0, fit: "contain",
      ...(asset.kind !== "image" ? { sourceDuration: asset.duration } : {}),
    });
  }
  return { ...original, clips, tracks };
}

export function selectedAssemblyAssets(original: ProjectSnapshot, plan: { shots: { id: string }[]; soundId: string | null }, assets: readonly AssemblyAsset[]): AssemblyAsset[] {
  const originalIds = new Set(original.clips.map(clip => clip.id));
  const chosen = new Set([...plan.shots.map(shot => shot.id), ...(plan.soundId ? [plan.soundId] : [])]);
  return assemblyCatalog(assets).filter(asset => !originalIds.has(libraryId(asset.id)) && chosen.has(libraryId(asset.id)));
}

export function assemblyCatalogMatches(original: ProjectSnapshot, plan: { shots: { id: string }[]; soundId: string | null }, captured: readonly AssemblyAsset[], current: readonly AssemblyAsset[]): boolean {
  const known = new Set(assemblyLibrarySource(original, captured).clips.map(clip => clip.id));
  if (plan.shots.some(shot => !known.has(shot.id)) || (plan.soundId !== null && !known.has(plan.soundId))) return false;
  const available = new Map(assemblyCatalog(current).map(asset => [asset.id, asset]));
  return selectedAssemblyAssets(original, plan, captured).every(asset => {
    const now = available.get(asset.id);
    return !!now && JSON.stringify(asset) === JSON.stringify(now);
  });
}

export function assemblyPreviewProject(original: ProjectSnapshot, clip: MediaClip): ProjectSnapshot {
  const settings = { ...original.settings }; delete settings.pages;
  return { ...original, id: `${original.id}:media-preview`, settings, clips: [clip],
    tracks: [{ id: clip.trackId, kind: clip.kind === "audio" ? "audio" : "video", name: original.title, hidden: false, muted: false }],
  };
}
