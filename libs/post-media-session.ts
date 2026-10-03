/** Keeps a native media session alive while its visible surface changes. */
export interface PostMediaSession<T> {
  value: T | null;
  claims: object[];
  dispose: (value: T) => void;
  timer?: ReturnType<typeof setTimeout>;
  transferUntil: number;
  userPaused: boolean;
  listeners: Set<() => void>;
}

const sessions = new Map<string, PostMediaSession<any>>();
const GRACE_MS = 2000;

function disposeSession<T>(key: string, session: PostMediaSession<T>) {
  if (session.claims.length || sessions.get(key) !== session) return;
  clearTimeout(session.timer);
  sessions.delete(key);
  if (session.value) session.dispose(session.value);
  session.value = null;
}

function scheduleRelease<T>(key: string, session: PostMediaSession<T>) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => disposeSession(key, session), GRACE_MS);
  const parked = [...sessions].filter(([, item]) => !item.claims.length && item.value);
  while (parked.length > 2) {
    const [oldKey, oldSession] = parked.shift()!;
    disposeSession(oldKey, oldSession);
  }
}

export function postMediaSession<T>(key: string, dispose: (value: T) => void): PostMediaSession<T> {
  let session = sessions.get(key);
  if (!session) {
    session = { value: null, claims: [], dispose, transferUntil: 0, userPaused: false, listeners: new Set() };
    sessions.set(key, session);
    scheduleRelease(key, session);
  }
  return session;
}

export function claimPostMedia<T>(key: string, session: PostMediaSession<T>, token: object): () => void {
  clearTimeout(session.timer);
  session.claims.push(token);
  session.transferUntil = 0;
  session.listeners.forEach(fn => fn());
  return () => {
    const index = session.claims.indexOf(token);
    if (index >= 0) session.claims.splice(index, 1);
    session.listeners.forEach(fn => fn());
    if (session.claims.length) return;
    if (!postMediaIsTransferring(session)) {
      try { (session.value as { pause?: () => void } | null)?.pause?.(); } catch {}
    }
    scheduleRelease(key, session);
  };
}

export function ownsPostMedia<T>(session: PostMediaSession<T>, token: object): boolean {
  return session.claims[session.claims.length - 1] === token;
}

export function preparePostMediaNavigation(url: string | null | undefined): void {
  if (!url) return;
  for (const kind of ['video', 'audio']) {
    const session = sessions.get(`${kind}:${url}`);
    if (session) session.transferUntil = Date.now() + GRACE_MS;
  }
}

export function postMediaIsTransferring<T>(session: PostMediaSession<T>): boolean {
  return session.transferUntil > Date.now();
}

export function hasPostVideoSession(url: string | null | undefined): boolean {
  return !!url && !!sessions.get(`video:${url}`)?.value;
}
