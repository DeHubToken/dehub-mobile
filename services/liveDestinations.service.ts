/**
 * Multistream destinations: the other platforms a creator's DeHub broadcast is
 * pushed to while they are live. Same API the web Live Studio uses. Stream keys
 * go up once and never come back; the server only returns the last four
 * characters.
 */
import { apiClient } from "../libs";

export const DESTINATION_PLATFORMS = ["twitch", "youtube", "kick", "x", "facebook", "tiktok", "instagram", "linkedin", "custom"] as const;
export type DestinationPlatform = (typeof DESTINATION_PLATFORMS)[number];
export type DestinationState = "off" | "idle" | "connecting" | "live" | "error";

export interface StreamDestination {
  id: string;
  platform: DestinationPlatform;
  label: string;
  server: string;
  keyHint: string;
  enabled: boolean;
  state: DestinationState;
  lastError: string;
}

export interface DestinationPreset {
  name: string;
  /** Prefilled server; empty where every account gets its own. */
  server: string;
  /** Where the creator finds their server and key. */
  keyUrl: string;
}

export const DESTINATION_PRESETS: Record<DestinationPlatform, DestinationPreset> = {
  twitch: { name: "Twitch", server: "rtmp://live.twitch.tv/app", keyUrl: "https://dashboard.twitch.tv/settings/stream" },
  youtube: { name: "YouTube", server: "rtmp://a.rtmp.youtube.com/live2", keyUrl: "https://studio.youtube.com/" },
  kick: { name: "Kick", server: "", keyUrl: "https://dashboard.kick.com/channel/stream" },
  x: { name: "X", server: "", keyUrl: "https://studio.x.com/producer" },
  facebook: { name: "Facebook", server: "rtmps://live-api-s.facebook.com:443/rtmp", keyUrl: "https://www.facebook.com/live/producer" },
  tiktok: { name: "TikTok", server: "", keyUrl: "https://www.tiktok.com/live/studio" },
  instagram: { name: "Instagram", server: "", keyUrl: "https://www.instagram.com/" },
  linkedin: { name: "LinkedIn", server: "", keyUrl: "https://www.linkedin.com/video/golive/now" },
  custom: { name: "Custom RTMP", server: "", keyUrl: "" },
};

const unwrap = <T,>(res: any): T => (res && typeof res === "object" && "result" in res ? res.result : res) as T;

export async function listDestinations(): Promise<StreamDestination[]> {
  const rows = unwrap<StreamDestination[]>(await apiClient.get<any>("/live/destinations", { isAuthRequired: true }));
  return Array.isArray(rows) ? rows : [];
}

export async function addDestination(input: {
  platform: DestinationPlatform;
  server: string;
  streamKey: string;
  label?: string;
}): Promise<StreamDestination> {
  return unwrap(await apiClient.post<any>("/live/destinations", input, { isAuthRequired: true }));
}

export async function updateDestination(
  id: string,
  patch: { enabled?: boolean; label?: string; server?: string; streamKey?: string },
): Promise<StreamDestination> {
  return unwrap(await apiClient.patch<any>(`/live/destinations/${encodeURIComponent(id)}`, patch, { isAuthRequired: true }));
}

export async function removeDestination(id: string): Promise<void> {
  await apiClient.delete<any>(`/live/destinations/${encodeURIComponent(id)}`, { isAuthRequired: true });
}
