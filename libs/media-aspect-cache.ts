/** Persist a small set of dimensions so revisits reserve space before decoding. */
export function createMediaAspectCache(read: () => string | null | undefined, write: (value: string) => void) {
  const entries = new Map<string, number>();
  let hydrated = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    try {
      const saved: unknown = JSON.parse(read() || '[]');
      if (Array.isArray(saved)) for (const entry of saved.slice(-250)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0) entries.set(entry[0], entry[1]);
      }
    } catch { /* Storage is optional; the in-memory measurements still work. */ }
  };
  return {
    get(key: string) { hydrate(); return entries.get(key); },
    set(key: string, ratio: number) {
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      hydrate();
      if (entries.get(key) === ratio) return;
      entries.delete(key);
      entries.set(key, ratio);
      if (entries.size > 250) entries.delete(entries.keys().next().value!);
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        try { write(JSON.stringify([...entries])); } catch { /* Quota/private mode. */ }
      }, 500);
    },
  };
}
