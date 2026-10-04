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
 */
import React, { useState } from "react";
import { View, StyleSheet, Pressable, Share } from "react-native";
import { useNavigation } from "@react-navigation/native";
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
import {
  DEFAULT_FRACTION_CHAIN,
  useFractionWallet,
  useOpenTrades,
  type FractionListing,
} from "../hooks/useFractionMarket";

type Tab = "browse" | "portfolio" | "activity";

/** Tab artwork: theme icon keys (theme/icons.ts). */
const TABS: { key: Tab; icon: string; labelKey: string }[] = [
  { key: "browse", icon: "search", labelKey: "fractions.tabBrowse" },
  { key: "portfolio", icon: "fractions", labelKey: "fractions.tabPortfolio" },
  { key: "activity", icon: "stats", labelKey: "fractions.tabActivity" },
];

export default function FractionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const wallet = useFractionWallet();
  const [tab, setTab] = useState<Tab>("browse");
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
    const url = ShareLinks.fractions();
    void Share.share({ message: `${t("fractions.shareMessage")}\n${url}`, url });
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("fractions.title")}
        subtitle={t("fractions.perUpload")}
        icon="fractions"
        rightContent={
          <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("fractions.share")}>
            <View style={styles.islandBtn}>
              <Icon name="Share2" size={18} color={theme.colors.accent} />
            </View>
          </Pressable>
        }
      />

      {/* Anything with a clock on it gets a count on the tab. */}
      <View style={styles.tabsWrap}>
        <PageTabs
          value={tab}
          onChange={setTab}
          tabs={TABS.map(({ key, icon, labelKey }) => ({
            id: key,
            icon,
            label:
              key === "portfolio" && needsAction > 0
                ? t("fractions.tabPortfolioCount", { count: needsAction })
                : t(labelKey),
          }))}
        />
      </View>

      <View style={styles.body}>
        {tab === "browse" ? (
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
