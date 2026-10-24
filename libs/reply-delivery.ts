import { useCallback, useSyncExternalStore } from 'react';
import { updateCommentCount } from './comment-count-store';

export type ReplyDelivery = {
  status: 'sending' | 'posted' | 'failed';
  error?: string;
  retry?: () => Promise<void>;
};
const deliveries = new Map<string, ReplyDelivery>();
const listeners = new Set<() => void>();
const keyOf = (post: string | number, id: string | number) => `${post}:${id}`;
const notify = () => listeners.forEach(listener => listener());

export function readReplyDelivery(tokenId: string | number, id: string | number): ReplyDelivery | undefined {
  return deliveries.get(keyOf(tokenId, id));
}

function setDelivery(key: string, value: ReplyDelivery) {
  deliveries.set(key, value);
  if (deliveries.size > 500) deliveries.delete(deliveries.keys().next().value!);
  notify();
}

export function replyIdOf(value: unknown): string | number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const nested = row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : row;
  const id = nested.id ?? nested.commentId ?? row.commentId;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

/** Only the request can fail into Retry. A refresh failure must never repost. */
export async function deliverReply<T>(options: {
  tokenId: string | number;
  tempId: string | number;
  request: () => Promise<T>;
  onSuccess: (result: T) => void | Promise<void>;
  onFailure: (error: unknown) => void;
  onStart?: () => void;
  onSettled?: () => void;
}): Promise<void> {
  const key = keyOf(options.tokenId, options.tempId);
  if (deliveries.get(key)?.status === 'sending') return;
  const attempt = async (): Promise<void> => {
    if (deliveries.get(key)?.status === 'sending') return;
    setDelivery(key, { status: 'sending' });
    options.onStart?.();
    updateCommentCount(String(options.tokenId), 1);
    let result: T;
    try {
      result = await options.request();
    } catch (error) {
      updateCommentCount(String(options.tokenId), -1);
      setDelivery(key, {
        status: 'failed',
        error: error instanceof Error ? error.message : undefined,
        retry: attempt,
      });
      options.onFailure(error);
      options.onSettled?.();
      return;
    }
    const posted = { status: 'posted' } as const;
    const realId = replyIdOf(result);
    const realKey = realId == null ? key : keyOf(options.tokenId, realId);
    setDelivery(key, posted);
    if (realKey !== key) setDelivery(realKey, posted);
    setTimeout(() => {
      if (deliveries.get(key) === posted) deliveries.delete(key);
      if (deliveries.get(realKey) === posted) deliveries.delete(realKey);
      notify();
    }, 2400);
    try { await options.onSuccess(result); }
    catch (error) { console.error('Reply refresh failed after posting', error); }
    finally { options.onSettled?.(); }
  };
  await attempt();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useReplyDelivery(tokenId: string | number | undefined, id: string | number): ReplyDelivery | undefined {
  const key = keyOf(tokenId ?? '', id);
  const snapshot = useCallback(() => deliveries.get(key), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
