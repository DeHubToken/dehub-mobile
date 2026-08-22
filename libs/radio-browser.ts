/**
 * Radio Browser API client
 * ========================
 * The free, key-less directory of ~50,000 stations behind the Music feed's
 * Radio section. Port of web's `src/lib/api/radio-browser.ts`.
 *
 * Two deliberate differences from web, both to keep a phone's first paint
 * cheap:
 *
 * - **The carousel is two requests, not ten.** Web resolves its ten curated
 *   station names by firing ten `/stations/search` calls on mount, which is the
 *   single most expensive thing about that tab. The names are stable, so their
 *   uuids are baked in here and fetched with one `/stations/byuuid`, topped up
 *   from `/stations/topvote` so the shelf is never thin.
 * - **Search is by name only.** Web additionally parses a country out of the
 *   query ("jazz france") against a 200-line country table; that is a nicety,
 *   not the feature, and it is not worth the bundle here.
 *
 * @module libs/radio-browser
 */

const API_SERVERS = [
  "https://de1.api.radio-browser.info/json",
  "https://nl1.api.radio-browser.info/json",
  "https://at1.api.radio-browser.info/json",
];

let currentServerIndex = 0;

export interface RadioStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  tags: string;
  bitrate: number;
  votes: number;
  clickcount: number;
  clicktrend: number;
  codec: string;
}

export const RADIO_GENRES = [
  { id: "top", label: "Top Stations", tag: "" },
  { id: "lofi", label: "Lo-Fi", tag: "lofi" },
  { id: "pop", label: "Pop", tag: "pop" },
  { id: "rock", label: "Rock", tag: "rock" },
  { id: "hiphop", label: "Hip-Hop", tag: "hip hop" },
  { id: "electronic", label: "Electronic", tag: "electronic" },
  { id: "jazz", label: "Jazz", tag: "jazz" },
  { id: "classical", label: "Classical", tag: "classical" },
  { id: "rnb", label: "R&B", tag: "r&b" },
  { id: "country", label: "Country", tag: "country" },
  { id: "latin", label: "Latin", tag: "latin" },
  { id: "reggae", label: "Reggae", tag: "reggae" },
  { id: "news", label: "News", tag: "news" },
  { id: "talk", label: "Talk", tag: "talk" },
  { id: "chill", label: "Chill", tag: "chillout" },
] as const;

export type RadioGenreId = (typeof RADIO_GENRES)[number]["id"];

async function fetchWithFallback<T>(endpoint: string): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < API_SERVERS.length; i++) {
    try {
      const response = await fetch(`${API_SERVERS[currentServerIndex]}${endpoint}`, {
        headers: { "User-Agent": "DeHub/1.0" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error as Error;
      currentServerIndex = (currentServerIndex + 1) % API_SERVERS.length;
    }
  }
  throw lastError || new Error("All radio-browser servers failed");
}

/** Most-voted stations overall. */
export function getTopStations(limit = 50): Promise<RadioStation[]> {
  return fetchWithFallback<RadioStation[]>(`/stations/topvote?limit=${limit}&hidebroken=true`);
}

/** Stations carrying a tag, best first. */
export function getStationsByTag(tag: string, limit = 50): Promise<RadioStation[]> {
  return fetchWithFallback<RadioStation[]>(
    `/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&hidebroken=true&order=votes&reverse=true`,
  );
}

/** Free-text search by station name. */
export function searchStations(query: string, limit = 50): Promise<RadioStation[]> {
  return fetchWithFallback<RadioStation[]>(
    `/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&hidebroken=true&order=votes&reverse=true`,
  );
}

export function getStationsByGenre(genreId: RadioGenreId, limit = 50): Promise<RadioStation[]> {
  const genre = RADIO_GENRES.find((g) => g.id === genreId);
  if (!genre || genreId === "top") return getTopStations(limit);
  return getStationsByTag(genre.tag, limit);
}

/** Counts towards a station's ranking. Failure is not worth reporting. */
export async function registerStationClick(stationuuid: string): Promise<void> {
  try {
    await fetchWithFallback(`/url/${stationuuid}`);
  } catch {
    /* analytics only */
  }
}

export function formatBitrate(bitrate: number): string {
  if (bitrate <= 0) return "";
  return `${bitrate}kbps`;
}

export function getPrimaryTags(tags: string, maxTags = 2): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 20)
    .slice(0, maxTags);
}

/** 🇬🇧 from "GB". Regional-indicator maths, no image assets. */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0)),
  );
}

/**
 * The uuids behind web's curated carousel names, resolved once against
 * `/stations/search` rather than at every mount. Three of web's ten names no
 * longer match anything in the directory and are dropped rather than left as
 * silent gaps.
 */
const CURATED_STATION_UUIDS = [
  "4260f1f5-d5b3-44d5-9666-355da4da0b21", // Lofi 24/7
  "9af1536b-1acd-11ea-a620-52543be04c81", // Nightwave Plaza OPUS 96
  "737c84ae-4529-40cc-970c-bcd1ec561068", // ISEKOI Radio — Non-Stop Ambient
  "cd477c35-d625-11e8-a54a-52543be04c81", // Miami Beach Radio
  "cbd67003-0039-421f-9b59-9dd6de2b9e80", // 247 Mixing
  "6eff3484-4ab4-4d36-bf27-9172c5aac15c", // Christmas Vinyl HD
  "8f6646dc-222a-4cbf-9f48-4bd60fea4493", // NBC News Radio
];

/**
 * The Music feed's radio shelf: the curated stations in their listed order,
 * padded out with top-voted ones so it always fills.
 */
export async function getCuratedCarouselStations(limit = 12): Promise<RadioStation[]> {
  const [curated, top] = await Promise.all([
    fetchWithFallback<RadioStation[]>(
      `/stations/byuuid?uuids=${CURATED_STATION_UUIDS.join(",")}`,
    ).catch(() => [] as RadioStation[]),
    getTopStations(limit).catch(() => [] as RadioStation[]),
  ]);

  // byuuid answers in its own order, so re-sort into the curated one.
  const byId = new Map(curated.map((s) => [s.stationuuid, s]));
  const ordered = CURATED_STATION_UUIDS.map((id) => byId.get(id)).filter(
    (s): s is RadioStation => !!s,
  );

  const seen = new Set(ordered.map((s) => s.stationuuid));
  for (const station of top) {
    if (ordered.length >= limit) break;
    if (seen.has(station.stationuuid)) continue;
    seen.add(station.stationuuid);
    ordered.push(station);
  }
  return ordered;
}
