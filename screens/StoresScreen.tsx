/**
 * StoresScreen
 * ============
 * Native port of the web StoresPage (/app/stores): Browse and My Store, same as
 * web's two tabs. Same Supabase marketplace tables — see hooks/useStores.ts.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import MyStoreTab from "../components/Stores/MyStoreTab";
import { theme } from "../theme";
import { useAuthState } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useBrowseListings,
  STORE_CATEGORIES,
  STORE_SORTS,
  type StoreListing,
} from "../hooks/useStores";

const GRID_GAP = 10;
const H_PADDING = 12;

function money(n: number): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function firstImage(l: StoreListing): string | null {
  const imgs = l.images;
  if (Array.isArray(imgs) && imgs.length > 0) return imgs[0];
  return null;
}

const ListingCard: React.FC<{ listing: StoreListing; width: number; onPress: () => void }> = ({
  listing,
  width,
  onPress,
}) => {
  const img = firstImage(listing);
  const soldOut = listing.stock_quantity === 0;

  return (
    <Pressable style={[styles.card, { width }]} onPress={onPress}>
      <View style={[styles.thumbWrap, { height: width }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.thumbFallback}>
            <Icon name="Package" size={26} color="#3F3F46" />
          </View>
        )}
        {listing.is_digital && (
          <View style={styles.digitalPill}>
            <Text style={styles.digitalText}>Digital</Text>
          </View>
        )}
        {soldOut && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>Sold out</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 9 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={styles.cardPrice}>{money(listing.price)}</Text>
        {!!listing.stores?.name && (
          <Text style={styles.cardStore} numberOfLines={1}>
            {listing.stores.name}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: screenW } = useWindowDimensions();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  // Web's StoresPage has exactly these two tabs; orders/purchases live inside
  // My Store as sub-tabs, same as web's MyStoreTab.
  const [tab, setTab] = useState<"browse" | "my-store">("browse");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  // Not debounced — web's BrowseTab passes `search` straight to the query and
  // relies on keepPreviousData to avoid a skeleton flash. Same here.
  const [search, setSearch] = useState("");

  const {
    data: listings = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useBrowseListings(category, sort, search);

  // Two columns, accounting for the outer padding and the inter-column gap.
  const cardWidth = (screenW - H_PADDING * 2 - GRID_GAP) / 2;

  const openListing = useCallback(
    (listing: StoreListing) => {
      navigation.navigate(ScreenNames.ListingDetail, { listingId: listing.id, listing });
    },
    [navigation],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Stores</Text>
          <Text style={styles.subtitle}>Peer-to-peer marketplace, settled in DHB</Text>
        </View>
        <Icon name="Store" size={22} color={theme.colors.accent} />
      </View>

      <View style={styles.segment}>
        {(["browse", "my-store"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.segmentBtn, tab === t && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === "browse" ? "Browse" : "My Store"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "browse" ? (
        <>
          <View style={styles.searchWrap}>
            <Icon name="Search" size={15} color="#71717A" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search listings"
              placeholderTextColor="#52525B"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Icon name="X" size={15} color="#71717A" />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {STORE_CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => setCategory(c.value)}
                style={[styles.chip, category === c.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
            <View style={styles.chipDivider} />
            {STORE_SORTS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                style={[styles.chip, sort === s.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, sort === s.value && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Couldn't load listings</Text>
              <Pressable onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={listings}
              keyExtractor={(l) => l.id}
              numColumns={2}
              columnWrapperStyle={{ gap: GRID_GAP }}
              renderItem={({ item }) => (
                <ListingCard listing={item} width={cardWidth} onPress={() => openListing(item)} />
              )}
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
                  tintColor={theme.colors.accentForeground}
                />
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Icon name="Package" size={44} color="#3F3F46" />
                  <Text style={styles.emptyText}>
                    {search ? "Nothing matches your search" : "No listings yet"}
                  </Text>
                </View>
              }
            />
          )}
        </>
      ) : (
        <MyStoreTab
          isAuthed={isAuthed}
          onSignIn={() => navigation.navigate(ScreenNames.SignIn)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },

  segment: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: H_PADDING,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: H_PADDING,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },

  chipRow: { gap: 8, paddingHorizontal: H_PADDING, paddingVertical: 10, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: "#000000" },
  chipDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginHorizontal: 2,
  },

  card: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  thumbWrap: { width: "100%", backgroundColor: "#0A0A0A" },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  digitalPill: {
    position: "absolute",
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  digitalText: { color: "#E4E4E7", fontSize: 9.5, fontWeight: "700" },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  soldText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  cardTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", lineHeight: 17 },
  cardPrice: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 5 },
  cardStore: { color: "#71717A", fontSize: 11, marginTop: 2 },

  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  orderThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
  },
  orderTitle: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  orderMeta: { color: "#71717A", fontSize: 11.5, marginTop: 3, textTransform: "capitalize" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText: { color: "#71717A", fontSize: 13, marginTop: 12, textAlign: "center" },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#27272A",
  },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },
});
