// Livepeer API helpers (polling & basic stream fetch) for mobile client.

export interface LivepeerStreamInfo {
  id: string;
  playbackId?: string;
  isActive: boolean;
  lastSeen?: number;
  createdAt?: number;
  [k: string]: any;
}

const LIVEPEER_BASE = 'https://livepeer.studio/api';

import env from '../config/env';

async function lpFetch(path: string) {
  const apiKey = env.LIVEPEER_API_KEY;
  if (!apiKey) throw new Error('Missing LIVEPEER_API_KEY env');
  const res = await fetch(`${LIVEPEER_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Livepeer ${path} ${res.status}`);
  return res.json();
}

export async function getLivepeerStream(livepeerId: string): Promise<LivepeerStreamInfo> {
  return lpFetch(`/stream/${encodeURIComponent(livepeerId)}`);
}

export async function waitForLivepeerActive(params: {
  livepeerId: string;
  timeoutMs?: number;
  intervalMs?: number;
  consecutive?: number;
  abortSignal?: AbortSignal;
  onTick?: (info: LivepeerStreamInfo) => void;
}): Promise<boolean> {
  const { livepeerId, timeoutMs = 25000, intervalMs = 3500, consecutive = 2, abortSignal, onTick } = params;
  const start = Date.now();
  let streak = 0;
  while (Date.now() - start < timeoutMs) {
    if (abortSignal?.aborted) return false;
    try {
      const info = await getLivepeerStream(livepeerId);
      onTick?.(info);
      if (info.isActive) {
        streak += 1;
        if (streak >= consecutive) return true;
      } else {
        streak = 0;
      }
    } catch {
      // ignore transient
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
