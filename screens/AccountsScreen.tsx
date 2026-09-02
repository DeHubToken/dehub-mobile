/**
 * AccountsScreen
 * ==============
 * Native port of web's /accounts: browse whole DeHub accounts for sale, or
 * sell the one you are signed in as.
 *
 * The card sells an audience, not a string, so it leads with the numbers a
 * buyer is actually paying for — followers, uploads, badge, age — read live by
 * the server on every browse rather than trusted from the listing row.
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
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import SellAccountPanel from "../components/Accounts/SellAccountPanel";
import BuyAccountSheet from "../components/Accounts/BuyAccountSheet";
import Avatar from "../components/common/Avatar";
import { getAvatarUrl, getBadgeUrlFor } from "../libs/misc";
import { theme } from "../theme";
import { useAuthState } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useBrowseAccounts, ACCOUNT_SORTS } from "../hooks/useAccountMarket";
import type { AccountListing, AccountSort } from "../services/account-market.service";

/** Vertical gap between listing rows. */
const ROW_GAP = 10;
const H_PADDING = 16;

/**
 * Price bands, matching web's presets. Accounts skew pricier than handles, so
 * the bands start an order of magnitude up.
 */
const PRICE_BANDS: { key: string; min?: number; max?: number }[] = [
  { key: "under100k", max: 100_000 },
  { key: "100kTo1m", min: 100_000, max: 1_000_000 },
  { key: "1mTo10m", min: 1_000_000, max: 10_000_000 },
  { key: "over10m", min: 10_000_000 },
];

/** 1234567 → "1.2M" — card space is too tight for full thousands separators. */
export function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

/** "Since 2021" — account age is part of what is being sold. */
export function accountSince(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const year = new Date(createdAt).getFullYear();
  return Number.isFinite(year) ? String(year) : null;
}

const AccountCard: React.FC<{
  listing: AccountListing;
  onPress: () => void;
}> = ({ listing, onPress }) => {
  const { t } = useTranslation();
  const seller = listing.seller;
  // `getBadgeUrlFor` rather than getBadgeUrl(resolveBadgeBalance(…)): it reads
  // the balance AND the grandfathered lock together, so a holder does not wear
  // a lower badge here than on their own profile.
  const badgeImg = getBadgeUrlFor(seller as any);
  const since = accountSince(seller.accountCreatedAt);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Avatar
        uri={getAvatarUrl(seller.avatarUrl, 44)}
        size={44}
        rounded
        name={seller.displayName || listing.username}
      />

      {/* `minWidth: 0` is what lets this shrink so the price stays on the row —
          without it the flex child keeps its intrinsic width and pushes the
          price off the right edge. */}
      <View style={styles.cardMain}>
        <View style={styles.handleRow}>
          <Text style={styles.handle} numberOfLines={1}>
            <Text style={styles.at}>@</Text>
            {listing.username}
          </Text>
          {/* getBadgeUrl returns a bundled asset id, not a URL — `source` takes
              it directly and `{ uri: … }` is a type error. */}
          {!!badgeImg && (
            <Image source={badgeImg} style={styles.badge} contentFit="contain" />
          )}
        </View>

        <View style={styles.chipWrap}>
          <View style={styles.metaChip}>
            <Icon name="Users" size={10} color="#D4D4D8" />
            <Text style={styles.metaChipText}>
              {t("accounts.followersCount", { compact: compactCount(seller.followers) })}
            </Text>
          </View>
          <View style={styles.metaChip}>
            <Icon name="Upload" size={10} color="#D4D4D8" />
            <Text style={styles.metaChipText}>
              {t("accounts.uploadsCount", { compact: compactCount(seller.uploads) })}
            </Text>
          </View>
          {!!since && (
            <View style={styles.metaChip}>
              <Icon name="CalendarClock" size={10} color="#D4D4D8" />
              <Text style={styles.metaChipText}>{t("accounts.since", { year: since })}</Text>
            </View>
          )}
        </View>

        {!!listing.description && (
          <Text style={styles.cardDesc} numberOfLines={1}>
            {listing.description}
          </Text>
        )}
      </View>

      {/* Right: right-aligned so a column of rows lines up on the digits. */}
      <View style={styles.cardPriceCol}>
        <Text style={styles.cardPrice} numberOfLines={1}>
          {listing.priceDhb.toLocaleString("en-US")}
        </Text>
        <Text style={styles.cardPriceUnit}>DHB</Text>
      </View>
    </Pressable>
  );
};

export default function AccountsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Accounts>>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [tab, setTab] = useState<"browse" | "sell">("browse");
  const [sort, setSort] = useState<AccountSort>("newest");
  // A shared listing link (dehub.io/accounts?handle=x) lands here with the
  // handle already in the box, the same as web's ?handle= param.
  const [search, setSearch] = useState(() => String(route.params?.handle || ""));
  const [band, setBand] = useState<string | null>(null);
  const [selected, setSelected] = useState<AccountListing | null>(null);

  const activeBand = PRICE_BANDS.find((b) => b.key === band);
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isError, refetch, isRefetching } = useBrowseAccounts({
    search: debouncedSearch,
    sort,
    minPriceDhb: activeBand?.min,
    maxPriceDhb: activeBand?.max,
  });

  const listings = data?.listings ?? [];

  const openListing = useCallback((listing: AccountListing) => {
    setSelected(listing);
  }, []);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("screens.accounts")}
        subtitle={t("accounts.subtitle")}
        rightContent={<Icon name="IdCard" size={22} color={theme.colors.accent} />}
      />

      <View style={styles.segment}>
        {(["browse", "sell"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.segmentBtn, tab === key && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
              {key === "browse" ? t("accounts.browse") : t("accounts.sell")}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "browse" ? (
        <>
          <View style={styles.searchWrap}>
            <Icon name="Search" size={15} color="#808089" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("accounts.searchPlaceholder")}
              placeholderTextColor="#8B8D90"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("accounts.clearSearch")}
              >
                <Icon name="X" size={15} color="#808089" />
              </Pressable>
            )}
          </View>

          {/* flexGrow: 0 is load-bearing — RN's baseHorizontal style is
              {flexGrow: 1}, so without it this strip expands and squashes the
              grid below it. contentContainerStyle cannot fix that. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {ACCOUNT_SORTS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                style={[styles.chip, sort === s.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, sort === s.value && styles.chipTextActive]}>
                  {t(`accounts.sorts.${s.labelKey}`)}
                </Text>
              </Pressable>
            ))}
            <View style={styles.chipDivider} />
            {PRICE_BANDS.map((b) => (
              <Pressable
                key={b.key}
                // Tapping the active band clears it, so there is always a way
                // back to "any price" without a separate Clear control.
                onPress={() => setBand(band === b.key ? null : b.key)}
                style={[styles.chip, band === b.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, band === b.key && styles.chipTextActive]}>
                  {t(`accounts.bands.${b.key}`)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {!!data && (
            <Text style={styles.count}>
              {t("accounts.forSaleCount", { count: data.total })}
            </Text>
          )}

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>{t("accounts.loadFailed")}</Text>
              <Pressable onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryText}>{t("common.retry")}</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={listings}
              keyExtractor={(l) => l.id}
              renderItem={({ item }) => (
                <AccountCard listing={item} onPress={() => openListing(item)} />
              )}
              contentContainerStyle={{
                paddingHorizontal: H_PADDING,
                paddingBottom: insets.bottom + 96,
                gap: ROW_GAP,
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
                  <Icon name="IdCard" size={44} color="#3F3F46" />
                  <Text style={styles.emptyText}>
                    {debouncedSearch ? t("accounts.noSearchResults") : t("accounts.noListings")}
                  </Text>
                </View>
              }
            />
          )}
        </>
      ) : (
        <SellAccountPanel
          isAuthed={isAuthed}
          onSignIn={() => navigation.navigate(ScreenNames.SignIn)}
        />
      )}

      <BuyAccountSheet
        listing={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        isAuthed={isAuthed}
        onSignIn={() => {
          setSelected(null);
          navigation.navigate(ScreenNames.SignIn);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

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
  segmentText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600", flexShrink: 0 },
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

  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: H_PADDING, paddingVertical: 10, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.5)" },
  chipText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", flexShrink: 0 },
  chipTextActive: { color: "#FFFFFF" },
  chipDivider: { width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.14)" },
  count: {
    color: "#808089",
    fontSize: 11,
    textAlign: "right",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  // minWidth: 0 lets this shrink so the price stays on the row. Without it the
  // flex child keeps its intrinsic width and pushes the price off the edge.
  cardMain: { flex: 1, minWidth: 0, gap: 6 },
  cardPriceCol: { flexShrink: 0, alignItems: "flex-end" },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  handle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", flexShrink: 1 },
  at: { color: "#808089" },
  badge: { width: 14, height: 14 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  metaChipText: { color: "#D4D4D8", fontSize: 9.5, fontWeight: "600", flexShrink: 0 },
  cardDesc: { color: "#A1A1AA", fontSize: 11, lineHeight: 15 },

  cardPrice: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", flexShrink: 0 },
  cardPriceUnit: { color: "#808089", fontSize: 10, fontWeight: "500", flexShrink: 0 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  emptyText: { color: "#808089", fontSize: 13, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});
