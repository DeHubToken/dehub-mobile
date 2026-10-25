const galleries = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
const presentedImages = new Set<string>();

/** A route reusing a just-painted bitmap does not need a new loading spinner. */
export function wasImagePresented(uri: string): boolean {
  return presentedImages.has(uri);
}

export function rememberPresentedImage(uri: string): void {
  presentedImages.delete(uri);
  presentedImages.add(uri);
  if (presentedImages.size > 200) presentedImages.delete(presentedImages.values().next().value!);
}

export function forgetPresentedImage(uri: string): void {
  presentedImages.delete(uri);
}

export function galleryIndex(key: string): number {
  return galleries.get(key) ?? 0;
}

export function rememberGalleryIndex(key: string, index: number): void {
  if (galleryIndex(key) === index) return;
  galleries.delete(key);
  galleries.set(key, index);
  if (galleries.size > 128) galleries.delete(galleries.keys().next().value!);
  listeners.get(key)?.forEach(fn => fn());
}

export function subscribeGallery(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  listeners.set(key, set);
  set.add(listener);
  return () => { set.delete(listener); if (!set.size) listeners.delete(key); };
}
