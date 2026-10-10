import { useSurfaceDraft, draftIdentity } from '../hooks/useSurfaceDraft';
import BadgeArtwork from "../components/common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../libs/misc";
/**
 * UsernamesScreen
 * ===============
 * Native port of web's /usernames: Browse the handles that are for sale, or
 * sell the one you are wearing.
 *
 * The banner above the grid is the part that is not decoration. When somebody
 * searches an exact handle the API also says what that name *is*, and the most
 * useful answer is often "nobody has it". A marketplace that lets someone pay
 * for a name they could have claimed in Settings is not one they come back to.
 */
import { appLocale } from "../libs/date.util";
import { DhbCoin } from "../components/common/DhbCoin";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
} from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import SellUsernamePanel from "../components/Usernames/SellUsernamePanel";
import UsernameVaultPanel from "../components/Usernames/UsernameVaultPanel";
import OffersPanel from "../components/Usernames/OffersPanel";
import MakeOfferSheet from "../components/Usernames/MakeOfferSheet";
import BuyUsernameSheet from "../components/Usernames/BuyUsernameSheet";
import Avatar from "../components/common/Avatar";
import { getAvatarUrl, getBadgeUrlFor } from "../libs/misc";
import { theme } from "../theme";
import { useAuthState } from "../context/AuthContext";
import { KitButton, PageEmpty, PageSection, PageTabs } from "../components/page/PageKit";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useBrowseUsernames, USERNAME_SORTS } from "../hooks/useUsernameMarket";
import type { UsernameListing, UsernameSort } from "../services/username-market.service";

/** Vertical gap between listing rows. */
const ROW_GAP = 10;
const H_PADDING = 16;

/**
 * Price bands, matching web's presets.
 *
 * Chips in the same strip as the sorts rather than web's popover — a phone has
 * no room for a filter sheet over the list, and the whole filter set is four
 * sorts and four bands.
 */
const PRICE_BANDS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: "under10k", label: "< $10", max: 10 },
  { key: "10kTo100k", label: "$10–$100", min: 10, max: 100 },
  { key: "100kTo1m", label: "$100–$1,000", min: 100, max: 1_000 },
  { key: "over1m", label: "$1,000+", min: 1_000 },
];

/**
 * Handle type size, by length.
 *
 * A full-width row holds far more than a half-width tile did, so this only
 * steps down for genuinely long names and its floor is above the old ceiling.
 * The whole name is the product; shrinking it to fit a box is the one thing
 * this card must not do.
 *
 * `flexShrink: 0` on the label still matters: a `<Text>` allowed to shrink
 * below its intrinsic width renders as a bare `…` on Fabric.
 */
function handleSize(length: number): number {
  if (length <= 12) return 24;
  if (length <= 20) return 19;
  return 15;
}

const UsernameCard: React.FC<{
  listing: UsernameListing;
  onPress: () => void;
}> = ({ listing, onPress }) => {
  const { t } = useTranslation();
  const seller = listing.seller;
  // `getBadgeUrlFor` rather than getBadgeUrl(resolveBadgeBalance(…)): it reads
  // the balance AND the grandfathered lock together, so a holder does not wear
  // a lower badge here than on their own profile if the payload ever grows one.
  const badgeImg = getBadgeUrlFor(seller as any);

  return (
    <PageSection flush>
    <Pressable style={styles.card} onPress={onPress}>
      {/* Left. `minWidth: 0` is what lets this shrink so the price stays on the
          row — without it the flex child keeps its intrinsic width and pushes
          the price off the right edge. */}
      <View style={styles.cardMain}>
        <Text style={[styles.handle, { fontSize: handleSize(listing.length) }]}>
          <Text style={styles.at}>@</Text>
          {listing.username}
        </Text>

        <View style={styles.chipWrap}>
          <View style={styles.metaChip}>
            <Icon name="Ruler" size={10} color="#D4D4D8" />
            <Text style={styles.metaChipText}>
              {t("usernames.chars", { count: listing.length })}
            </Text>
          </View>
          {listing.isNumeric && (
            <View style={styles.metaChip}>
              <Icon name="Hash" size={10} color="#D4D4D8" />
              <Text style={styles.metaChipText}>{t("usernames.numbersOnly")}</Text>
            </View>
          )}
        </View>

        <View style={styles.sellerRow}>
          <Avatar
            uri={getAvatarUrl(seller.avatarUrl, 14)}
            size={14}
            name={seller.displayName || seller.address}
          />
          <Text style={styles.sellerName} numberOfLines={1}>
            {seller.displayName || shortAddress(seller.address)}
          </Text>
          {/* getBadgeUrl returns a bundled asset id, not a URL — `source` takes
              it directly and `{ uri: … }` is a type error. */}
          {!!badgeImg && (
            <BadgeArtwork source={badgeImg} style={getBadgeHoverOpticalStyle(badgeImg, 11)} contentFit="contain" />
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
          ${listing.priceUsd.toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={styles.cardPriceUnit}><DhbCoin size={12} /> {listing.priceDhb.toLocaleString(appLocale(), { maximumFractionDigits: 6 })}</Text>
      </View>
    </Pressable>
    </PageSection>
  );
};

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type UsernamesTab = "browse" | "mine" | "sell" | "offers";

// The tab param also arrives from deep-link query strings, so anything that is
// not a real tab is ignored rather than rendering the Sell panel unhighlighted.
function asUsernamesTab(value: unknown): UsernamesTab | null {
  return value === "browse" || value === "mine" || value === "sell" || value === "offers"
    ? value
    : null;
}

export default function UsernamesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Usernames>>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [tab, setTab] = useState<UsernamesTab>(() => asUsernamesTab(route.params?.tab) ?? "browse");
  // navigate() reuses a Usernames screen that is already open, so the initial
  // state above would keep its old tab. Keyed on the params object: each
  // navigate hands over a fresh one, so this also fires for the same tab again.
  const routeParams = route.params;
  useEffect(() => {
    const next = asUsernamesTab(routeParams?.tab);
    if (next) setTab(next);
  }, [routeParams]);
  // Which of your names the sell form should open on. The vault hands it over
  // when you press "sell" on a row.
  const [sellingUsername, setSellingUsername] = useState<string | null>(null);
  const [sort, setSort] = useState<UsernameSort>("newest");
  // A shared listing link (dehub.io/usernames?handle=x) lands here with the
  // handle already in the box, the same as web's ?handle= param.
  const [search, setSearch] = useSurfaceDraft("screens/UsernamesScreen.tsx:search", () => String(route.params?.handle || ""));
  const [band, setBand] = useState<string | null>(null);
  const [selected, setSelected] = useState<UsernameListing | null>(null);
  // The handle a bid is being made for. Set from the "somebody holds this"
  // banner, which is the moment the want actually exists.
  const [offering, setOffering] = useState<string | null>(null);

  const activeBand = PRICE_BANDS.find((b) => b.key === band);
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isError, refetch, isRefetching } = useBrowseUsernames({
    search: debouncedSearch,
    sort,
    minPriceUsd: activeBand?.min,
    maxPriceUsd: activeBand?.max,
  });

  const listings = data?.listings ?? [];

  const openListing = useCallback((listing: UsernameListing) => {
    setSelected(listing);
  }, []);

  const banner = useMemo(() => {
    const exact = data?.exact;
    if (!exact) return null;
    // A listed handle is already in the grid below; saying so twice is noise.
    if (exact.state === "listed" && listings.some((l) => l.username === exact.username)) return null;

    if (exact.state === "available") {
      return (
        <Pressable
          style={[styles.banner, styles.bannerFree]}
          onPress={() => navigation.navigate(ScreenNames.EditProfile)}
        >
          <Icon name="Tag" size={15} color="#F4F4F5" />
          <Text style={styles.bannerFreeText}>
            {t("usernames.bannerAvailable", { handle: exact.username })}
          </Text>
        </Pressable>
      );
    }
    if (exact.state === "taken") {
      return (
        <Pressable style={styles.banner} onPress={() => setOffering(exact.username)}>
          <Icon name="User" size={15} color="#A1A1AA" />
          <Text style={styles.bannerText}>
            {t("usernames.bannerTaken", { handle: exact.username })}
          </Text>
          <Text style={styles.bannerAction}>{t("usernames.makeOfferAction")}</Text>
        </Pressable>
      );
    }
    if (exact.state === "reserved") {
      return (
        <View style={styles.banner}>
          <Icon name="Lock" size={15} color="#A1A1AA" />
          <Text style={styles.bannerText}>
            {t("usernames.bannerReserved", { handle: exact.username })}
          </Text>
        </View>
      );
    }
    return null;
  }, [data?.exact, listings, navigation, t]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("screens.usernames")}
        subtitle={t("usernames.subtitle")}
        icon="usernames"
      />

      {/* "Mine" sits next to Browse rather than inside Sell, because owning a
          handle and selling one stopped being the same thing the moment an
          account could hold more than one. */}
      <View style={styles.tabsWrap}>
        <PageTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "browse", label: t("usernames.browse"), icon: "search" },
            { id: "mine", label: t("usernames.tabMine"), icon: "usernames" },
            { id: "sell", label: t("usernames.sell"), icon: "usernames" },
            { id: "offers", label: t("usernames.tabOffers"), icon: "stores" },
          ]}
        />
      </View>

      {tab === "browse" ? (
        <>
          <View style={styles.searchWrap}>
            <Icon name="Search" size={15} color="#808089" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("usernames.searchPlaceholder")}
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
                accessibilityLabel={t("usernames.clearSearch")}
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
            {USERNAME_SORTS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                style={[styles.chip, sort === s.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, sort === s.value && styles.chipTextActive]}>
                  {t(`usernames.sorts.${s.labelKey}`)}
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
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {!!data && (
            <Text style={styles.count}>
              {t("usernames.forSaleCount", { count: data.total })}
            </Text>
          )}

          {isLoading ? (
            <View style={styles.center}>
              <DeHubLoader size={56} />
            </View>
          ) : isError ? (
            <PageEmpty
              icon="usernames"
              title={t("usernames.loadFailed")}
              action={<KitButton label={t("common.retry")} onPress={() => refetch()} />}
            />
          ) : (
            <FlatList
              data={listings}
              keyExtractor={(l) => l.id}
              renderItem={({ item }) => (
                <UsernameCard listing={item} onPress={() => openListing(item)} />
              )}
              // Rows run edge to edge (PageSection); the banner keeps the gutter.
              ListHeaderComponent={banner ? <View style={styles.bannerWrap}>{banner}</View> : null}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 96,
              }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <DeHubRefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={theme.colors.accent}
                />
              }
              ListEmptyComponent={
                <PageEmpty
                  icon="usernames"
                  title={debouncedSearch ? t("usernames.noSearchResults") : t("usernames.noListings")}
                />
              }
            />
          )}
        </>
      ) : tab === "offers" ? (
        <OffersPanel
          isAuthed={isAuthed}
          onSignIn={() => navigation.navigate(ScreenNames.SignIn)}
        />
      ) : tab === "mine" ? (
        <UsernameVaultPanel
          isAuthed={isAuthed}
          onSignIn={() => navigation.navigate(ScreenNames.SignIn)}
          onSell={(username) => {
            setSellingUsername(username);
            setTab("sell");
          }}
        />
      ) : (
        <SellUsernamePanel
          isAuthed={isAuthed}
          onSignIn={() => navigation.navigate(ScreenNames.SignIn)}
          username={sellingUsername}
          onUsernameChange={setSellingUsername}
        />
      )}

      <BuyUsernameSheet
        listing={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        isAuthed={isAuthed}
        onSignIn={() => {
          setSelected(null);
          navigation.navigate(ScreenNames.SignIn);
        }}
      />
      <MakeOfferSheet
        username={offering}
        visible={!!offering}
        onClose={() => setOffering(null)}
        isAuthed={isAuthed}
        onSignIn={() => {
          setOffering(null);
          navigation.navigate(ScreenNames.SignIn);
        }}
      />
      <DeHubRefreshMark refreshing={isRefetching} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

  tabsWrap: { marginBottom: 8, flexGrow: 0 },
  bannerAction: { color: "#F4F4F5", fontSize: 12, fontWeight: "700", flexShrink: 0 },

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
    // A fixed height, not vertical padding: text-only chips in a centred
    // horizontal ScrollView were measured into the strip's leftover height on
    // Android and rendered with their labels cut through the middle.
    height: 30,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.5)" },
  chipText: { color: "#A1A1AA", fontSize: 12, lineHeight: 16, fontWeight: "600", flexShrink: 0 },
  chipTextActive: { color: "#FFFFFF" },
  chipDivider: { width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.14)" },
  count: {
    color: "#808089",
    fontSize: 11,
    textAlign: "right",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },

  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    marginBottom: ROW_GAP,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bannerFree: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  bannerText: { flex: 1, color: "#D4D4D8", fontSize: 12.5, lineHeight: 18 },
  bannerFreeText: { flex: 1, color: "#D4D4D8", fontSize: 12.5, lineHeight: 18 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
  },
  bannerWrap: { paddingHorizontal: H_PADDING },
  // minWidth: 0 lets this shrink so the price stays on the row. Without it the
  // flex child keeps its intrinsic width and pushes the price off the edge.
  cardMain: { flex: 1, minWidth: 0, gap: 6 },
  cardPriceCol: { flexShrink: 0, alignItems: "flex-end" },
  handle: { color: "#FFFFFF", fontWeight: "700", flexShrink: 0 },
  at: { color: "#808089" },
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
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  sellerName: { flexShrink: 1, color: "#A1A1AA", fontSize: 11 },
  sellerBadge: { width: 11, height: 11 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  emptyText: { color: "#808089", fontSize: 13, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});
