type Mode = 'portrait' | 'landscape' | 'unlocked';
type Size = { width: number; height: number } | null;

/** Serialize native rotations so a slow enter cannot win after exit. */
export function createLiveViewerOrientation(actions: Record<Mode, () => Promise<unknown>>) {
  let requested: Mode = 'portrait';
  let applied: Mode | undefined;
  let running = false;
  async function drain() {
    running = true;
    while (applied !== requested) {
      const target = requested;
      try { await actions[target](); } catch { /* Layout still fills the viewer if rotation is unavailable. */ }
      applied = target;
    }
    running = false;
  }
  return (immersive: boolean, size: Size = null) => {
    requested = !immersive ? 'portrait'
      : !size || size.width <= 0 || size.height <= 0 ? 'unlocked'
      : size.width > size.height ? 'landscape' : 'portrait';
    if (!running) void drain();
  };
}
