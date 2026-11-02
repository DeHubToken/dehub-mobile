/**
 * Remix links: duets, stitches and reactions made from another creator's video.
 *
 * The same records the website keeps (dehubweb src/lib/remix-links.ts). One
 * row per remix in the public `remix_links` table, counts per original in the
 * `remix_counts` view, and each creator's "who may remix" choice in
 * `remix_settings`. All three are readable by anyone; the remix-links edge
 * function is their only writer, so saving a setting goes through it with the
 * signed-in account's token.
 *
 * Feed cards ask for their remix info in the same tick, so lookups are
 * batched: a page of cards costs one request for links and one for counts.
 */
import { supabase } from "./supabase";
import { getAuthToken } from "../libs/auth.utils";

export type RemixKind = "duet" | "stitch" | "react";
export type RemixLinkKind = RemixKind | "react_live";
export type RemixPolicy = "everyone" | "followers" | "nobody";

export interface RemixLink {
  id: string;
  kind: RemixLinkKind;
  sourceTokenId: number;
  sourceAddress: string;
  sourceUsername: string | null;
  remixerAddress: string;
  remixerUsername: string | null;
  remixTokenId: number | null;
  streamTokenId: number | null;
  active: boolean;
  createdAt: string;
}

export interface RemixCounts { duets: number; stitches: number; reactions: number }

/** What one post was made from, and what was made from it. */
export interface RemixInfo {
  /** The original this post duets, stitches or reacts to. */
  source: { kind: RemixKind; tokenId: number; username: string | null; address: string } | null;
  counts: RemixCounts;
}

const NO_COUNTS: RemixCounts = { duets: 0, stitches: 0, reactions: 0 };
export const NO_REMIX_INFO: RemixInfo = { source: null, counts: NO_COUNTS };

const LINK_COLUMNS =
  "id, kind, source_token_id, source_address, source_username, remixer_address, remixer_username, remix_token_id, stream_token_id, active, created_at";

function toLink(row: any): RemixLink {
  return {
    id: String(row.id),
    kind: row.kind,
    sourceTokenId: Number(row.source_token_id),
    sourceAddress: row.source_address ?? "",
    sourceUsername: row.source_username ?? null,
    remixerAddress: row.remixer_address ?? "",
    remixerUsername: row.remixer_username ?? null,
    remixTokenId: row.remix_token_id == null ? null : Number(row.remix_token_id),
    streamTokenId: row.stream_token_id == null ? null : Number(row.stream_token_id),
    active: !!row.active,
    createdAt: row.created_at,
  };
}

const isTokenId = (id: string) => /^[1-9]\d{0,14}$/.test(id);

// ─── Batched info for cards ─────────────────────────────────────────────────

const infoCache = new Map<string, Promise<RemixInfo>>();
let queue = new Map<string, (info: RemixInfo) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function loadInfo(ids: number[]): Promise<Record<string, RemixInfo>> {
  const [links, counts] = await Promise.all([
    supabase.from("remix_links").select("remix_token_id, kind, source_token_id, source_username, source_address").in("remix_token_id", ids),
    supabase.from("remix_counts").select("source_token_id, duets, stitches, reactions").in("source_token_id", ids),
  ]);
  if (links.error) throw links.error;
  if (counts.error) throw counts.error;
  const out: Record<string, RemixInfo> = {};
  for (const id of ids) out[String(id)] = { source: null, counts: NO_COUNTS };
  for (const row of (links.data ?? []) as any[]) {
    const kind: RemixKind = row.kind === "react_live" ? "react" : row.kind;
    const entry = out[String(row.remix_token_id)];
    if (entry && !entry.source) {
      entry.source = { kind, tokenId: Number(row.source_token_id), username: row.source_username ?? null, address: row.source_address ?? "" };
    }
  }
  for (const row of (counts.data ?? []) as any[]) {
    const entry = out[String(row.source_token_id)];
    if (entry) {
      entry.counts = {
        duets: Number(row.duets) || 0,
        stitches: Number(row.stitches) || 0,
        reactions: Number(row.reactions) || 0,
      };
    }
  }
  return out;
}

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    let found: Record<string, RemixInfo> = {};
    try {
      found = await loadInfo(chunk.map(Number));
    } catch {
      // A failed lookup only hides the chips; ask again next time.
      for (const id of chunk) infoCache.delete(id);
    }
    for (const id of chunk) batch.get(id)?.(found[id] ?? NO_REMIX_INFO);
  }
}

/** Remix info for one post. Posts asked for in the same tick share one request. */
export function getRemixInfo(tokenId: string | number | null | undefined): Promise<RemixInfo> {
  const id = tokenId == null ? "" : String(tokenId);
  if (!isTokenId(id)) return Promise.resolve(NO_REMIX_INFO);
  const hit = infoCache.get(id);
  if (hit) return hit;
  const pending = new Promise<RemixInfo>((resolve) => {
    queue.set(id, resolve);
    timer ??= setTimeout(() => void flush(), 30);
  });
  infoCache.set(id, pending);
  return pending;
}

// ─── Lists ──────────────────────────────────────────────────────────────────

export const REMIX_PAGE_SIZE = 20;

/** Newest first. `react` includes live reactions. */
export async function listRemixLinks(sourceTokenId: string | number, kind: RemixKind, page = 0) {
  const kinds: RemixLinkKind[] = kind === "react" ? ["react", "react_live"] : [kind];
  const from = page * REMIX_PAGE_SIZE;
  const { data, error } = await supabase
    .from("remix_links")
    .select(LINK_COLUMNS)
    .eq("source_token_id", Number(sourceTokenId))
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .range(from, from + REMIX_PAGE_SIZE);
  if (error) throw error;
  const rows = ((data ?? []) as any[])
    .map(toLink)
    // A recorded remix needs its post; a live reaction shows while it has a stream.
    .filter((link) => link.remixTokenId != null || (link.kind === "react_live" && link.streamTokenId != null));
  return { links: rows.slice(0, REMIX_PAGE_SIZE), hasMore: (data ?? []).length > REMIX_PAGE_SIZE };
}

// ─── Who may remix ──────────────────────────────────────────────────────────

export type RemixSettings = Record<RemixKind, RemixPolicy>;

/** A creator's account defaults. Anything unset reads as "everyone". */
export async function getAccountRemixSettings(owner: string): Promise<RemixSettings> {
  const { data, error } = await supabase
    .from("remix_settings")
    .select("allow_duet, allow_stitch, allow_react")
    .eq("owner_address", owner.toLowerCase())
    .is("token_id", null)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as Record<string, RemixPolicy | null>;
  return {
    duet: row.allow_duet ?? "everyone",
    stitch: row.allow_stitch ?? "everyone",
    react: row.allow_react ?? "everyone",
  };
}

/** Saves the signed-in account's default for one kind of remix. */
export async function saveAccountRemixSetting(kind: RemixKind, value: RemixPolicy): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error("not-signed-in");
  const key = kind === "duet" ? "allowDuet" : kind === "stitch" ? "allowStitch" : "allowReact";
  const { data, error } = await supabase.functions.invoke("remix-links", {
    body: { action: "settings-set", [key]: value },
    headers: { "x-dehub-token": token },
  });
  if (data?.error) throw new Error(String(data.error));
  if (error) throw error;
}

// ─── Live clips ─────────────────────────────────────────────────────────────

/**
 * dehub.io/clip/<n>: the Short a live clip was posted as, or the stream it
 * came from when the Short is not there. Null when the clip is not public.
 */
export async function resolveClip(clipId: string): Promise<{ postTokenId: number | null; streamTokenId: number } | null> {
  if (!/^\d{1,15}$/.test(clipId)) return null;
  const { data, error } = await supabase
    .from("live_clips")
    .select("post_token_id, stream_token_id")
    .eq("short_id", Number(clipId))
    .eq("status", "posted")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { post_token_id: number | null; stream_token_id: number };
  return { postTokenId: row.post_token_id == null ? null : Number(row.post_token_id), streamTokenId: Number(row.stream_token_id) };
}

// ─── Tip split ──────────────────────────────────────────────────────────────

export interface RemixShare { sourceTokenId: number; sourceAddress: string; splitBps: number }

/**
 * The original creator's cut when the tipped post is a duet, stitch or
 * reaction of their video, as web's use-tip-payment does. Never blocks a tip:
 * no answer within 2.5s, or any doubt, means no split.
 */
export async function remixShareFor(tokenId: string | number | null | undefined, creatorAddress: string, tipper: string): Promise<RemixShare | null> {
  const id = tokenId == null ? "" : String(tokenId);
  if (!isTokenId(id) || !creatorAddress || !tipper) return null;
  const lookup = (async () => {
    const { data, error } = await supabase
      .from("remix_links")
      .select("source_token_id, source_address, remixer_address, split_bps")
      .eq("remix_token_id", Number(id))
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as { source_token_id: number; source_address: string; remixer_address: string; split_bps: number };
  })().catch(() => null);
  const row = await Promise.race([lookup, new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))]);
  if (!row) return null;
  const splitBps = Number(row.split_bps) || 0;
  const source = String(row.source_address || "").toLowerCase();
  if (splitBps <= 0 || !source) return null;
  if (String(row.remixer_address || "").toLowerCase() !== creatorAddress.toLowerCase()) return null;
  // Tipping a remix of your own video sends the whole tip to the remixer.
  if (source === tipper.toLowerCase() || source === creatorAddress.toLowerCase()) return null;
  return { sourceTokenId: Number(row.source_token_id), sourceAddress: source, splitBps };
}

/** How a tip on a remix divides, in display units: the source creator's part (0 when too small to send) and the rest. */
export function splitRemixTip(amount: number, share: RemixShare | null): { source: number; remixer: number } {
  if (!share || share.splitBps <= 0) return { source: 0, remixer: amount };
  const raw = Math.floor(amount * share.splitBps) / 10000;
  const source = raw >= 0.01 ? Math.round(raw * 1e6) / 1e6 : 0;
  return { source, remixer: source ? Math.round((amount - source) * 1e6) / 1e6 : amount };
}
