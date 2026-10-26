/**
 * Music search
 * ============
 * Searches a whole Music zone on the server, not just the chart on screen:
 * every Music post, every audio upload, every station in the radio directory.
 * Shared by the Music tab's charts and the System theme's phone layout.
 *
 * @module libs/music-search
 */

import { getNFTs, type GetNFTsResult } from "../services/nft.service";
import { getStationsByTag, searchStations, type RadioStation } from "./radio-browser";
import { isVisibleInMusic } from "../components/Music/music-curation";

/** How many matches one search pulls from its zone. */
export const MUSIC_SEARCH_SIZE = 50;

/** Posts of one kind whose title, description or creator matches. */
export async function searchMusicPosts(
  query: string,
  filter: { category?: string; postType: string },
  address?: string,
): Promise<GetNFTsResult[]> {
  const res = await getNFTs({ ...filter, search: query, unit: MUSIC_SEARCH_SIZE, sortMode: "trending", address } as any);
  return (res.result || []).filter(isVisibleInMusic);
}

/** Everything musical: Music-category posts of any kind plus every audio upload. */
export async function searchAllMusic(query: string, address?: string): Promise<GetNFTsResult[]> {
  const lists = await Promise.all(
    [{ category: "Music", postType: "all" }, { postType: "feed-audio" }, { postType: "audio" }].map(filter =>
      searchMusicPosts(query, filter, address).catch(() => [] as GetNFTsResult[])),
  );
  const seen = new Set<string>();
  return lists.flat()
    .filter(nft => {
      const id = String(nft.tokenId ?? nft.id);
      return !seen.has(id) && (seen.add(id), true);
    })
    .sort((a: any, b: any) => (Number(b.views ?? b.totalViews) || 0) - (Number(a.views ?? a.totalViews) || 0));
}

/** Stations whose name or genre matches, from the whole radio directory. */
export async function searchRadio(query: string): Promise<RadioStation[]> {
  const [byName, byTag] = await Promise.all([
    searchStations(query, 100).catch(() => [] as RadioStation[]),
    getStationsByTag(query.toLowerCase(), MUSIC_SEARCH_SIZE).catch(() => [] as RadioStation[]),
  ]);
  const seen = new Set<string>();
  return [...byName, ...byTag].filter(station => !seen.has(station.stationuuid) && (seen.add(station.stationuuid), true));
}
