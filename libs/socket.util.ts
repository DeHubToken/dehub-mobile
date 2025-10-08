import { getAuthToken } from './auth.utils';

export type SocketAck = (resp?: any, err?: any) => void;

/**
 * Base socket emitter that automatically attaches the latest auth token when available.
 * It merges a `token` field into the payload without mutating the original object.
 */
export async function emitWithAuth(
  emitFn: (event: string, payload?: any, ack?: SocketAck) => void,
  event: string,
  payload?: any,
  ack?: SocketAck
) {
  try {
    const token = await getAuthToken();
    const merged = token
      ? { ...(payload || {}), token }
      : (payload ?? undefined);
    emitFn(event, merged, ack);
  } catch {
    emitFn(event, payload, ack);
  }
}

/**
 * React hook: returns a wrapper that emits with auth using the context's emit.
 */
// Note: preferred usage is emitAuthed from WebSocketContext; this util remains for non-React contexts.
