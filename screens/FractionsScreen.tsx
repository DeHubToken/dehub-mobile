/**
 * FractionsScreen
 * ===============
 * Native port of web's /app/fractions: browse every listing, manage what you
 * hold, and read the tape.
 *
 * A minted post is 1000 ERC-1155 units of one token id, so every minted post
 * is already divisible. The drawer row used to open the website for this;
 * buying from a listing, settling an open trade and answering an offer all
 * sign from the wallet the app already holds, so they belong here.
 *
 * The NFT market is the NFTs tab here (route param `tab: "nfts"`). iOS keeps
 * only that tab: fraction trading is left out of the App Store build, and the
 * market is view only there.
 */
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { shareWithRef } from "../libs/shareRef";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import BrowseFractionsTab from "../components/Fractions/BrowseFractionsTab";
import PortfolioTab from "../components/Fractions/PortfolioTab";
import ActivityTab from "../components/Fractions/ActivityTab";
import BuyFractionSheet from "../components/Fractions/BuyFractionSheet";
import SellFractionsSheet, { type SellTarget } from "../components/Fractions/SellFractionsSheet";
import MakeOfferSheet, { type OfferTarget } from "../components/Fractions/MakeOfferSheet";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import { theme } from "../theme";
import { PageTabs } from "../components/page/PageKit";
import { NftMarketView } from "./NftMarketScreen";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import {
  DEFAULT_FRACTION_CHAIN,
  useFractionWallet,
  useOpenTrades,
  type FractionListing,
} from "../hooks/useFractionMarket";

type Tab = "browse" | "nfts" | "portfolio" | "activity";

/** Tab artwork: theme icon keys (theme/icons.ts). */
const ALL_TABS: { key: Tab; icon: string; labelKey: string; fallback?: string }[] = [
  { key: "browse", icon: "search", labelKey: "fractions.title" },
  { key: "nfts", icon: "nfts", labelKey: "nftMarket.shortTitle", fallback: "NFTs" },
  { key: "portfolio", icon: "fractions", labelKey: "fractions.tabPortfolio" },
  { key: "activity", icon: "stats", labelKey: "fractions.tabActivity" },
];
const TABS = DIGITAL_PURCHASES_ENABLED ? ALL_TABS : ALL_TABS.filter((x) => x.key === "nfts");

export default function FractionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const wallet = useFractionWallet();
  const route = useRoute<any>();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = route.params?.tab as Tab | undefined;
    return asked && TABS.some((x) => x.key === asked) ? asked : TABS[0].key;
  });
  // A second link into an already open screen (a notification, the menu row).
  useEffect(() => {
    const asked = route.params?.tab as Tab | undefined;
    if (asked && TABS.some((x) => x.key === asked)) setTab(asked);
  }, [route.params?.tab]);
  const nftsOnly = TABS.length === 1;
  const [buying, setBuying] = useState<FractionListing | null>(null);
  const [selling, setSelling] = useState<SellTarget | null>(null);
  const [offering, setOffering] = useState<OfferTarget | null>(null);
  const { data: openTrades } = useOpenTrades(wallet);

  // Anything with a clock on it gets a count on the tab, so a delivery window
  // cannot quietly run out while the user is on a different tab.
  const needsAction = (openTrades?.toDeliver.length || 0) + (openTrades?.toPay.length || 0);

  const signIn = () => {
    setBuying(null);
    navigation.navigate(ScreenNames.SignIn);
  };
  const openPost = (tokenId: string) => navigation.navigate(ScreenNames.FeedDetail, { postId: tokenId });

  const share = () => {
    const url = tab === "nfts" ? ShareLinks.nfts() : ShareLinks.fractions();
    const message = tab === "nfts" ? t("nftMarket.shareMessage", { defaultValue: "Buy and sell NFTs on Riftn" }) : t("fractions.shareMessage");
    // The App Store build shares the bare link, without the buy-and-sell line.
    void shareWithRef({ message: DIGITAL_PURCHASES_ENABLED ? `${message}\n${url}` : url, url });
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={nftsOnly ? t("nftMarket.shortTitle", { defaultValue: "NFTs" }) : t("fractions.title")}
        subtitle={
          tab !== "nfts"
            ? t("fractions.perUpload")
            : DIGITAL_PURCHASES_ENABLED
              ? t("fractions.nftsSubtitle", { defaultValue: "Any NFT, one-step swaps" })
              : undefined
        }
        icon={nftsOnly ? "nfts" : "fractions"}
        rightContent={
          <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("fractions.share")}>
            <View style={styles.islandBtn}>
              <Icon name="Share2" size={18} color={theme.colors.accent} />
            </View>
          </Pressable>
        }
        tabs={
          /* Anything with a clock on it gets a count on the tab. */
          nftsOnly ? undefined : <PageTabs
            value={tab}
            onChange={setTab}
            tabs={TABS.map(({ key, icon, labelKey, fallback }) => ({
              id: key,
              icon,
              label:
                key === "portfolio" && needsAction > 0
                  ? t("fractions.tabPortfolioCount", { count: needsAction })
                  : t(labelKey, fallback ? { defaultValue: fallback } : undefined),
            }))}
          />
        }
      />

      <View style={styles.body}>
        {tab === "nfts" ? (
          <NftMarketView embedded />
        ) : tab === "browse" ? (
          <BrowseFractionsTab onOpenListing={setBuying} />
        ) : tab === "portfolio" ? (
          <PortfolioTab
            onSignIn={signIn}
            onOpenPost={openPost}
            onSell={(p) =>
              setSelling({
                tokenId: p.tokenId,
                chainId: p.chainId,
                post: {
                  title: p.title || undefined,
                  imageUrl: p.imageUrl || undefined,
                  type: p.postType || undefined,
                },
              })
            }
          />
        ) : (
          <ActivityTab onOpenPost={openPost} />
        )}
      </View>

      <BuyFractionSheet
        listing={buying}
        onClose={() => setBuying(null)}
        onSignIn={signIn}
        onMakeOffer={(l) => {
          setBuying(null);
          setOffering({
            tokenId: l.token_id,
            chainId: l.chain_id || DEFAULT_FRACTION_CHAIN,
            targetSeller: l.seller_address,
            listingId: l.id,
            title: l.post_title,
          });
        }}
      />
      <SellFractionsSheet target={selling} onClose={() => setSelling(null)} />
      <MakeOfferSheet target={offering} onClose={() => setOffering(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  body: { flex: 1 },
  tabsWrap: { marginBottom: 8, flexGrow: 0 },
  islandBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
});
