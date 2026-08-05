/**
 * StoreDetailScreen
 * =================
 * Native port of the web StoreDetailPage (/app/stores/:storeId): a store's
 * banner, identity and its active listings.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { useStoreById, useStoreListings, type StoreListing } from "../hooks/useStores";

const GRID_GAP = 10;
const H_PADDING = 16;

function money(n: number): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StoreDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.StoreDetail>>();
  const { storeId } = route.params;
  const { width: screenW } = useWindowDimensions();

  const { data: store, isLoading: storeLoading } = useStoreById(storeId);
  const { data: listings = [], isLoading, refetch, isRefetching } = useStoreListings(storeId);

  const cardWidth = (screenW - H_PADDING * 2 - GRID_GAP) / 2;

  const header = (
    <View style={{ marginBottom: 14 }}>
      {!!store?.banner_url && (
        <Image source={{ uri: store.banner_url }} style={styles.banner} contentFit="cover" />
      )}
      <View style={styles.identity}>
        <Avatar
          uri={getAvatarUrl(store?.avatar_url)}
          size={54}
          rounded
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
    </View>
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
            <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.thumbFallback}>
              <Icon name="Package" size={24} color="#3F3F46" />
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
      <ScreenHeader title={store?.name || t("stores.store")} />

      {storeLoading && isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
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
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="Package" size={40} color="#3F3F46" />
              <Text style={styles.emptyText}>{t("stores.noActiveListings")}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  banner: {
    width: "100%",
    height: 110,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  storeName: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  storeMeta: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  storeDesc: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginTop: 12 },

  card: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  thumbWrap: { width: "100%", backgroundColor: "#0A0A0A" },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
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
});
