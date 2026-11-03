/**
 * Live clips: a viewer's "Clip this moment" on a live stream.
 *
 * The same flow as web (dehubweb src/lib/api/live-clips.ts). The live-clips
 * function grabs the last minute of the stream, the worker cuts the picked
 * stretch into a vertical MP4, and the finished file is posted as a Short from
 * the clipper's account, then reported back so dehub.io/clip/<n> links to it.
 */
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { getAuthToken } from "../libs/auth.utils";
import { minNft } from "./nft.service";

export type LiveClipStatus = "capturing" | "draft" | "rendering" | "ready" | "posted" | "dismissed" | "failed";

export interface LiveClip {
  id: string;
  shortId: number;
  kind: "viewer" | "highlight";
  status: LiveClipStatus;
  streamTokenId: number;
  streamTitle: string;
  streamerAddress: string;
  streamerUsername: string | null;
  clipperAddress: string | null;
  clipperUsername: string | null;
  sourceKind: "live" | "replay";
  sourceUrl: string | null;
  windowStart: number;
  windowEnd: number;
  start: number | null;
  end: number | null;
  title: string;
  error: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  postTokenId: number | null;
}

export const CLIP_MIN_S = 3;
export const CLIP_MAX_S = 60;

async function call<T>(body: Record<string, unknown>, signedIn: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (signedIn) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in to clip this stream.");
    headers["x-dehub-token"] = token;
  }
  const { data, error } = await supabase.functions.invoke("live-clips", { body, headers });
  if (data?.error) throw new Error(String(data.error));
  if (error) {
    // A non-2xx answer carries the reason in its body.
    const context = (error as { context?: Response }).context;
    const reason = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
    throw new Error(reason?.error || error.message || "Clip request failed");
  }
  return data as T;
}

/** Start a clip: grabs the last minute of the live stream. */
export async function captureLiveClip(tokenId: string | number): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: "capture", tokenId: String(tokenId) }, true)).clip;
}

export async function getLiveClip(id: string): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: "get", id }, false)).clip;
}

export async function renderLiveClip(id: string, start: number, end: number, title: string): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: "render", id, start, end, title }, true)).clip;
}

/** Poll a clip until it leaves `waiting`, or give up after `timeoutMs`. */
export async function waitForClip(
  id: string,
  waiting: LiveClipStatus,
  { timeoutMs = 180_000, everyMs = 2_000, isCancelled }: { timeoutMs?: number; everyMs?: number; isCancelled?: () => boolean } = {},
): Promise<LiveClip | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled?.()) return null;
    const clip = await getLiveClip(id);
    if (clip.status !== waiting) return clip;
    if (Date.now() > until) throw new Error("This is taking longer than usual. Try again in a minute.");
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

export function liveClipLink(clip: Pick<LiveClip, "shortId">): string {
  return `https://dehub.io/clip/${clip.shortId}`;
}

/** The Short's caption: who it came from, then the clip page. Same words as web. */
export function liveClipCaption(clip: LiveClip): string {
  const streamer = clip.streamerUsername ? `@${clip.streamerUsername}` : "this stream";
  const credit = clip.kind === "viewer" && clip.clipperUsername && clip.clipperAddress !== clip.streamerAddress
    ? `Clipped from ${streamer}'s live by @${clip.clipperUsername}`
    : `Clipped from ${streamer}'s live`;
  return `${credit}\n${liveClipLink(clip)}`;
}

/** Keep [start, end] inside the window and 3-60 s long, moving the side that was not dragged. */
export function clampRange(start: number, end: number, lo: number, hi: number, moved: "start" | "end"): [number, number] {
  let s = Math.max(lo, Math.min(start, hi));
  let e = Math.max(lo, Math.min(end, hi));
  if (moved === "start") {
    if (e - s < CLIP_MIN_S) e = Math.min(hi, s + CLIP_MIN_S);
    if (e - s > CLIP_MAX_S) e = s + CLIP_MAX_S;
    if (e - s < CLIP_MIN_S) s = Math.max(lo, e - CLIP_MIN_S);
  } else {
    if (e - s < CLIP_MIN_S) s = Math.max(lo, e - CLIP_MIN_S);
    if (e - s > CLIP_MAX_S) s = e - CLIP_MAX_S;
    if (e - s < CLIP_MIN_S) e = Math.min(hi, s + CLIP_MIN_S);
  }
  return [Math.round(s * 10) / 10, Math.round(e * 10) / 10];
}

async function download(url: string, name: string): Promise<string> {
  const target = `${FileSystem.cacheDirectory}${name}`;
  const res = await FileSystem.downloadAsync(url, target);
  if (res.status < 200 || res.status >= 300) throw new Error("Could not load the clip");
  return res.uri;
}

/**
 * Post the rendered clip as a Short from `wallet`, then tell the function
 * which post it became. Safe to repeat: the clip id is the idempotency key, so
 * a retry returns the post already made.
 */
export async function postLiveClip(clip: LiveClip, wallet: string, chainId = 8453): Promise<LiveClip> {
  if (clip.status === "posted") return clip;
  if (!clip.videoUrl) throw new Error("The clip is not ready yet");
  const [video, poster] = await Promise.all([
    download(clip.videoUrl, `clip-${clip.shortId}.mp4`),
    clip.posterUrl ? download(clip.posterUrl, `clip-${clip.shortId}.jpg`) : Promise.resolve(null),
  ]);
  const fd = new FormData();
  fd.append("idempotencyKey", `live-clip-${clip.id}`);
  fd.append("name", (clip.title || clip.streamTitle || "Live clip").slice(0, 100));
  fd.append("description", liveClipCaption(clip));
  fd.append("postType", "video");
  fd.append("chainId", String(chainId));
  fd.append("category", JSON.stringify(["General"]));
  fd.append("minter", wallet);
  fd.append("mintOptOut", "true");
  // @ts-ignore RN FormData file shape
  fd.append("files", { uri: video, name: `clip-${clip.shortId}.mp4`, type: "video/mp4" } as any);
  // @ts-ignore RN FormData file shape
  if (poster) fd.append("files", { uri: poster, name: "thumbnail.jpg", type: "image/jpeg" } as any);
  const res = await minNft(fd);
  if (!res?.createdTokenId) throw new Error(res?.msg || "The Short was not created");
  return (await call<{ clip: LiveClip }>({ action: "posted", id: clip.id, postTokenId: String(res.createdTokenId) }, true)).clip;
}
