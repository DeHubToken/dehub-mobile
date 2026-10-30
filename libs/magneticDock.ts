export type DockTarget = { x: number; y: number; width: number; height: number; tint: string; hide: (hidden: boolean) => void };
type Measure = (done: (target: DockTarget | null) => void) => void;
let active: Measure | null = null;

/** Only an existing account's slow Android process startup owns this effect. */
export function shouldDockLaunch(platform: string, openingLaunch: boolean, signedIn: boolean, elapsedMs: number): boolean {
  return platform === 'android' && openingLaunch && signedIn && elapsedMs >= 400;
}

/** Only the focused header registers; cached screens cannot steal the landing. */
export function registerDockTarget(measure: Measure): () => void {
  active = measure;
  return () => { if (active === measure) active = null; };
}

export function measureDockTarget(): Promise<DockTarget | null> {
  const measure = active;
  if (!measure) return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const finish = (target: DockTarget | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(active === measure ? target : null);
    };
    const timer = setTimeout(() => finish(null), 100);
    try { measure(finish); } catch { finish(null); }
  });
}
