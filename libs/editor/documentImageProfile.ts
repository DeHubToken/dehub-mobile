export const DOCUMENT_IMAGE_PROFILES = [
  { id: "compact", label: "Smaller file", quality: 0.8, maxEdge: 1600 },
  { id: "standard", label: "Balanced", quality: 0.95, maxEdge: 2048 },
  { id: "detail", label: "High detail", quality: 0.98, maxEdge: 4096 },
] as const;
export type DocumentImageProfile = typeof DOCUMENT_IMAGE_PROFILES[number]["id"];
export function documentImageProfile(id: unknown) { return DOCUMENT_IMAGE_PROFILES.find(profile => profile.id === id) ?? DOCUMENT_IMAGE_PROFILES[1]; }
export function documentImageScale(width: number, height: number, requested: number, id: unknown): number {
  if (![width, height, requested].every(value => Number.isFinite(value) && value > 0)) throw new Error("Choose valid export dimensions");
  return Math.min(requested, documentImageProfile(id).maxEdge / Math.max(width, height));
}
