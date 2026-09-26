// Livepeer stream status for the mobile client.
//
// Read through the livepeer-stream-status edge function so the Livepeer API
// key stays on the server; the app only ever ships the Supabase publishable
// key. The function returns a trimmed stream object and 404s when Livepeer
// has no such stream, which callers treat as ended.

import env from '../config/env';

export interface LivepeerStreamInfo {
  id: string;
  playbackId?: string | null;
  isActive: boolean;
  lastSeen?: number | null;
  createdAt?: number | null;
}

export async function getLivepeerStream(livepeerId: string): Promise<LivepeerStreamInfo> {
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/livepeer-stream-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ streamId: livepeerId }),
  });
  if (!res.ok) throw new Error(`Livepeer stream status ${res.status}`);
  return res.json();
}
