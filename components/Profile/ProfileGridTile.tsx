import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import BlurSafeImage from "../common/BlurSafeImage";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { resolveContentType } from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { buildFeedImageUrls, getImageUrl, resolveThumbnail, DEFAULT_BANNER_SENTINEL } from "../../libs/misc";
import { formatCompactNumber, resolveViewCount } from "../../libs/numbers.util";
import { secondsToHMMSS } from "../../libs/date.util";
import { isStreamLive } from "../../libs/live-status";
import { useEngagement } from "../../libs/engagementCache";
import { POST_BG_INK, PostBgLayer, useProfilePostBg } from "./PostBackground";
import { usePostBgHoldProps } from "./PostBgPicker";

/**
 * One cell of the profile All grid: every post type side by side, each with
 * a look you can read at a glance. A video shows its length and views, a song
 * is a square cover over its own blur with a waveform, a text post is a poster
 * of its own words, an article shows its cover and title, a live stream wears a
 * solid red LIVE chip. Anything that isn't a plain photo carries one small
 * glass badge in the same top-right spot saying what it is. Same tiles as the
 * web profile on phones (ProfileMixedGrid).
 */

const TILE_FETCH_WIDTH = 360;
const LIVE_RED = "#FF2D55";

export type GridTileKind = "photo" | "video" | "audio" | "live" | "text" | "article";

export function gridTileKind(item: UnifiedFeedItem): GridTileKind {
  const type = resolveContentType(item);
  if (type === "audio") return "audio";
  if (type === "live") return isStreamLive((item as any).stream, String((item as any).status ?? "").toUpperCase() === "LIVE") ? "live" : "video";
  if (type === "video" || type === "short") return "video";
  if (item.articleBody) return "article";
  const hasPicture = (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) || !!item.imageUrl;
  return hasPicture ? "photo" : "text";
}

/** Bar heights for a song tile, stable per post so a re-render never reshuffles them. */
function waveFor(id: string, bars = 16): number[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Array.from({ length: bars }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.28 + 0.62 * Math.abs(Math.sin(i * 0.9 + ((h % 1000) / 1000) * 2));
  });
}

/** Words for a poster tile: no markdown, no link schemes. */
function plainText(text?: string): string {
  return (text || "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/(www\.)?/g, "")
    .replace(/[#*_>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function Badge({ icon, poster, light }: { icon: IconName; poster?: boolean; light?: boolean }) {
  return (
    <View style={[styles.badge, poster && styles.badgePoster, poster && light && styles.badgePosterLight]}>
      <Icon name={icon} size={12} color={poster && light ? "#17161B" : "#FFFFFF"} />
    </View>
  );
}

interface ProfileGridTileProps {
  item: UnifiedFeedItem;
  pinned?: boolean;
  onPress: (item: UnifiedFeedItem, kind: GridTileKind, images: string[]) => void;
  /** Your own profile: holding one of your text posts opens the background picker. */
  ownerHold?: boolean;
}

const ProfileGridTile: React.FC<ProfileGridTileProps> = ({ item, pinned, onPress, ownerHold }) => {
  const { t } = useTranslation();
  // Written dark, like the rest of the app: System Light's tone pass turns
  // the poster tiles to ink on white, and media tiles stay dark-surface.
  const { theme, isLight } = useAppTheme();
  const kind = gridTileKind(item);
  const id = String(item.tokenId ?? item.id ?? "");

  const images = useMemo(() => {
    if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) return buildFeedImageUrls(item.imageUrls, TILE_FETCH_WIDTH);
    const single = item.imageUrl ? getImageUrl(item.imageUrl, TILE_FETCH_WIDTH) : "";
    return single ? [single] : [];
  }, [item]);

  const cover = useMemo(() => {
    if (kind === "photo") return images[0] ?? "";
    if (kind === "article") return item.articleImageUrl ? getImageUrl(item.articleImageUrl, TILE_FETCH_WIDTH) : "";
    const raw = (item as any).thumbnail || (item as any).stream?.thumbnail || item.thumbnailUrl || item.imageUrl || "";
    if (raw) return getImageUrl(raw, TILE_FETCH_WIDTH);
    const resolved = resolveThumbnail(item as any, TILE_FETCH_WIDTH);
    return resolved === DEFAULT_BANNER_SENTINEL ? "" : resolved;
  }, [item, kind, images]);

  const views = resolveViewCount(item as any);
  // The list API sends likes as totalVotes.for (there is no `likes` field), so
  // read it the way feed cards do; a like made elsewhere shows here too.
  const { likeCount } = useEngagement(item);
  const seconds = (item as any).videoDuration || item.audioDuration;
  // Same clock as web tiles: 0:46, 12:05, 1:02:09 (no padded leading zero).
  const duration = seconds ? (secondsToHMMSS(seconds) ?? "").replace(/^0(\d)/, "$1") : "";
  const isOsaka = theme === "osaka";
  const solid = isOsaka ? "#FF6FB5" : "#FFFFFF";
  const solidInk = isOsaka ? "#1A0C16" : "#000000";
  // Poster tiles carry their own solid card and ink, kept out of the System
  // Light tone pass (dark-surface): a see-through fill toned on a page that
  // stayed dark left near-black words on near-black, only the emoji showing.
  const lightPoster = isLight && !isOsaka;
  const posterBg = isOsaka ? "rgba(17,14,28,0.82)" : lightPoster ? "#F2F2F4" : "#141416";
  const posterLine = isOsaka ? "rgba(255,111,181,0.22)" : lightPoster ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)";
  // The owner's text-post backdrop (customs.postBg) on their own words only.
  const profileBg = useProfilePostBg();
  const postBg = kind === "text" && !(item as any).isRepost ? profileBg : null;
  const ink = postBg ? POST_BG_INK[postBg.tone].ink : lightPoster ? "#17161B" : "#FFFFFF";
  const sub = postBg ? POST_BG_INK[postBg.tone].sub : lightPoster ? "rgba(23,22,27,0.62)" : "rgba(255,255,255,0.6)";
  const holdProps = usePostBgHoldProps(!!ownerHold && kind === "text" && !(item as any).isRepost);

  const pinChip = pinned ? (
    <View style={[styles.chip, { backgroundColor: solid }]}>
      <Icon name="Pin" size={9} color={solidInk} />
      <Text style={[styles.chipText, { color: solidInk }]}>{t("profile.pinnedShort", "Pinned")}</Text>
    </View>
  ) : null;

  const label = plainText(item.name || item.title || item.description) || t("profile.post", "Post");

  let body: React.ReactNode;
  if (kind === "text" || kind === "article") {
    const words = plainText(kind === "article" ? item.title || item.name : item.description || item.name);
    body = (
      <View className="dark-surface" style={[styles.fill, postBg ? null : { backgroundColor: posterBg, borderColor: posterLine, borderWidth: StyleSheet.hairlineWidth }]}>
        {postBg && <PostBgLayer bg={postBg} />}
        {kind === "article" ? (
          <>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.articleImg} contentFit="cover" recyclingKey={id} transition={0} />
            ) : (
              <View style={[styles.articleImg, styles.center]}><Icon name="Blog" size={22} color={sub} /></View>
            )}
            <View style={styles.articleBody}>
              <Text numberOfLines={3} style={[styles.articleTitle, { color: ink }]}>{words}</Text>
              <Text style={[styles.meta, { color: sub }]}>{t("profile.articleShort", "Article")}</Text>
            </View>
            <Badge icon="Blog" poster light={lightPoster && !postBg} />
          </>
        ) : (
          <View style={styles.textInner}>
            {pinChip ? <View style={styles.inlineChip}>{pinChip}</View> : <Text style={[styles.quote, { color: ink }]}>{"“"}</Text>}
            <Text numberOfLines={5} style={[styles.words, { color: ink }]}>{words}</Text>
            <View style={styles.stats}>
              <View style={styles.stat}><Icon name="MessageSquare" size={10} color={sub} /><Text style={[styles.meta, { color: sub }]}>{formatCompactNumber(item.commentCount ?? 0)}</Text></View>
              <View style={styles.stat}><Icon name="ThumbsUp" size={10} color={sub} /><Text style={[styles.meta, { color: sub }]}>{formatCompactNumber(likeCount)}</Text></View>
            </View>
            <Badge icon="MessageSquare" poster light={lightPoster && !postBg} />
          </View>
        )}
        {kind === "article" && pinChip}
      </View>
    );
  } else if (kind === "audio") {
    body = (
      <View className="dark-surface" style={[styles.fill, styles.audioBg]}>
        {!!cover && <BlurSafeImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={18} recyclingKey={`${id}-blur`} transition={0} />}
        <View style={[StyleSheet.absoluteFill, styles.audioDim]} />
        <View style={styles.audioCoverWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.audioCover} contentFit="cover" recyclingKey={id} transition={0} />
          ) : (
            <View style={[styles.audioCover, styles.center]}><Icon name="Music" size={20} color="rgba(255,255,255,0.7)" /></View>
          )}
        </View>
        <View style={styles.wave} pointerEvents="none">
          {waveFor(id).map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: `${Math.round(h * 100)}%`, opacity: i < 7 ? 0.92 : 0.35 }]} />
          ))}
        </View>
        <Text numberOfLines={1} style={styles.audioTitle}>{label}</Text>
        <Badge icon="Music" />
        {pinChip}
      </View>
    );
  } else {
    const isLive = kind === "live";
    const multi = kind === "photo" && images.length > 1;
    body = (
      <View className="dark-surface" style={[styles.fill, { backgroundColor: isOsaka ? posterBg : "#111111" }]}>
        {!!cover && <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={id} transition={0} />}
        {(kind !== "photo" || multi || pinned) && <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none" />}
        {isLive ? (
          <View style={[styles.chip, { backgroundColor: LIVE_RED }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.chipText, { color: "#FFFFFF", letterSpacing: 0.5 }]}>{t("live.liveBadge", "LIVE")}</Text>
          </View>
        ) : (
          pinChip
        )}
        {kind === "video" && <Badge icon={resolveContentType(item) === "live" ? "Radio" : "Film"} />}
        {multi && <Badge icon="Images" />}
        {kind === "video" && !!duration && <View style={styles.dur}><Text style={styles.durText}>{duration}</Text></View>}
        {(kind === "video" || isLive) && views > 0 && <Text style={styles.views}>{t("music.viewsCount", { count: views, views: formatCompactNumber(views) })}</Text>}
        {isLive && <View style={[StyleSheet.absoluteFill, styles.liveRing]} pointerEvents="none" />}
      </View>
    );
  }

  return (
    // The size lives on a plain View and the Pressable gets a plain style
    // object. System Light's tone pass re-creates a style *function*, and
    // NativeWind drops a style function on a native Pressable, so the 3:4
    // size went with it: picture tiles (all absolute layers) came out 0 tall
    // and only text tiles showed on a light-theme profile.
    <View style={styles.cell}>
      <Pressable
        onPress={() => onPress(item, kind, images)}
        {...holdProps}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.press}
      >
        {({ pressed }) => <View style={[styles.press, pressed && styles.pressed]}>{body}</View>}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  // Width, not flex: inside a FlashList column the cell has no set height,
  // so flex:1 sized it by its content and a picture tile (all absolute
  // children) came out 0 tall on phones.
  cell: { width: "100%", aspectRatio: 3 / 4, padding: 1 },
  press: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
  fill: { flex: 1, borderRadius: 3, overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  shade: { backgroundColor: "rgba(0,0,0,0.16)" },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  badgePoster: { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.22)" },
  badgePosterLight: { backgroundColor: "rgba(0,0,0,0.06)", borderColor: "rgba(0,0,0,0.12)" },
  chip: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  inlineChip: { height: 18 },
  chipText: { fontSize: 9.5, fontWeight: "800" },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },
  liveRing: { borderWidth: 1.5, borderColor: LIVE_RED, borderRadius: 3 },
  dur: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.5)" },
  durText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  views: { position: "absolute", right: 7, bottom: 6, color: "#FFFFFF", fontSize: 10, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 2 },
  textInner: { flex: 1, paddingHorizontal: 8, paddingTop: 9, paddingBottom: 8, gap: 4 },
  quote: { fontSize: 26, lineHeight: 22, height: 14, fontWeight: "800", opacity: 0.3 },
  words: { fontSize: 12.5, lineHeight: 15.5, fontWeight: "700", paddingRight: 8 },
  stats: { marginTop: "auto", flexDirection: "row", gap: 8 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  meta: { fontSize: 10, fontWeight: "600" },
  articleImg: { width: "100%", height: "52%" },
  articleBody: { flex: 1, paddingHorizontal: 7, paddingTop: 5, paddingBottom: 6, gap: 2 },
  articleTitle: { fontSize: 11.5, lineHeight: 14, fontWeight: "700" },
  audioBg: { backgroundColor: "#111111" },
  audioDim: { backgroundColor: "rgba(0,0,0,0.42)" },
  audioCoverWrap: { position: "absolute", top: "18%", left: 0, right: 0, alignItems: "center" },
  audioCover: { width: "58%", aspectRatio: 1, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)" },
  wave: { position: "absolute", left: 7, right: 7, bottom: 22, height: 16, flexDirection: "row", alignItems: "center", gap: 1.5 },
  waveBar: { flex: 1, borderRadius: 2, backgroundColor: "#FFFFFF" },
  audioTitle: { position: "absolute", left: 7, right: 7, bottom: 6, color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
});

export default memo(ProfileGridTile);
