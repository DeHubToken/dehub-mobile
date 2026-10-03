const galleries = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

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
