/**
 * Signed-out reading ends a little way into any feed (riftn-backend
 * common/util/signed-out-wall.ts: 100 posts). Past it the API answers an
 * empty page flagged `signInRequired`, which ends the feed on its own; this
 * turns it into the sign-in sheet (context/AuthContext), once a minute at
 * most, the way X asks you to sign in to keep scrolling.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const QUIET_MS = 60_000;
let lastAsked = 0;

export function isSignInWall(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { signInRequired?: unknown }).signInRequired === true;
}

export function noteSignInWall(body: unknown): void {
  if (!isSignInWall(body)) return;
  const now = Date.now();
  if (now - lastAsked < QUIET_MS) return;
  lastAsked = now;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A broken listener must not break the request that noticed the wall.
    }
  });
}

export function onSignInWall(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetSignInWallForTests(): void {
  lastAsked = 0;
  listeners.clear();
}
