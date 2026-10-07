/** One decoder per simultaneous use, rather than one per source or timeline cut. */
export function leaseMedia<T>(clips: { id: string; mediaId: string }[], base: Map<string, T>, extra: Map<string, T>, create: (source: T) => T, release: (source: T) => void): Map<string, T> {
  const aliases = new Map<string, T>();
  const counts = new Map<string, number>();
  const used = new Set<string>();
  for (const clip of clips) {
    const source = base.get(clip.mediaId);
    if (!source) continue;
    const index = counts.get(clip.mediaId) ?? 0;
    counts.set(clip.mediaId, index + 1);
    if (!index) { aliases.set(clip.id, source); continue; }
    const key = JSON.stringify([clip.mediaId, index]);
    used.add(key);
    let copy = extra.get(key);
    if (!copy) { copy = create(source); extra.set(key, copy); }
    aliases.set(clip.id, copy);
  }
  for (const [key, source] of extra) if (!used.has(key)) { release(source); extra.delete(key); }
  return aliases;
}
