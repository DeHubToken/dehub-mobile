/**
 * NftMarketScreen
 * ===============
 * Native port of dehub.io/nfts: browse NFTs for sale on BNB, Base, Ethereum and Robinhood, sell
 * what you hold, and see recent sales. Orders are Seaport orders kept by the
 * DeHub API, the same ones the website shows.
 *
 * Android trades in the app. iOS is view only (App Store 3.1.1); in the US
 * storefront the sheet links out to dehub.io, which Apple allows there.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, Platform } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Localization from "expo-localization";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageEmpty, PageTabs } from "../components/page/PageKit";
import { DeHubLoader } from "../components/DeHubLoader";
import { DeHubRefreshControl } from "../components/Feed/DeHubRefreshControl";
import NftTile from "../components/NftMarket/NftTile";
import CollectionsRow from "../components/NftMarket/CollectionsRow";
import NftSpotlight, { type SpotlightItem } from "../components/NftMarket/NftSpotlight";
import NftSheet, { priceNow } from "../components/NftMarket/NftSheet";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import { shareWithRef } from "../libs/shareRef";
import { theme } from "../theme";
import { useWeb3Provider } from "../hooks/use-web3";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { CHAIN_LABEL, MARKET_CHAINS, nftMarket, type MarketCollection, type MarketOrder, type ShowcaseNft, type NftTarget, type Signer } from "../services/nft-market.service";

type Tab = "browse" | "mine" | "sales";
type ChainFilter = "all" | (typeof MARKET_CHAINS)[number];

/** The one card that stands for DeHub Posts on every chain. */
const DEHUB_ALL = "dehub:all";

const compactNumber = (n: number) => n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });

const TABS: { key: Tab; icon: string; labelKey: string; fallback: string }[] = [
  { key: "browse", icon: "search", labelKey: "nftMarket.tabBrowse", fallback: "Browse" },
  { key: "mine", icon: "nfts", labelKey: "nftMarket.tabMine", fallback: "Yours" },
  { key: "sales", icon: "stats", labelKey: "nftMarket.tabSales", fallback: "Sales" },
];

/** iOS outside the US gets no link out at all. */
function inUnitedStates(): boolean {
  try {
    return Localization.getLocales()?.[0]?.regionCode === "US";
  } catch {
    return false;
  }
}

const pad = <T,>(items: T[], cols = 2): (T | null)[] => {
  const extra = (cols - (items.length % cols)) % cols;
  return extra ? [...items, ...Array<null>(extra).fill(null)] : items;
};

const fromOrder = (o: MarketOrder): NftTarget => ({
  chainId: o.chainId,
  contract: o.contract,
  tokenId: o.tokenId,
  standard: o.standard,
  name: o.nftName,
  image: o.nftImage,
  collectionName: o.collectionName,
});

export default function NftMarketScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { provider, account, chainId } = useWeb3Provider();
  const canTrade = DIGITAL_PURCHASES_ENABLED;
  const linkOut = Platform.OS === "ios" && inUnitedStates();

  const [tab, setTab] = useState<Tab>("browse");
  const [chain, setChain] = useState<ChainFilter>("all");
  const [sort, setSort] = useState<"newest" | "price_asc">("newest");
  // Collections first: pick one from the trending row to see only its NFTs.
  const [coll, setColl] = useState<MarketCollection | null>(null);
  const [collOffer, setCollOffer] = useState<NftTarget | null>(null);
  // Chains and sort sit behind one button so the top stays slim.
  const [showFilters, setShowFilters] = useState(false);
  const [dehubOnly, setDehubOnly] = useState(false);
  const [open, setOpen] = useState<NftTarget | null>(() => {
    const p = route.params ?? {};
    return p.chain && p.contract && p.token ? { chainId: Number(p.chain), contract: String(p.contract), tokenId: String(p.token) } : null;
  });

  const signer: Signer | null = useMemo(
    () => (provider && account ? { provider, account: account.toLowerCase(), chainId: Number(chainId) || 8453 } : null),
    [provider, account, chainId],
  );
  const walletChain = signer?.chainId ?? 8453;

  const listings = useQuery({
    queryKey: ["nft-market", "orders", "listing", chain, sort, coll?.chainId, coll?.contract],
    queryFn: () =>
      nftMarket.orders({
        kind: "listing",
        status: "active",
        chainId: coll ? coll.chainId : chain === "all" ? undefined : chain,
        contract: coll?.contract,
        sort,
        limit: 60,
      }),
    enabled: tab === "browse",
  });
  const collections = useQuery({
    queryKey: ["nft-market", "collections", chain],
    queryFn: () => nftMarket.collections({ chainId: chain === "all" ? undefined : chain, limit: 12 }),
    enabled: tab === "browse",
    staleTime: 30_000,
  });
  // Minted DeHub posts, listed or not, so the market never looks empty.
  const showcase = useQuery({
    queryKey: ["nft-market", "showcase", chain],
    queryFn: () => nftMarket.showcase({ chainId: chain === "all" ? undefined : chain, limit: 30 }),
    enabled: tab === "browse",
    staleTime: 60_000,
  });
  // DeHub Posts live on every chain as one contract each; show them as one
  // collection, not one card per chain. Other collections keep their own card.
  const dehubTotals = useMemo(() => {
    const per = showcase.data?.collections ?? [];
    const listedDehub = (collections.data?.items ?? []).filter((c) => c.isDehub);
    return {
      minted: per.reduce((s, c) => s + (c.minted ?? 0), 0),
      listed: listedDehub.reduce((s, c) => s + c.listed, 0),
      image: per[0]?.image ?? listedDehub[0]?.image ?? null,
      any: per.length > 0 || listedDehub.length > 0,
    };
  }, [collections.data, showcase.data]);
  const forSaleTotal = useMemo(() => (collections.data?.items ?? []).reduce((s, c) => s + c.listed, 0), [collections.data]);
  const allCollections = useMemo<MarketCollection[]>(() => {
    const others = (collections.data?.items ?? []).filter((c) => !c.isDehub);
    if (!dehubTotals.any) return others;
    const dehub: MarketCollection = {
      chainId: 0,
      contract: DEHUB_ALL,
      name: t("nftMarket.dehubPostsName", { defaultValue: "DeHub Posts" }),
      image: dehubTotals.image,
      isDehub: true,
      listed: dehubTotals.listed,
      floor: null,
      minted: dehubTotals.minted,
    };
    return [dehub, ...others];
  }, [collections.data, dehubTotals, t]);
  const pickCollection = (c: MarketCollection | null) => {
    if (c?.contract === DEHUB_ALL) {
      setColl(null);
      setDehubOnly((v) => !v);
      return;
    }
    setDehubOnly(false);
    setColl(c);
  };
  const pickedCollection = dehubOnly ? { chainId: 0, contract: DEHUB_ALL } : coll;
  const showcaseItems = useMemo<ShowcaseNft[]>(() => {
    const items = showcase.data?.items ?? [];
    return coll ? items.filter((n) => n.chainId === coll.chainId && n.contract === coll.contract) : items;
  }, [showcase.data, coll]);
  const showcaseTarget = (n: ShowcaseNft): NftTarget => ({
    chainId: n.chainId,
    contract: n.contract,
    tokenId: n.tokenId,
    standard: "erc1155",
    name: n.name,
    image: n.image,
    collectionName: t("nftMarket.dehubPostsName", { defaultValue: "DeHub Posts" }),
  });
  const titleOf = (name: string | null | undefined, tokenId: string) => name?.trim() || `#${tokenId}`;
  const listedItems = useMemo(
    () => (listings.data?.items ?? []).filter((o) => !dehubOnly || o.isDehub),
    [listings.data, dehubOnly],
  );

  // The spotlight: newest listings when there are any, newest mints otherwise.
  // Whatever it shows is left out of the grid below, so nothing appears twice.
  const spotlightFromListings = !coll && listedItems.length > 0;
  const spotlight = useMemo<SpotlightItem[]>(() => {
    if (coll) return [];
    if (listedItems.length) {
      return listedItems.slice(0, 5).map((o) => ({
        key: o.orderHash,
        name: titleOf(o.nftName, o.tokenId),
        image: o.nftImage,
        chainId: o.chainId,
        price: { amount: priceNow(o), decimals: o.currencyDecimals, symbol: o.currencySymbol },
        onOpen: () => setOpen(fromOrder(o)),
      }));
    }
    return showcaseItems.filter((n) => n.image).slice(0, 5).map((n) => ({
      key: `${n.chainId}:${n.contract}:${n.tokenId}`,
      name: titleOf(n.name, n.tokenId),
      image: n.image,
      chainId: n.chainId,
      onOpen: () => setOpen(showcaseTarget(n)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coll, listedItems, showcaseItems]);
  const inSpotlight = useMemo(() => new Set(spotlight.map((s) => s.key)), [spotlight]);
  const gridListings = spotlightFromListings ? listedItems.filter((o) => !inSpotlight.has(o.orderHash)) : listedItems;
  const gridMints = spotlightFromListings ? showcaseItems : showcaseItems.filter((n) => !inSpotlight.has(`${n.chainId}:${n.contract}:${n.tokenId}`));

  // A chain change can hide the picked collection; drop it then.
  useEffect(() => {
    if (coll && chain !== "all" && coll.chainId !== chain) setColl(null);
  }, [chain, coll]);
  const sales = useQuery({
    queryKey: ["nft-market", "orders", "sales", chain],
    queryFn: () => nftMarket.orders({ status: "filled", chainId: chain === "all" ? undefined : chain, sort: "newest", limit: 60 }),
    enabled: tab === "sales",
  });
  const wallet = useQuery({
    queryKey: ["nft-market", "wallet", signer?.account, walletChain],
    queryFn: () => nftMarket.wallet(signer!.account, walletChain),
    enabled: tab === "mine" && !!signer,
  });
  const myOrders = useQuery({
    queryKey: ["nft-market", "orders", "mine", signer?.account],
    queryFn: () => nftMarket.orders({ maker: signer!.account, status: "active", limit: 60 }),
    enabled: tab === "mine" && !!signer,
  });
  const listedByMe = useMemo(() => {
    const map = new Map<string, MarketOrder>();
    for (const o of myOrders.data?.items ?? []) if (o.kind === "listing") map.set(`${o.chainId}:${o.contract}:${o.tokenId}`, o);
    return map;
  }, [myOrders.data]);

  const share = () => {
    const url = ShareLinks.nfts();
    void shareWithRef({ message: `${t("nftMarket.shareMessage", { defaultValue: "Buy and sell NFTs on DeHub" })}\n${url}`, url });
  };
  const signIn = () => {
    setOpen(null);
    navigation.navigate(ScreenNames.SignIn);
  };

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {(["all", ...MARKET_CHAINS] as ChainFilter[]).map((c) => (
        <Chip key={String(c)} label={c === "all" ? t("nftMarket.allChains", { defaultValue: "All chains" }) : CHAIN_LABEL[c]} active={chain === c} onPress={() => setChain(c)} />
      ))}
      {tab === "browse" ? (
        <>
          <View style={styles.divider} />
          <Chip label={t("nftMarket.newest", { defaultValue: "Newest" })} active={sort === "newest"} onPress={() => setSort("newest")} />
          <Chip label={t("nftMarket.cheapest", { defaultValue: "Lowest price" })} active={sort === "price_asc"} onPress={() => setSort("price_asc")} />
        </>
      ) : null}
    </ScrollView>
  );

  const loading = <View style={styles.center}><DeHubLoader size={56} /></View>;

  const browseHeader = (
    <View style={styles.headerStack}>
      {showFilters ? chips : null}
      <NftSpotlight items={spotlight} />
      {!coll ? (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{compactNumber(dehubTotals.minted)}</Text>
            <Text style={styles.statLabel}>{t("nftMarket.statMinted", { defaultValue: "Minted" })}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{compactNumber(forSaleTotal)}</Text>
            <Text style={styles.statLabel}>{t("nftMarket.statForSale", { defaultValue: "For sale" })}</Text>
          </View>
          <Pressable onPress={() => setTab("mine")} style={({ pressed }) => [styles.stat, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Text style={styles.statCta}>{t("nftMarket.sellYours", { defaultValue: "Sell yours" })} →</Text>
            <Text style={styles.statLabel}>{t("nftMarket.sellYoursHint", { defaultValue: "List from your wallet" })}</Text>
          </Pressable>
        </View>
      ) : null}
      {allCollections.length > 1 ? <CollectionsRow items={allCollections} selected={pickedCollection} onSelect={pickCollection} /> : null}
      {coll ? (
        <View style={styles.collBar}>
          <Text numberOfLines={1} style={styles.collTitle}>
            {coll.name || t("nftMarket.thisCollection", { defaultValue: "This collection" })}
            <Text style={styles.collCount}>
              {" · "}
              {coll.listed
                ? t("nftMarket.listedCount", { n: coll.listed, defaultValue: "{{n}} for sale" })
                : t("nftMarket.mintedCount", { n: coll.minted ?? 0, defaultValue: "{{n}} minted" })}
            </Text>
          </Text>
          {canTrade && (listedItems.length || showcaseItems.length) ? (
            <Chip
              label={t("nftMarket.collectionOffer", { defaultValue: "Offer on any" })}
              active={false}
              onPress={() => setCollOffer(listedItems.length ? fromOrder(listedItems[0]) : showcaseTarget(showcaseItems[0]))}
            />
          ) : null}
          <Chip label={t("nftMarket.showAll", { defaultValue: "Show all" })} active={false} onPress={() => setColl(null)} />
        </View>
      ) : null}
      {gridListings.length && !coll ? <Text style={styles.sectionTitle}>{t("nftMarket.forSale", { defaultValue: "For sale" })}</Text> : null}
    </View>
  );

  // Minted DeHub posts under the listings (or instead of them when none are for sale).
  const showcaseFooter =
    gridMints.length && (!coll || !listedItems.length) ? (
      <View style={styles.showcase}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            {coll ? t("nftMarket.openToOffers", { defaultValue: "Open to offers" }) : t("nftMarket.latestMints", { defaultValue: "Latest mints" })}
          </Text>
          {canTrade ? <Text style={styles.sectionHint}>{t("nftMarket.tapToOffer", { defaultValue: "Tap one to make an offer" })}</Text> : null}
        </View>
        {Array.from({ length: Math.ceil(gridMints.length / 3) }, (_, r) => (
          <View key={r} style={[styles.gridRowTight, { flexDirection: "row" }]}>
            {pad(gridMints.slice(r * 3, r * 3 + 3), 3).map((n, i) =>
              n ? (
                <NftTile
                  key={`${n.chainId}:${n.contract}:${n.tokenId}`}
                  compact
                  name={titleOf(n.name, n.tokenId)}
                  image={n.image}
                  chainId={n.chainId}
                  onPress={() => setOpen(showcaseTarget(n))}
                />
              ) : (
                <View key={`s-${i}`} style={styles.spacer} />
              ),
            )}
          </View>
        ))}
      </View>
    ) : null;

  const orderGrid = (q: typeof listings, emptyTitle: string, emptyBody?: string, sold?: boolean) => {
    const compact = !sold;
    const cols = compact ? 3 : 2;
    return (
    <FlatList
      key={compact ? "grid-3" : "grid-2"}
      data={q.isLoading || q.isError ? [] : pad(sold ? q.data?.items ?? [] : gridListings, cols)}
      keyExtractor={(o, i) => o?.orderHash ?? `spacer-${i}`}
      numColumns={cols}
      columnWrapperStyle={compact ? styles.gridRowTight : styles.gridRow}
      ListHeaderComponent={sold ? chips : browseHeader}
      ListFooterComponent={sold ? null : showcaseFooter}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor="#fff" />}
      renderItem={({ item }) =>
        item ? (
          <NftTile
            compact={compact}
            name={titleOf(item.nftName, item.tokenId)}
            collection={item.collectionName}
            image={item.nftImage}
            chainId={item.chainId}
            price={{ amount: sold ? item.price : priceNow(item), decimals: item.currencyDecimals, symbol: item.currencySymbol }}
            priceLabel={sold ? t("nftMarket.soldFor", { defaultValue: "Sold" }) : undefined}
            badge={
              (item.items?.length ?? 1) > 1
                ? t("nftMarket.bundleBadge", { n: item.items!.length, defaultValue: "Bundle ×{{n}}" })
                : !sold && item.endPrice && item.endPrice !== item.price
                  ? t("nftMarket.dropBadge", { defaultValue: "Price drop" })
                  : item.isDehub ? "DeHub" : null
            }
            onPress={() => setOpen(fromOrder(item))}
          />
        ) : (
          <View style={styles.spacer} />
        )
      }
      ListEmptyComponent={q.isLoading ? loading : !sold && showcaseItems.length ? null : (
        <PageEmpty icon="nfts" title={q.isError ? t("nftMarket.loadFailed", { defaultValue: "Couldn't load the market. Pull to retry." }) : emptyTitle} body={q.isError ? undefined : emptyBody} />
      )}
    />
  );
  };

  const mine = !signer ? (
    <PageEmpty
      icon="nfts"
      title={t("nftMarket.signInTitle", { defaultValue: "Sign in to see your NFTs" })}
      action={<Pressable onPress={signIn} style={styles.signIn} accessibilityRole="button"><Text style={styles.signInText}>{t("nftMarket.signIn", { defaultValue: "Sign in" })}</Text></Pressable>}
    />
  ) : (
    <FlatList
      data={wallet.isLoading || wallet.isError ? [] : pad(wallet.data?.items ?? [])}
      keyExtractor={(n, i) => (n ? `${n.contract}:${n.tokenId}` : `spacer-${i}`)}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={
        <Text style={styles.hint}>
          {t("nftMarket.walletOn", { chain: CHAIN_LABEL[walletChain] ?? walletChain, defaultValue: "NFTs in your wallet on {{chain}}" })}
        </Text>
      }
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={wallet.isRefetching} onRefresh={() => { void wallet.refetch(); void myOrders.refetch(); }} tintColor="#fff" />}
      renderItem={({ item }) => {
        if (!item) return <View style={styles.spacer} />;
        const listed = listedByMe.get(`${walletChain}:${item.contract.toLowerCase()}:${item.tokenId}`);
        return (
          <NftTile
            name={item.name ?? `#${item.tokenId}`}
            collection={item.collectionName}
            image={item.image}
            chainId={walletChain}
            price={listed ? { amount: listed.price, decimals: listed.currencyDecimals, symbol: listed.currencySymbol } : null}
            priceLabel={listed ? t("nftMarket.listedAt", { defaultValue: "Listed" }) : undefined}
            badge={item.standard === "erc1155" && item.balance !== "1" ? `×${item.balance}` : null}
            onPress={() => setOpen({ chainId: walletChain, contract: item.contract, tokenId: item.tokenId, standard: item.standard, name: item.name, image: item.image, collectionName: item.collectionName })}
          />
        );
      }}
      ListEmptyComponent={wallet.isLoading ? loading : (
        <PageEmpty icon="nfts" title={wallet.isError ? t("nftMarket.loadFailed", { defaultValue: "Couldn't load the market. Pull to retry." }) : t("nftMarket.noneHeld", { defaultValue: "No NFTs in this wallet yet" })} />
      )}
    />
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("nftMarket.shortTitle", { defaultValue: "NFTs" })}
        icon="nfts"
        rightContent={
          <View style={styles.islandRow}>
            {tab === "browse" ? (
              <Pressable
                onPress={() => setShowFilters((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: showFilters }}
                accessibilityLabel={t("nftMarket.filters", { defaultValue: "Filters" })}
              >
                <View style={[styles.islandBtn, (showFilters || chain !== "all" || sort !== "newest") && styles.islandBtnOn]}>
                  <Icon name="SlidersHorizontal" size={18} color={theme.colors.accent} />
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("nftMarket.share", { defaultValue: "Share" })}>
              <View style={styles.islandBtn}>
                <Icon name="Share2" size={18} color={theme.colors.accent} />
              </View>
            </Pressable>
          </View>
        }
        tabs={<PageTabs size="sm" value={tab} onChange={setTab} tabs={TABS.map(({ key, labelKey, fallback }) => ({ id: key, label: t(labelKey, { defaultValue: fallback }) }))} />}
      />
      <View style={styles.body}>
        {tab === "browse"
          ? orderGrid(listings, t("nftMarket.noneForSale", { defaultValue: "Nothing for sale yet" }), canTrade ? t("nftMarket.startHint", { defaultValue: "List an NFT from Yours to be first." }) : undefined)
          : tab === "sales"
            ? orderGrid(sales, t("nftMarket.noSales", { defaultValue: "No sales yet" }), undefined, true)
            : mine}
      </View>
      <NftSheet target={open} onClose={() => setOpen(null)} onSignIn={signIn} signer={signer} canTrade={canTrade} linkOut={linkOut} />
      <NftSheet target={collOffer} collectionOffer onClose={() => setCollOffer(null)} onSignIn={signIn} signer={signer} canTrade={canTrade} linkOut={linkOut} />
    </View>
  );
}

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  body: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  gridRow: { gap: 12 },
  gridRowTight: { gap: 6 },
  sectionTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", paddingTop: 10, paddingBottom: 6 },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  sectionHint: { color: "#808089", fontSize: 11.5 },
  headerStack: { gap: 10 },
  stats: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statCta: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  statLabel: { color: "#808089", fontSize: 11, marginTop: 3 },
  showcase: { gap: 6, paddingTop: 4 },
  islandRow: { flexDirection: "row", gap: 6 },
  islandBtnOn: { backgroundColor: "rgba(255,255,255,0.18)" },
  collBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingBottom: 2 },
  collTitle: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  collCount: { color: "#808089", fontWeight: "400" },
  spacer: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56 },
  hint: { color: "#808089", fontSize: 12, paddingVertical: 8 },
  chipScroll: { flexGrow: 0, marginHorizontal: -16 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  divider: { width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.12)" },
  chip: {
    paddingHorizontal: 14,
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
  signIn: { paddingHorizontal: 18, height: 40, borderRadius: 10, justifyContent: "center", backgroundColor: "#F4F4F5" },
  signInText: { color: "#09090B", fontWeight: "700", fontSize: 14 },
  islandBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
});
