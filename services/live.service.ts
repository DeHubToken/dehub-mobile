import { apiClient } from "../libs";

export type CreateLiveRequest = {
  name: string;
  description: string;
  category: string[];
  streamInfo?: Record<string, unknown>;
  scheduleAt?: number | null;
  thumbnailUri?: string | null; // optional local file URI
};

export type CreateLiveResponse = {
  error: boolean;
  msg?: string;
  streamId: string;
  streamKey: string;
  ingestUrl: string;
  playbackId?: string;
  createdTokenId?: number;
  timestamp?: number;
  v?: number;
  r?: string;
  s?: string;
};

export async function createLiveSession(payload: CreateLiveRequest) {
  // If thumbnail present, send multipart; else JSON
  if (payload.thumbnailUri) {
    const form = new FormData();
    form.append("name", payload.name);
    form.append("description", payload.description);
    form.append("postType", "live");
    form.append("category", JSON.stringify(payload.category));
    if (payload.streamInfo) form.append("streamInfo", JSON.stringify(payload.streamInfo));
    if (payload.scheduleAt) form.append("scheduleAt", String(payload.scheduleAt));
    try {
      const uri = payload.thumbnailUri;
      const filename = uri.split("/").pop() || `thumbnail-${Date.now()}.jpg`;
      const file: any = { uri, name: filename, type: "image/jpeg" };
      form.append("thumbnail", file);
    } catch {}
    return apiClient.post<CreateLiveResponse>("/user_live_create", form, { isAuthRequired: true });
  }
  return apiClient.post<CreateLiveResponse>(
    "/user_live_create",
    {
      name: payload.name,
      description: payload.description,
      postType: "live",
      category: payload.category,
      streamInfo: payload.streamInfo || {},
      scheduleAt: payload.scheduleAt ?? null,
    },
    { isAuthRequired: true }
  );
}

// --- New unified /live creation (post signature + on-chain mint) ---
// Mirrors web go-live FormData structure: JSON stringify complex fields.
export interface CreateLiveStreamInput {
  title: string; // name/title
  description: string;
  tokenId: number; // on-chain tokenId minted
  categories: string[];
  streamInfo: Record<string, any>; // already filtered
  settings: { enableChat: boolean; schedule: boolean; minTip: number; tipDelay?: number };
  status?: "LIVE" | "SCHEDULED"; // backend expects LIVE or SCHEDULED
  scheduledFor?: Date | string | number | null;
  // optional local thumbnail uri
  thumbnailUri?: string | null;
}

export interface CreateLiveStreamResponse {
  _id: string; // livestreamId
  tokenId: number;
  playbackId?: string;
  streamKey?: string;
  livepeerId?: string;
  status?: string;
  scheduledFor?: string;
  ingestUrl?: string;
  thumbnail?: string;
  settings?: any;
  streamInfo?: any;
  [k: string]: any;
}

export async function createLiveStream(input: CreateLiveStreamInput) {
  const form = new FormData();
  form.append("title", input.title);
  form.append("description", input.description || "");
  form.append("tokenId", String(input.tokenId));
  form.append("categories", JSON.stringify(input.categories || []));
  form.append("streamInfo", JSON.stringify(input.streamInfo || {}));
  form.append(
    "settings",
    JSON.stringify({
      enableChat: !!input.settings?.enableChat,
      schedule: !!input.settings?.schedule,
      minTip: Number(input.settings?.minTip) || 1000,
      tipDelay: Number(input.settings?.tipDelay || 0),
    })
  );
  const scheduled = input.settings?.schedule && input.scheduledFor != null;
  if (scheduled) {
    // Backend expects scheduledFor (Date). Accept number, string, Date
    let dateVal: any = input.scheduledFor;
    if (dateVal instanceof Date) dateVal = dateVal.toISOString();
    else if (typeof dateVal === "number") dateVal = new Date(dateVal).toISOString();
    form.append("scheduledFor", dateVal);
    form.append("status", "SCHEDULED");
  } else {
    form.append("status", input.status || "LIVE");
  }
  if (input.thumbnailUri) {
    try {
      const uri = input.thumbnailUri;
      const filename = uri.split("/").pop() || `thumbnail-${Date.now()}.jpg`;
      const file: any = { uri, name: filename, type: "image/jpeg" };
      form.append("thumbnail", file);
    } catch {}
  }

  // Endpoint: /live (auth required)
  const res = await apiClient.post<CreateLiveStreamResponse>("/live", form, {
    isAuthRequired: true,
  });
  return res;
}

export interface ScheduledLiveItem {
  streamId: string;
  name: string;
  scheduleAt?: number | null;
  thumbnailUrl?: string | null;
}

export async function getScheduledLives(): Promise<ScheduledLiveItem[]> {
  try {
    const res = await apiClient.get<any>("/user_live_scheduled", { isAuthRequired: true });
    const list: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res) ? res : [];
    return list
      .filter((i) => i && i.scheduleAt && i.scheduleAt > Date.now())
      .map((i) => ({
        streamId: i.streamId || i.id || i.tokenId || String(i.streamId || i.id || i.tokenId),
        name: i.name || i.title || "Untitled",
        scheduleAt: Number(i.scheduleAt) || null,
        thumbnailUrl: i.thumbnailUrl || i.imageUrl || null,
      }));
  } catch (e) {
    console.warn("[live.service] getScheduledLives error", e);
    return [];
  }
}

// Fetch scheduled streams for a specific user address
export async function getUserScheduledLives(address: string): Promise<ScheduledLiveItem[]> {
  if (!address) return [];
  try {
    const res = await apiClient.get<any>(`/live/user/${encodeURIComponent(address)}/scheduled`, { isAuthRequired: true });
    const arr: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res) ? res : [];
    return arr
      .filter((i) => i && i.scheduledFor && new Date(i.scheduledFor).getTime() > Date.now())
      .map((i) => ({
        streamId: i._id || i.streamId || i.id || String(i._id || i.streamId || i.id),
        name: i.title || i.name || 'Untitled',
        scheduleAt: i.scheduledFor ? new Date(i.scheduledFor).getTime() : null,
        thumbnailUrl: i.thumbnail || i.thumbnailUrl || null,
      }));
  } catch (e) {
    console.warn('[live.service] getUserScheduledLives error', e);
    return [];
  }
}
