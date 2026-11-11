import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import GeneratedStageCover from "../Stages/GeneratedStageCover";
import { supabase } from "../../services/supabase";
import { getNFT } from "../../services/nft.service";
import { getCommunityBySlug, previewCommunityInvite } from "../../services/communities.service";
import { getAccount } from "../../services/user.service";
import { usePoll } from "../../hooks/usePolls";
import { fetchLinkPreview, getLinkPreviewImage, peekLinkPreview } from "../../libs/link-preview";
import { storageImageSource } from "../../libs/cdnImage";
import { getAvatarUrl } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import { nftToReplyPost, resolveReplyPostThumbnail } from "../../libs/replyPostDisplay";
import { linkHost, type GridCardKind, type TextCard } from "../../libs/gridCard";

/**
 * Grid card faces
 * ===============
 * A profile grid post that carries a card in the feed (a stage, an event, a
 * poll, a quoted or shared post, a link preview, a community, a shop item, a
 * profile) is drawn as a small copy of that card: the card's picture on top,
 * its name under it, and a pill top-left saying what it is. A stage that is on
 * right now gets a red "Live stage" pill.
 *
 * Each face reads the same query the feed's DehubLinkCard reads (same key), so
 * a card seen in the feed is instant here. While a card loads, or if it can't
 * be read, the tile stays the text poster it was, with the pill added.
 * Same tiles as the web grid (components/app/profile/GridCardTile).
 */

const LIVE_RED = "#FF2D55";
const COVER_WIDTH = 260;

const KIND: Record<GridCardKind, { key: string; label: string; icon: IconName }> = {
  stage: { key: "stage", label: "Stage", icon: "Mic" },
  event: { key: "event", label: "Event", icon: "Calendar" },
  poll: { key: "poll", label: "Poll", icon: "BarChart3" },
  quote: { key: "quote", label: "Quote", icon: "Quote" },
  sharedPost: { key: "shared", label: "Shared", icon: "Share2" },
  link: { key: "link", label: "Link", icon: "Link" },
  community: { key: "community", label: "Community", icon: "Users" },
  shop: { key: "shop", label: "Shop", icon: "Store" },
  profile: { key: "profile", label: "Profile", icon: "User" },
  film: { key: "film", label: "Film", icon: "Tv" },
  bounty: { key: "bounty", label: "Bounty", icon: "Briefcase" },
  app: { key: "app", label: "App", icon: "LayoutGrid" },
  proposal: { key: "proposal", label: "Proposal", icon: "Vote" },
  short: { key: "short", label: "Short", icon: "Shorts" as IconName },
  comic: { key: "comic", label: "Comic", icon: "Smile" },
  earn: { key: "earn", label: "Earn", icon: "Coins" },
};

/** Ink for the tile the face sits on (the poster's own palette). */
export interface GridPalette {
  ink: string;
  sub: string;
  glass: string;
  line: string;
}

/** The pill: what this tile is. `inline` sits in a text poster's flow; otherwise it floats top-left. */
export function GridKindPill({ kind, live, inline, palette }: { kind: GridCardKind; live?: boolean; inline?: boolean; palette?: GridPalette }) {
  const { t } = useTranslation();
  const { key, label, icon } = KIND[kind];
  const onPoster = inline && palette;
  const color = live ? "#FFFFFF" : onPoster ? palette!.ink : "#FFFFFF";
  return (
    <View
      style={[
        styles.pill,
        !inline && styles.pillFloat,
        live
          ? { backgroundColor: LIVE_RED, borderColor: "transparent" }
          : onPoster
            ? { backgroundColor: palette!.glass, borderColor: palette!.line }
            : null,
      ]}
    >
      {live ? <View style={styles.liveDot} /> : <Icon name={icon} size={10} color={color} />}
      <Text numberOfLines={1} style={[styles.pillText, { color }]}>
        {live ? t("profile.gridCard.liveStage", "Live stage") : t(`profile.gridCard.${key}`, label)}
      </Text>
    </View>
  );
}

interface FaceProps {
  words: string;
  /** Pinned chip; it takes the pill's place. */
  chip?: React.ReactNode;
  fallback: React.ReactElement;
  palette: GridPalette;
}

function CoverFace({ kind, live, cover, title, sub, chip, palette }: { kind: GridCardKind; live?: boolean; cover: React.ReactNode; title: string; sub?: string; chip?: React.ReactNode; palette: GridPalette }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.cover, { backgroundColor: palette.glass }]}>{cover}</View>
      <View style={styles.body}>
        <Text numberOfLines={3} style={[styles.title, { color: palette.ink }]}>{title}</Text>
        {!!sub && <Text numberOfLines={1} style={[styles.sub, { color: palette.sub }]}>{sub}</Text>}
      </View>
      {chip ?? <GridKindPill kind={kind} live={live} />}
    </View>
  );
}

const coverImage = (uri: string | null | undefined) =>
  uri ? <Image source={storageImageSource(uri, COVER_WIDTH)} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} /> : null;

function fmtWhen(d: Date): string {
  try {
    return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

function fmtDay(d: Date): string {
  try {
    return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

const StageFace = ({ stageId, shortId, chip, fallback, palette }: FaceProps & { stageId?: string; shortId?: string }) => {
  const { t } = useTranslation();
  // Same key and query as DehubLinkCard's stage card.
  const { data } = useQuery({
    queryKey: ["dehub-link", "stage", stageId ?? `short:${shortId}`],
    enabled: !!stageId || !!shortId,
    queryFn: async () => {
      const query = supabase.from("audio_spaces").select("*");
      const { data, error } = await (stageId ? query.eq("id", stageId) : query.eq("short_id", Number(shortId))).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });
  if (!data) return fallback;
  const live = data.status === "live";
  const ended = data.status === "ended";
  const starts = data.scheduled_at ? new Date(data.scheduled_at) : null;
  const here = Math.max(1, (data.speaker_count || 1) + (data.listener_count || 0));
  const sub = live
    ? t("profile.gridCard.listening", { count: here, value: formatCompactNumber(here), defaultValue: "{{value}} listening" })
    : ended
      ? data.total_listens
        ? t("profile.gridCard.listens", { count: data.total_listens, value: formatCompactNumber(data.total_listens), defaultValue: "{{value}} listens" })
        : t("stages.ended", "Ended")
      : starts
        ? fmtWhen(starts)
        : undefined;
  return (
    <CoverFace
      kind="stage"
      live={live}
      chip={chip}
      palette={palette}
      title={data.title}
      sub={sub}
      cover={data.cover_image_url ? coverImage(data.cover_image_url) : <View style={styles.stagePoster}><GeneratedStageCover stage={data} /></View>}
    />
  );
};

const EventFace = ({ eventNumber, chip, fallback, palette }: FaceProps & { eventNumber: string }) => {
  // Same key and query as DehubLinkCard's event card.
  const { data } = useQuery({
    queryKey: ["dehub-link", "event", eventNumber],
    queryFn: async () => {
      const { data, error } = await supabase.from("community_events").select("*").eq("event_number", Number(eventNumber)).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });
  if (!data) return fallback;
  const start = data.starts_at ? new Date(data.starts_at) : null;
  return (
    <CoverFace
      kind="event"
      chip={chip}
      palette={palette}
      title={data.title}
      sub={start ? fmtDay(start) : undefined}
      cover={data.cover_image_url ? coverImage(data.cover_image_url) : start ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.dateDay, { color: palette.ink }]}>{start.getDate()}</Text>
          <Text style={[styles.sub, { color: palette.sub }]}>{start.toLocaleString(undefined, { month: "short" }).toUpperCase()}</Text>
        </View>
      ) : null}
    />
  );
};

const PollFace = ({ tokenId, words, chip, fallback, palette }: FaceProps & { tokenId: number }) => {
  const { t } = useTranslation();
  const { poll } = usePoll(tokenId) as any;
  if (!poll) return fallback;
  const options: { index: number; text: string; voteCount: number }[] = poll.options || [];
  const total = poll.totalVotes || options.reduce((n, o) => n + (o.voteCount || 0), 0);
  return <PollBody poll={poll} options={options} total={total} words={words} chip={chip} palette={palette} t={t} />;
};

function PollBody({ poll, options, total, words, chip, palette, t }: any) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.padded}>
        <Text numberOfLines={2} style={[styles.title, { color: palette.ink }]}>{poll.question || words}</Text>
        {options.slice(0, 3).map((o: any) => {
          const share = total ? o.voteCount / total : 0;
          return (
            <View key={o.index} style={[styles.opt, { borderColor: palette.line }]}>
              <View style={[styles.optFill, { width: `${Math.round(share * 100)}%`, backgroundColor: palette.glass }]} />
              <Text numberOfLines={1} style={[styles.optText, { color: palette.ink }]}>{o.text}</Text>
              <Text style={[styles.optPct, { color: palette.sub }]}>{Math.round(share * 100)}%</Text>
            </View>
          );
        })}
        <Text numberOfLines={1} style={[styles.sub, { color: palette.sub, marginTop: "auto" }]}>
          {t("profile.gridCard.votes", { count: total, value: formatCompactNumber(total), defaultValue: "{{value}} votes" })}
        </Text>
      </View>
      {chip ?? <GridKindPill kind="poll" />}
    </View>
  );
}

/** A post inside a post: quotes and links to another Riftn post. */
function PostInPost({ kind, raw, tokenId, words, chip, palette }: { kind: GridCardKind; raw: any; tokenId: number; words: string; chip?: React.ReactNode; palette: GridPalette }) {
  const r = raw?.result || raw || {};
  const thumb = resolveReplyPostThumbnail(nftToReplyPost(r, tokenId), tokenId);
  const name = r.minterUser?.displayName || r.minterUser?.username || r.minterDisplayName || r.minterUsername || "";
  const text = String(r.name || r.title || r.description || "").replace(/\s+/g, " ").trim();
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.padded}>
        {!!words && <Text numberOfLines={2} style={[styles.own, { color: palette.ink }]}>{words}</Text>}
        <View style={[styles.quoted, { borderColor: palette.line, backgroundColor: palette.glass }]}>
          {!!thumb && <Image source={{ uri: thumb }} style={styles.quotedImg} contentFit="cover" transition={0} />}
          {!!name && <Text numberOfLines={1} style={[styles.quotedName, { color: palette.ink }]}>{name}</Text>}
          {!!text && <Text numberOfLines={thumb ? 1 : 3} style={[styles.sub, { color: palette.sub }]}>{text}</Text>}
        </View>
      </View>
      {chip ?? <GridKindPill kind={kind} />}
    </View>
  );
}

const PostFace = ({ kind, tokenId, seed, words, chip, fallback, palette }: FaceProps & { kind: GridCardKind; tokenId: string; seed?: any }) => {
  const { data } = useQuery({
    queryKey: ["grid-card-post", tokenId],
    queryFn: () => getNFT(tokenId),
    enabled: !seed && !!tokenId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const raw = seed || data;
  if (!raw) return fallback;
  return <PostInPost kind={kind} raw={raw} tokenId={Number(tokenId) || 0} words={words} chip={chip} palette={palette} />;
};

const LinkFace = ({ url, chip, fallback, palette }: FaceProps & { url: string }) => {
  const { data } = useQuery({
    queryKey: ["grid-link-preview", url],
    queryFn: () => fetchLinkPreview(url),
    initialData: () => peekLinkPreview(url) ?? undefined,
    staleTime: 30 * 60_000,
    retry: false,
  });
  if (!data?.title) return fallback;
  const image = getLinkPreviewImage(url, data.image);
  return (
    <CoverFace
      kind="link"
      chip={chip}
      palette={palette}
      title={data.title}
      sub={data.siteName || linkHost(url)}
      cover={image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} /> : (
        <View style={[StyleSheet.absoluteFill, styles.center]}><Text numberOfLines={1} style={[styles.title, { color: palette.sub }]}>{linkHost(url)}</Text></View>
      )}
    />
  );
};

const CommunityFace = ({ slug, chip, fallback, palette }: FaceProps & { slug: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["dehub-link", "community", slug], queryFn: () => getCommunityBySlug(slug), staleTime: 5 * 60_000 });
  if (!data) return fallback;
  return (
    <CoverFace
      kind="community"
      chip={chip}
      palette={palette}
      title={data.name}
      sub={t("profile.gridCard.members", { count: data.member_count ?? 0, value: formatCompactNumber(data.member_count ?? 0), defaultValue: "{{value}} members" })}
      cover={coverImage(data.banner_url || data.avatar_url)}
    />
  );
};

const InviteFace = ({ code, chip, fallback, palette }: FaceProps & { code: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["dehub-link", "invite", code], queryFn: () => previewCommunityInvite(code), staleTime: 30_000, retry: false });
  const d: any = data;
  if (!d?.is_valid || !d.name) return fallback;
  return (
    <CoverFace
      kind="community"
      chip={chip}
      palette={palette}
      title={d.name}
      sub={typeof d.member_count === "number" ? t("profile.gridCard.members", { count: d.member_count, value: formatCompactNumber(d.member_count), defaultValue: "{{value}} members" }) : undefined}
      cover={coverImage(d.banner_url || d.avatar_url)}
    />
  );
};

const ProfileFace = ({ username, chip, fallback, palette }: FaceProps & { username: string }) => {
  const { data } = useQuery({ queryKey: ["dehub-link", "profile", username.toLowerCase()], queryFn: () => getAccount(username), staleTime: 5 * 60_000 });
  const user: any = (data as any)?.result ?? data;
  if (!user || (!user.username && !user.address)) return fallback;
  const handle = String(user.username || username).replace("@", "");
  const avatar = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
  const uri = avatar ? getAvatarUrl(avatar) : "";
  return (
    <CoverFace
      kind="profile"
      chip={chip}
      palette={palette}
      title={user.displayName || user.display_name || handle}
      sub={`@${handle}`}
      cover={uri ? <View style={[StyleSheet.absoluteFill, styles.center]}><Image source={{ uri }} style={styles.avatar} contentFit="cover" transition={0} /></View> : null}
    />
  );
};

interface GridCardFaceProps extends FaceProps {
  card: TextCard;
  tokenId: number;
  item: any;
}

/** The face for a text post that carries a card. Falls back to the poster while it loads. */
function GridCardFaceComponent({ card, tokenId, item, ...face }: GridCardFaceProps) {
  const link = card.link;
  switch (card.kind) {
    case "quote": {
      const quotedId = String(item?.quotedTokenId ?? item?.quotedPost?.tokenId ?? "");
      return <PostFace {...face} kind="quote" tokenId={quotedId} seed={item?.quotedPost || undefined} />;
    }
    case "sharedPost":
      return link?.tokenId ? <PostFace {...face} kind="sharedPost" tokenId={link.tokenId} /> : face.fallback;
    case "stage":
      return <StageFace {...face} stageId={link?.stageId} shortId={link?.stageShortId} />;
    case "event":
      return link?.eventNumber ? <EventFace {...face} eventNumber={link.eventNumber} /> : face.fallback;
    case "community":
      if (link?.code) return <InviteFace {...face} code={link.code} />;
      return link?.slug ? <CommunityFace {...face} slug={link.slug} /> : face.fallback;
    case "shop":
      return face.fallback;
    case "profile":
      return link?.username ? <ProfileFace {...face} username={link.username} /> : face.fallback;
    case "link":
      return card.url ? <LinkFace {...face} url={card.url} /> : face.fallback;
    case "poll":
      return <PollFace {...face} tokenId={tokenId} />;
    default:
      // Film, bounty, app and proposal links: the poster with its pill.
      return face.fallback;
  }
}

export const GridCardFace = memo(GridCardFaceComponent);

/**
 * A text post with no link may still carry a poll; the feed payload has no
 * "has poll" flag, so ask (usePoll batches every tile on screen into one call).
 */
export const GridPollProbe = memo(function GridPollProbe({ tokenId, poster, ...face }: FaceProps & { tokenId: number; poster: React.ReactElement }) {
  const { t } = useTranslation();
  const { poll } = usePoll(tokenId > 0 ? tokenId : null) as any;
  if (!poll) return poster;
  const options = poll.options || [];
  const total = poll.totalVotes || options.reduce((n: number, o: any) => n + (o.voteCount || 0), 0);
  return <PollBody poll={poll} options={options} total={total} words={face.words} chip={face.chip} palette={face.palette} t={t} />;
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.22)",
    maxWidth: "86%",
  },
  pillFloat: { position: "absolute", top: 6, left: 6, zIndex: 1 },
  pillText: { fontSize: 9.5, fontWeight: "800" },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },
  cover: { height: "52%", overflow: "hidden" },
  body: { flex: 1, paddingHorizontal: 7, paddingTop: 6, paddingBottom: 6, gap: 3 },
  title: { fontSize: 11.5, lineHeight: 14, fontWeight: "800" },
  sub: { fontSize: 9.5, fontWeight: "600", marginTop: "auto" },
  center: { alignItems: "center", justifyContent: "center" },
  // The generated poster is 16:9; centre it on its own black so the taller cover box has no seam.
  stagePoster: { ...StyleSheet.absoluteFillObject, backgroundColor: "#050506", justifyContent: "center" },
  dateDay: { fontSize: 26, lineHeight: 28, fontWeight: "800" },
  padded: { flex: 1, paddingHorizontal: 7, paddingTop: 28, paddingBottom: 7, gap: 4 },
  opt: { height: 19, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 5 },
  optFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  optText: { fontSize: 9.5, fontWeight: "700", flexShrink: 1 },
  optPct: { fontSize: 9, fontWeight: "700", marginLeft: 3 },
  own: { fontSize: 11, lineHeight: 13.5, fontWeight: "700" },
  quoted: { flex: 1, minHeight: 0, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, padding: 4, gap: 2, overflow: "hidden" },
  quotedImg: { flex: 1, minHeight: 0, borderRadius: 4 },
  quotedName: { fontSize: 9.5, fontWeight: "800" },
  avatar: { width: "62%", aspectRatio: 1, borderRadius: 999 },
});
