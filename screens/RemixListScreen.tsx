/**
 * Every duet, stitch or reaction made from one video, newest first. The app
 * side of web's /app/post/:id/duets, /app/post/:id/reactions and the
 * Stitches sheet; the two web paths deep-link here on their tab.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import FeedCard from "../components/Home/FeedCard";
import { DeHubLoader } from "../components/DeHubLoader";
import { useFeedCardVisibility } from "../hooks/useFeedCardVisibility";
import { getNFT } from "../services/nft.service";
import { listRemixLinks, type RemixKind } from "../services/remix-links.service";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";

type Route = RouteProp<AppStackParamList, ScreenNames.RemixList | ScreenNames.RemixReactions>;

const TABS: RemixKind[] = ["duet", "stitch", "react"];

interface Row { key: string; item: any }

async function loadPage(tokenId: string, kind: RemixKind, page: number): Promise<{ rows: Row[]; hasMore: boolean }> {
  const { links, hasMore } = await listRemixLinks(tokenId, kind, page);
  const rows = await Promise.all(links.map(async (link): Promise<Row | null> => {
    const id = link.remixTokenId ?? link.streamTokenId;
    if (id == null) return null;
    try {
      const res = await getNFT(id, { allowAnonymous: true });
      const item = res?.result;
      return item ? { key: `${link.id}`, item } : null;
    } catch {
      // A remix whose post is gone or hidden drops out of the list.
      return null;
    }
  }));
  return { rows: rows.filter((row): row is Row => !!row), hasMore };
}

export default function RemixListScreen() {
  const { t } = useTranslation();
  const route = useRoute<Route>();
  const tokenId = String(route.params?.tokenId ?? "");
  const startKind: RemixKind = route.name === ScreenNames.RemixReactions ? "react" : (route.params as any)?.kind ?? "duet";
  const [kind, setKind] = useState<RemixKind>(startKind);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const valid = /^[1-9]\d{0,14}$/.test(tokenId);

  const load = useCallback(async (nextKind: RemixKind, nextPage: number) => {
    const id = ++request.current;
    if (nextPage === 0) { setLoading(true); setFailed(false); } else setLoadingMore(true);
    try {
      const result = await loadPage(tokenId, nextKind, nextPage);
      if (id !== request.current) return;
      setRows((prev) => (nextPage === 0 ? result.rows : [...prev, ...result.rows]));
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch {
      if (id === request.current && nextPage === 0) setFailed(true);
    } finally {
      if (id === request.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [tokenId]);

  useEffect(() => {
    if (!valid) { setLoading(false); return; }
    setRows([]);
    void load(kind, 0);
  }, [kind, load, valid]);

  const keyExtractor = useCallback((row: any) => String(row.key), []);
  const { viewabilityConfig, onViewableItemsChanged, isItemVisible, isItemAutoplayActive, visibilityExtraData } = useFeedCardVisibility(keyExtractor);

  const renderItem = useCallback(({ item: row }: { item: Row }) => (
    <View className="px-4 mb-3">
      <FeedCard item={row.item} isVisible={isItemVisible(row.key)} isAutoplayActive={isItemAutoplayActive(row.key)} />
    </View>
  ), [isItemVisible, isItemAutoplayActive]);

  const tabLabel = (tab: RemixKind) =>
    tab === "duet" ? t("duet.pageHeading", { defaultValue: "Duets" })
      : tab === "stitch" ? t("remixLinks.stitch.listTitle", { defaultValue: "Stitches" })
        : t("reactions.heading", { defaultValue: "Reactions" });

  const empty = useMemo(() => {
    if (loading) return null;
    const text = !valid ? t("duet.notFound", { defaultValue: "This video is not available." })
      : failed ? (kind === "stitch"
        ? t("remixLinks.stitch.listFailed", { defaultValue: "Could not load stitches. Try again." })
        : t("common.somethingWentWrong", { defaultValue: "Something went wrong" }))
        : kind === "duet" ? t("duet.empty", { defaultValue: "No duets yet." })
          : kind === "stitch" ? t("remixLinks.stitch.listEmpty", { defaultValue: "No stitches yet." })
            : t("reactions.empty", { defaultValue: "No reactions yet." });
    return (
      <View className="items-center justify-center px-8 py-16">
        <Text className="text-theme-neutrals-400 text-base text-center">{text}</Text>
      </View>
    );
  }, [loading, valid, failed, kind, t]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={tabLabel(kind)} />
      <View className="flex-row border-b border-theme-neutrals-800">
        {TABS.map((tab) => {
          const active = tab === kind;
          return (
            <Pressable key={tab} onPress={() => setKind(tab)} className="flex-1 py-4 items-center" accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text className={`font-semibold text-base ${active ? "text-white" : "text-theme-neutrals-400"}`}>{tabLabel(tab)}</Text>
              {active && <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-white rounded-full" />}
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><DeHubLoader size={56} /></View>
      ) : (
        <FlatList
          key={kind}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          windowSize={7}
          maxToRenderPerBatch={4}
          initialNumToRender={4}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          extraData={visibilityExtraData}
          onEndReached={() => { if (hasMore && !loadingMore) void load(kind, page + 1); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={empty}
          ListFooterComponent={loadingMore ? <View className="py-6 items-center"><ActivityIndicator size="small" color="#F4F4F5" /></View> : <View className="h-6" />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }}
        />
      )}
    </View>
  );
}
