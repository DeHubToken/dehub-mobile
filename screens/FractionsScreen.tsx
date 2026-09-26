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
import { View, Text, StyleSheet, Pressable, Share } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
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
import {
  DEFAULT_FRACTION_CHAIN,
  useFractionWallet,
  useOpenTrades,
  type FractionListing,
} from "../hooks/useFractionMarket";

type Tab = "browse" | "portfolio" | "activity";

const TABS: { key: Tab; icon: IconName; labelKey: string }[] = [
  { key: "browse", icon: "ShoppingBag", labelKey: "fractions.tabBrowse" },
  { key: "portfolio", icon: "Wallet", labelKey: "fractions.tabPortfolio" },
  { key: "activity", icon: "Activity", labelKey: "fractions.tabActivity" },
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
        rightContent={
          <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("fractions.share")}>
            <Icon name="Share2" size={20} color={theme.colors.accent} />
          </Pressable>
        }
      />

      <View style={styles.segment}>
        {TABS.map(({ key, icon, labelKey }) => {
          const active = tab === key;
          const label =
            key === "portfolio" && needsAction > 0
              ? t("fractions.tabPortfolioCount", { count: needsAction })
              : t(labelKey);
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Icon name={icon} size={14} color={active ? "#FFFFFF" : "#A1A1AA"} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
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
  segment: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  segmentTextActive: { color: "#FFFFFF" },
});
