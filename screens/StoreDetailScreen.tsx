/**
 * StoreDetailScreen
 * =================
 * Native port of the web StoreDetailPage (/app/stores/:storeId): a store's
 * banner, identity and its active listings.
 */
import { appLocale } from "../libs/date.util";
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
} from "react-native";

import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { Image } from "expo-image";
import { storageImageSource } from "../libs/cdnImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import { podProviderLabel } from "../libs/pod-providers";
import ScreenHeader from "../components/ScreenHeader";
import ShareLinkButton from "../components/common/ShareLinkButton";
import { ShareLinks } from "../navigation/linking.config";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { KitButton, PageEmpty, PageSection, useFlatPage } from "../components/page/PageKit";
import { useStoreById, useStoreListings, type StoreListing } from "../hooks/useStores";

const GRID_GAP = 10;
const H_PADDING = 16;

function money(n: number): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StoreDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.StoreDetail>>();
  const { storeId, listing: linkedListingId } = route.params;
  const { width: screenW } = useWindowDimensions();
  const flat = useFlatPage();

  const {
    data: store,
    isLoading: storeLoading,
    isError: storeError,
    refetch: refetchStore,
    isRefetching: storeRefetching,
  } = useStoreById(storeId);
  const {
    data: listings = [],
    isLoading,
    isError: listingsError,
    refetch,
    isRefetching,
  } = useStoreListings(storeId);
  const refreshing = isRefetching || storeRefetching;
  const onRefresh = () => Promise.all([refetchStore(), refetch()]);
  const leave = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate(ScreenNames.Stores);

  // A shared item link is `/app/stores/<id>?listing=<id>` — the same URL the
  // web app uses, where the query opens the item's drawer over the store. Here
  // it pushes the item screen once, so the shared link lands on the item rather
  // than on the shop it happens to live in.
  const openedLinkedListing = useRef(false);
  useEffect(() => {
    if (!linkedListingId || openedLinkedListing.current) return;
    openedLinkedListing.current = true;
    navigation.navigate(ScreenNames.ListingDetail, { listingId: linkedListingId });
  }, [linkedListingId, navigation]);

  const cardWidth = (screenW - H_PADDING * 2 - GRID_GAP) / 2;

  const header = (
    // The page's gutter is cancelled so the section runs as wide as the kit
    // draws it (full width on System and minimal, an 8pt card elsewhere).
    <PageSection flush style={[styles.headerSection, { marginHorizontal: flat ? -H_PADDING : 8 - H_PADDING }]}>
      {!!store?.banner_url && (
        <Image source={storageImageSource(store.banner_url, screenW)} style={styles.banner} contentFit="cover" />
      )}
      <View style={styles.identity}>
        <Avatar
          uri={getAvatarUrl(store?.avatar_url, 54)}
          size={54}
          name={store?.name || t("stores.store")}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.storeName} numberOfLines={1}>
            {store?.name || t("stores.store")}
          </Text>
          <Text style={styles.storeMeta}>
            {t("stores.listingCount", { count: listings.length })}
          </Text>
        </View>
      </View>
      {!!store?.description && <Text style={styles.storeDesc}>{store.description}</Text>}
      <View style={{ height: 16 }} />
    </PageSection>
  );

  const renderItem = ({ item }: { item: StoreListing }) => {
    const imgs = Array.isArray(item.images) ? item.images : [];
    const img = imgs[0] ?? null;
    return (
      <Pressable
        style={[styles.card, { width: cardWidth }]}
        onPress={() =>
          navigation.navigate(ScreenNames.ListingDetail, { listingId: item.id, listing: item })
        }
      >
        <View style={[styles.thumbWrap, { height: cardWidth }]}>
          {img ? (
            <Image source={storageImageSource(img, cardWidth)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.thumbFallback}>
              <Icon name="Package" size={24} color="#3F3F46" />
            </View>
          )}
          {!!item.external_url && (
            <View style={styles.podPill}>
              <Text style={styles.podText} numberOfLines={1}>
                {podProviderLabel(item.pod_provider) ?? t("stores.podBadge")}
              </Text>
            </View>
          )}
          {item.stock_quantity === 0 && (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldText}>{t("stores.soldOut")}</Text>
            </View>
          )}
        </View>
        <View style={{ padding: 9 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardPrice}>{money(item.price)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={store?.name || t("stores.store")}
        subtitle={store ? t("stores.listingCount", { count: listings.length }) : undefined}
        icon="stores"
        rightContent={
          store ? (
            <View style={styles.islandBtn}>
              <ShareLinkButton url={ShareLinks.store(store.id)} title={store.name || undefined} size={18} />
            </View>
          ) : undefined
        }
      />

      {storeLoading || (isLoading && listings.length === 0) ? (
        <View style={styles.center}>
          <DeHubLoader size={56} />
        </View>
      ) : storeError && !store ? (
        <PageEmpty
          icon="stores"
          title={t("common.somethingWentWrong")}
          action={<KitButton label={t("common.retry")} onPress={onRefresh} />}
        />
      ) : store === null ? (
        <PageEmpty
          icon="stores"
          title={t("stores.storeNotFound")}
          action={<KitButton variant="quiet" label={t("common.goBack")} onPress={leave} />}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ListHeaderComponent={header}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: H_PADDING,
            paddingBottom: insets.bottom + 24,
            gap: GRID_GAP,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <DeHubRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          ListEmptyComponent={
            listingsError ? (
              <PageEmpty
                icon="stores"
                title={t("stores.loadFailed")}
                action={<KitButton label={t("common.retry")} onPress={() => refetch()} />}
              />
            ) : (
              <PageEmpty icon="stores" title={t("stores.noActiveListings")} />
            )
          }
        />
      )}
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  headerSection: { marginBottom: 4 },
  islandBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  banner: {
    width: "100%",
    height: 110,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingHorizontal: 16 },
  storeName: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  storeMeta: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  storeDesc: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginTop: 12, paddingHorizontal: 16 },

  card: {
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  thumbWrap: { width: "100%", backgroundColor: "#0A0A0A" },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  podPill: {
    position: "absolute",
    top: 7,
    right: 7,
    maxWidth: "70%",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  podText: { color: "#E4E4E7", fontSize: 12, fontWeight: "700" },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  soldText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "700" },
  cardTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", lineHeight: 17 },
  cardPrice: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 5 },

  emptyText: { color: "#A1A1AA", fontSize: 13, marginTop: 12, textAlign: "center" },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#27272A",
  },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },
});
