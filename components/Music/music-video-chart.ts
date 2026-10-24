/**
 * Music video charts — the same orders web's Music tab offers.
 *
 * @module components/Music/music-video-chart
 */

import { getNFTs, type GetNFTsResult } from "../../services/nft.service";

export type MusicVideoChartSort = "views" | "week" | "liked" | "new";

/** The music video chart is a top 20, ranked on the server. */
const MUSIC_VIDEO_CHART_SIZE = 20;

export const MUSIC_VIDEO_CHART_SORTS: { value: MusicVideoChartSort; key: string; fallback: string }[] = [
  { value: "views", key: "music.mostViewed", fallback: "Most viewed" },
  { value: "week", key: "music.trendingWeek", fallback: "Trending this week" },
  { value: "liked", key: "music.mostLiked", fallback: "Most liked" },
  { value: "new", key: "music.newest", fallback: "Newest" },
];

/**
 * One music video chart. "Trending" is the most viewed of the last week,
 * topped up from the last month when a quiet week has only a handful.
 */
export async function fetchMusicVideoChart(sort: MusicVideoChartSort, address?: string): Promise<GetNFTsResult[]> {
  const base = { category: "Music", postType: "video", unit: MUSIC_VIDEO_CHART_SIZE, address };
  if (sort !== "week") {
    const sortMode = sort === "views" ? "trending" : sort === "liked" ? "popular" : "new";
    return (await getNFTs({ ...base, sortMode })).result || [];
  }
  const week = (await getNFTs({ ...base, sortMode: "trending", range: "week" })).result || [];
  if (week.length >= 5) return week;
  const month = (await getNFTs({ ...base, sortMode: "trending", range: "month" }).catch(() => ({ result: [] as GetNFTsResult[] }))).result || [];
  const seen = new Set(week.map(nft => String(nft.tokenId ?? nft.id)));
  return [...week, ...month.filter(nft => !seen.has(String(nft.tokenId ?? nft.id)))].slice(0, MUSIC_VIDEO_CHART_SIZE);
}
