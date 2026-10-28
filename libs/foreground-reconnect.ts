/** A foreground transition owns at most one pending reconnect. */
export function createForegroundReconnect(connect: () => void, allowed: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  return {
    cancel,
    schedule(delay: number) {
      cancel();
      timer = setTimeout(() => { timer = null; if (allowed()) connect(); }, delay);
    },
  };
}
