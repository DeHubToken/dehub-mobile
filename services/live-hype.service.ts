/**
 * Hype trains on the stream API (web: src/lib/api/dehub/live-hype.ts). Gifts
 * and subscriptions are counted on the server, so every screen shows the same
 * level and countdown.
 */
import { apiClient } from "../libs/api.client";

export interface HypeTrain {
  streamId: string;
  active: boolean;
  level: number;
  completed: number;
  into: number;
  need: number;
  expiresAt: string;
  contributors: number;
  top: Array<{ username?: string; displayName?: string; address?: string; points: number }>;
  ended: boolean;
  levelUp: boolean;
}

export function parseHypeTrain(raw: any): HypeTrain | null {
  if (!raw || typeof raw !== "object" || !raw.streamId) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    streamId: String(raw.streamId),
    active: !!raw.active,
    level: Math.max(1, n(raw.level)),
    completed: n(raw.completed),
    into: n(raw.into),
    need: Math.max(1, n(raw.need)),
    expiresAt: String(raw.expiresAt || ""),
    contributors: n(raw.contributors),
    top: Array.isArray(raw.top)
      ? raw.top.slice(0, 3).map((u: any) => ({
        username: u?.username || u?.user?.username,
        displayName: u?.displayName || u?.user?.displayName,
        address: u?.address || u?.walletAddress || u?.user?.address,
        points: n(u?.points),
      }))
      : [],
    ended: !!raw.ended,
    levelUp: !!raw.levelUp,
  };
}

export async function getHypeTrain(streamId: string): Promise<HypeTrain | null> {
  if (!streamId) return null;
  const res: any = await apiClient.get<any>(`/live-hype/stream/${encodeURIComponent(streamId)}`);
  const body = res?.data ?? res;
  return parseHypeTrain((body?.result ?? body)?.train);
}
