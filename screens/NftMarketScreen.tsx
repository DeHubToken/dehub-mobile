/**
 * NftMarketScreen
 * ===============
 * Native port of dehub.io/nfts: browse NFTs for sale on BNB and Base, sell
 * what you hold, and see recent sales. Orders are Seaport orders kept by the
 * DeHub API, the same ones the website shows.
 *
 * Android trades in the app. iOS is view only (App Store 3.1.1); in the US
 * storefront the sheet links out to dehub.io, which Apple allows there.
 */
import React, { useMemo, useState } from "react";
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
import NftSheet from "../components/NftMarket/NftSheet";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import { shareWithRef } from "../libs/shareRef";
import { theme } from "../theme";
import { useWeb3Provider } from "../hooks/use-web3";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { CHAIN_LABEL, MARKET_CHAINS, nftMarket, type MarketOrder, type NftTarget, type Signer } from "../services/nft-market.service";

type Tab = "browse" | "mine" | "sales";
type ChainFilter = "all" | (typeof MARKET_CHAINS)[number];

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

const pad = <T,>(items: T[]): (T | null)[] => (items.length % 2 ? [...items, null] : items);

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
    queryKey: ["nft-market", "orders", "listing", chain, sort],
    queryFn: () => nftMarket.orders({ kind: "listing", status: "active", chainId: chain === "all" ? undefined : chain, sort, limit: 60 }),
    enabled: tab === "browse",
  });
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

  const orderGrid = (q: typeof listings, emptyTitle: string, emptyBody?: string, sold?: boolean) => (
    <FlatList
      data={q.isLoading || q.isError ? [] : pad(q.data?.items ?? [])}
      keyExtractor={(o, i) => o?.orderHash ?? `spacer-${i}`}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={chips}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor="#fff" />}
      renderItem={({ item }) =>
        item ? (
          <NftTile
            name={item.nftName ?? `#${item.tokenId}`}
            collection={item.collectionName}
            image={item.nftImage}
            chainId={item.chainId}
            price={{ amount: item.price, decimals: item.currencyDecimals, symbol: item.currencySymbol }}
            priceLabel={sold ? t("nftMarket.soldFor", { defaultValue: "Sold" }) : undefined}
            badge={item.isDehub ? "DeHub" : null}
            onPress={() => setOpen(fromOrder(item))}
          />
        ) : (
          <View style={styles.spacer} />
        )
      }
      ListEmptyComponent={q.isLoading ? loading : (
        <PageEmpty icon="nfts" title={q.isError ? t("nftMarket.loadFailed", { defaultValue: "Couldn't load the market. Pull to retry." }) : emptyTitle} body={q.isError ? undefined : emptyBody} />
      )}
    />
  );

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
        title={t("nftMarket.title", { defaultValue: "NFTs" })}
        subtitle={t("nftMarket.subtitle", { defaultValue: "Buy and sell on BNB and Base" })}
        icon="nfts"
        rightContent={
          <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("nftMarket.share", { defaultValue: "Share" })}>
            <View style={styles.islandBtn}>
              <Icon name="Share2" size={18} color={theme.colors.accent} />
            </View>
          </Pressable>
        }
        tabs={<PageTabs value={tab} onChange={setTab} tabs={TABS.map(({ key, icon, labelKey, fallback }) => ({ id: key, icon, label: t(labelKey, { defaultValue: fallback }) }))} />}
      />
      <View style={styles.body}>
        {tab === "browse"
          ? orderGrid(listings, t("nftMarket.noneForSale", { defaultValue: "Nothing for sale yet" }), canTrade ? t("nftMarket.startHint", { defaultValue: "List an NFT from Yours to be first." }) : undefined)
          : tab === "sales"
            ? orderGrid(sales, t("nftMarket.noSales", { defaultValue: "No sales yet" }), undefined, true)
            : mine}
      </View>
      <NftSheet target={open} onClose={() => setOpen(null)} onSignIn={signIn} signer={signer} canTrade={canTrade} linkOut={linkOut} />
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
