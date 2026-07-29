/**
 * Live TV service
 * ===============
 * Native port of web's lib/api/live-tv.ts. Reads verified channels from the
 * shared `tv_channels_verified` table and falls back to parsing the Free-TV
 * M3U8 playlist when the table is empty — same order, same filters, same
 * 5-minute module cache, and the same `report-broken-channel` edge function.
 */
import { supabase } from "./supabase";
import { createLogger } from "../libs/logger";

const log = createLogger("liveTv");

export interface TVChannel {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  streamUrl: string;
  country: string;
  languages: string[];
}

export interface TVCategory {
  id: string;
  label: string;
  count: number;
}

const FREE_TV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

/** Strip resolution tags like (720p) from channel names. */
function cleanChannelName(name: string): string {
  return name.replace(/\s*\(\d+p\)/gi, "").trim();
}

const COUNTRY_DISPLAY_OVERRIDES: Record<string, string> = {
  "日本 / Japan": "Japan",
  "News (AR)": "News (Arabic)",
  "News (ES)": "News (Spanish)",
  "Documentaries (EN)": "Documentaries",
  "North Macedonia": "N. Macedonia",
};

let channelsCache: TVChannel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

/** Reported once per session, as on web. */
const reportedChannels = new Set<string>();

async function fetchVerifiedChannels(): Promise<TVChannel[]> {
  const { data, error } = await supabase
    .from("tv_channels_verified")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    log.warn("database fetch error, will use fallback:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    name: cleanChannelName(row.name),
    logo: row.logo,
    category: row.category,
    streamUrl: row.stream_url,
    country: row.country,
    languages: [],
  }));
}

function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash = hash & hash;
  }
  return `ch-${Math.abs(hash).toString(36)}`;
}

/**
 * Same exclusions as web: DRM (.mpd), embed-only hosts, plain http, and the
 * geo-blocked marker. Only HLS survives, which is what expo-video can play.
 */
function isValidStream(url: string, name: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".mpd")) return false;
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return false;
  if (lower.includes("twitch.tv")) return false;
  if (lower.includes("dailymotion.com")) return false;
  if (url.startsWith("http://")) return false;
  if (name.includes("Ⓖ")) return false;
  return lower.includes(".m3u8");
}

function parseM3U8Playlist(content: string): TVChannel[] {
  const lines = content.split("\n");
  const channels: TVChannel[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;

    const nameMatch = line.match(/tvg-name="([^"]+)"/);
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    const groupMatch = line.match(/group-title="([^"]+)"/);
    const titleMatch = line.match(/,(.+)$/);

    let streamUrl = "";
    for (let j = i + 1; j < lines.length && j < i + 3; j++) {
      const next = lines[j]?.trim();
      if (next && !next.startsWith("#")) {
        streamUrl = next;
        break;
      }
    }

    const name = cleanChannelName(nameMatch?.[1] || titleMatch?.[1] || "Unknown Channel");
    if (!streamUrl || seenUrls.has(streamUrl)) continue;
    if (!isValidStream(streamUrl, name)) continue;

    seenUrls.add(streamUrl);
    const groupTitle = groupMatch?.[1] || "Other";

    channels.push({
      id: generateIdFromUrl(streamUrl),
      name: name.trim(),
      logo: logoMatch?.[1] || null,
      category: groupTitle,
      streamUrl,
      country: groupTitle,
      languages: [],
    });
  }

  return channels;
}

async function fetchFallbackChannels(): Promise<TVChannel[]> {
  const res = await fetch(FREE_TV_PLAYLIST_URL);
  if (!res.ok) throw new Error("Failed to fetch TV channels");
  return parseM3U8Playlist(await res.text());
}

async function fetchAllChannels(): Promise<TVChannel[]> {
  const now = Date.now();
  if (channelsCache && channelsCache.length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return channelsCache;
  }

  let channels = await fetchVerifiedChannels();
  if (channels.length === 0) {
    log.info("falling back to raw playlist parsing");
    channels = await fetchFallbackChannels();
  }

  channelsCache = channels;
  cacheTimestamp = now;
  return channelsCache;
}

/** Channels for a country ('all' for everything). Logos first, then by name. */
export async function getTVChannelsByCountry(
  country: string,
  limit = 50,
): Promise<TVChannel[]> {
  const all = await fetchAllChannels();
  const filtered = country === "all" ? [...all] : all.filter((c) => c.country === country);

  filtered.sort((a, b) => {
    if (a.logo && !b.logo) return -1;
    if (!a.logo && b.logo) return 1;
    return a.name.localeCompare(b.name);
  });

  return filtered.slice(0, limit);
}

/** Name/country search, ranked exact → prefix → has-logo → alphabetical. */
export async function searchTVChannels(query: string, limit = 50): Promise<TVChannel[]> {
  if (!query.trim()) return getTVChannelsByCountry("all", limit);

  const all = await fetchAllChannels();
  const q = query.toLowerCase();

  const results = all.filter(
    (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
  );

  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === q;
    const bExact = b.name.toLowerCase() === q;
    if (aExact !== bExact) return aExact ? -1 : 1;

    const aStarts = a.name.toLowerCase().startsWith(q);
    const bStarts = b.name.toLowerCase().startsWith(q);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;

    if (!!a.logo !== !!b.logo) return a.logo ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit);
}

/** Countries with channel counts, 'All' first, rest by count descending. */
export async function getAvailableCountries(): Promise<TVCategory[]> {
  const all = await fetchAllChannels();
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.country, (counts.get(c.country) || 0) + 1);

  const out: TVCategory[] = [{ id: "all", label: "All", count: all.length }];
  for (const [country, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    out.push({ id: country, label: COUNTRY_DISPLAY_OVERRIDES[country] || country, count });
  }
  return out;
}

/** Auto-called when playback fails, deduped per session. */
export async function reportBrokenChannel(channelId: string): Promise<void> {
  if (reportedChannels.has(channelId)) return;
  reportedChannels.add(channelId);
  try {
    await supabase.functions.invoke("report-broken-channel", {
      body: { channel_id: channelId },
    });
  } catch (error) {
    log.warn("failed to report broken channel:", error);
  }
}
