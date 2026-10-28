/**
 * LiveNowBar — one thin row at the top of the home feed for everyone live
 * =====================================================================
 * Port of web's `components/app/feeds/LiveNowBar`. Stage hosts and people
 * livestreaming share one row of stacked rippling faces, people you follow
 * first, then the busiest. With one person live the row names their room and
 * a tap goes straight in; with more it reads "Live now" and a tap opens a
 * sheet listing every Stage and stream.
 *
 * @module components/Home/LiveNowBar
 */

import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";

import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import GlassModal from "../ui/GlassModal";
import { useStages } from "../../context/StageContext";
import { useUser } from "../../context/AuthContext";
import { liveStreamsQuery, liveStreamRows } from "../../hooks/useLiveStreams";
import { getFollowList } from "../../services/user.service";
import { isStreamLive } from "../../libs/live-status";
import { getAvatarUrl, storedAvatarSources } from "../../libs/misc";
import { compactCount } from "../Music/CinematicMusic";
import { ScreenNames } from "../../navigation/ScreenNames";

export interface LiveNowItem {
  kind: "stage" | "stream";
  id: string;
  tokenId?: number;
  title: string;
  wallet: string;
  username: string | null;
  /** Stored avatar path (Stage host) or ready URL (streamer). */
  avatar: string | null;
  count: string;
  followed: boolean;
  size: number;
}

const handleOf = (item: LiveNowItem) => `@${item.username || item.wallet?.slice(0, 6) || "?"}`;

const LiveNowBar: React.FC = () => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const me = (user?.walletAddress || user?.address || "").toLowerCase();
  const { liveSpaces, openModal, joinSpace, guestListenSpace } = useStages();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Same request and cache entry as the Live tab and useLiveStreams.
  const { data: liveData } = useQuery(liveStreamsQuery);

  const { data: following } = useQuery({
    queryKey: ["following-list-for-live-bar", me],
    queryFn: async () => {
      const res = await getFollowList({ address: me, type: "following", limit: 3000 });
      return (res?.result?.items ?? []).map((i) => i.user?.address?.toLowerCase()).filter(Boolean) as string[];
    },
    enabled: !!me,
    staleTime: 2 * 60_000,
  });

  const items = useMemo(() => {
    const set = new Set(following ?? []);
    const isFollowed = (addr?: string | null) => !!addr && addr.toLowerCase() !== me && set.has(addr.toLowerCase());

    const list: LiveNowItem[] = liveSpaces.map((space) => {
      const size = (space.speaker_count || 1) + (space.listener_count || 0);
      return {
        kind: "stage",
        id: String(space.id),
        title: space.title,
        wallet: space.host_wallet_address,
        username: space.host_username ?? null,
        avatar: space.host_avatar ?? null,
        count: String(size),
        followed: isFollowed(space.host_wallet_address),
        size,
      };
    });

    const seen = new Set<string>();
    liveStreamRows(liveData).forEach((row: any, index) => {
      if (!isStreamLive(row)) return;
      const id = String(row._id || row.streamId || index);
      if (seen.has(id)) return;
      seen.add(id);
      const account = row.account || row.streamer;
      const avatarPath = account?.avatarImageUrl || account?.avatarUrl;
      const views = Number(row.totalViews ?? row.peakViewers ?? row.viewerCount ?? 0) || 0;
      const wallet = String(row.address || account?.address || "");
      list.push({
        kind: "stream",
        id,
        tokenId: row.tokenId,
        title: row.title,
        wallet,
        username: account?.username ?? null,
        avatar: avatarPath ? getAvatarUrl(avatarPath, 48) : null,
        count: compactCount(views),
        followed: isFollowed(wallet),
        size: views,
      });
    });

    return list.sort((a, b) => Number(b.followed) - Number(a.followed) || b.size - a.size);
  }, [liveSpaces, liveData, following, me]);

  const open = useCallback(
    async (item: LiveNowItem) => {
      setSheetOpen(false);
      if (item.kind === "stage") {
        // Same path as a /stages/<id> deep link: join (or listen as a guest
        // when signed out), then open the room that was actually tapped.
        if ((await joinSpace(item.id)) || (await guestListenSpace(item.id))) openModal("live");
      } else {
        navigation.navigate(ScreenNames.LiveViewer, {
          streamId: item.id,
          isLive: true,
          ...(item.tokenId != null ? { tokenId: item.tokenId } : {}),
        });
      }
    },
    [joinSpace, guestListenSpace, openModal, navigation],
  );

  if (items.length === 0) return null;

  return (
    <>
      <LiveNowRow items={items} onOpen={open} onSeeAll={() => setSheetOpen(true)} />
      {items.length > 1 && (
        <GlassModal surface="theme" visible={sheetOpen} onClose={() => setSheetOpen(false)} presentation="bottom" scrollable maxHeight="70%">
          <LiveNowSheet items={items} onOpen={open} />
        </GlassModal>
      )}
    </>
  );
};

function LiveFace({ item, size }: { item: LiveNowItem; size: number }) {
  const sources =
    item.kind === "stage"
      ? storedAvatarSources(item.avatar, item.wallet, size)
      : { uri: item.avatar, fallbackUri: null };
  return <Avatar {...sources} size={size} name={item.username || item.wallet} live />;
}

function LiveCount({ item }: { item: LiveNowItem }) {
  const { t } = useTranslation();
  return (
    <View style={styles.live}>
      <Text style={styles.liveText}>{t("stages.live")}</Text>
      <Icon name="Users" size={12} color="rgba(255,255,255,0.4)" />
      <Text style={styles.count}>{item.count}</Text>
    </View>
  );
}

/** The single row. Exported for the shot harness. */
export function LiveNowRow({
  items,
  onOpen,
  onSeeAll,
}: {
  items: LiveNowItem[];
  onOpen: (item: LiveNowItem) => void;
  onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  const single = items.length === 1 ? items[0] : null;
  const names = items.slice(0, 2).map(handleOf);
  const rest = items.length - names.length;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={() => (single ? onOpen(single) : onSeeAll())} activeOpacity={0.85} style={styles.row}>
        <View style={styles.dotWrap}>
          <View style={styles.liveDot} />
        </View>
        <View style={styles.stack}>
          {items.slice(0, 4).map((item, i) => (
            <View key={`${item.kind}-${item.id}`} style={i > 0 ? styles.stacked : undefined}>
              <LiveFace item={item} size={24} />
            </View>
          ))}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {single ? single.title : t("stages.liveNow")}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {single ? (
              <>
                {single.kind === "stage" ? `${t("stages.hostedBy")} ` : ""}
                <Text style={styles.host}>{handleOf(single)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.host}>{names.join(", ")}</Text>
                {rest > 0 ? ` +${rest}` : ""}
              </>
            )}
          </Text>
        </View>
        {single ? (
          <LiveCount item={single} />
        ) : (
          <View style={styles.seeAll}>
            <Text style={styles.seeAllText}>{t("stages.seeAll")}</Text>
            <Icon name="ChevronRight" size={12} color="rgba(255,255,255,0.6)" />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** The sheet: every Stage and stream, one row each. Exported for the shot harness. */
export function LiveNowSheet({ items, onOpen }: { items: LiveNowItem[]; onOpen: (item: LiveNowItem) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <View style={styles.liveDot} />
        <Text style={styles.sheetTitle}>{t("stages.liveNow")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity
            key={`${item.kind}-${item.id}`}
            onPress={() => onOpen(item)}
            activeOpacity={0.85}
            style={[styles.row, styles.sheetRow]}
          >
            <Icon name={item.kind === "stage" ? "Mic" : "Video"} size={18} color="rgba(255,255,255,0.8)" />
            <LiveFace item={item} size={32} />
            <View style={styles.text}>
              <Text style={[styles.title, styles.sheetRowTitle]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.kind === "stage" ? `${t("stages.hostedBy")} ` : ""}
                <Text style={styles.host}>{handleOf(item)}</Text>
              </Text>
            </View>
            <LiveCount item={item} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The nav pill's reserved space already leaves 6 above this row and the
  // first card adds its own 6 margin below, so 6 more each side makes the gap
  // above and below the same 12.
  wrap: {
    marginTop: 6,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  dotWrap: {
    width: 20,
    alignItems: "center",
  },
  stack: {
    flexDirection: "row",
  },
  stacked: {
    marginLeft: -4,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "500",
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  host: {
    color: "rgba(255,255,255,0.7)",
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    marginRight: 2,
  },
  count: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "500",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  list: {
    gap: 8,
  },
  sheetRow: {
    paddingVertical: 10,
  },
  sheetRowTitle: {
    fontSize: 13,
  },
});

export default React.memo(LiveNowBar);
