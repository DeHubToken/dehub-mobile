/**
 * What you hold, what you have listed, what you have bid, and what you owe.
 *
 * The settlement rail sits at the top on purpose: an open trade is the one
 * thing here with a clock on it, and burying it under a grid of holdings is
 * how a seller misses a delivery window.
 *
 * Offers aimed at you are answered right here. Web sends them to the post's
 * info page, which has no native twin, and an offer you cannot act on from the
 * app is one that expires unanswered.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon, { type IconName } from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl } from "../Feed/DeHubRefreshControl";
import SettlementRail from "./SettlementRail";
import FractionPositionGrid from "./FractionPositionGrid";
import { toastError, toastSuccess } from "../../libs/toast";
import { useFractionPortfolio, type PortfolioPosition } from "../../hooks/useFractionPortfolio";
import { useOfferResponse } from "../../hooks/useFractionCheckout";
import {
  useCancelListing,
  useCancelOffer,
  useFractionWallet,
  useMyListings,
  useMyOffers,
  useOpenTrades,
} from "../../hooks/useFractionMarket";

interface Props {
  onSignIn: () => void;
  onSell: (position: PortfolioPosition) => void;
  onOpenPost: (tokenId: string) => void;
}

/** One line of a listing or a bid: what, how many, at what price, and a button. */
const OrderRow: React.FC<{
  title: string;
  quantity: number;
  price: number;
  actions: { label: string; icon: IconName; onPress: () => void; pending?: boolean; primary?: boolean }[];
}> = ({ title, quantity, price, actions }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.order}>
      <View style={styles.orderMain}>
        <Text style={styles.orderTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.inline}>
          <Text style={styles.orderMeta}>{t("fractions.fractionCountDot", { count: quantity })} </Text>
          <DhbCoin size={11} />
          <Text style={styles.orderMeta}> {t("fractions.priceEach", { price })}</Text>
        </View>
      </View>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          disabled={a.pending}
          style={[styles.orderBtn, a.primary && styles.orderBtnPrimary]}
          accessibilityRole="button"
          accessibilityLabel={a.label}
        >
          {a.pending ? (
            <ActivityIndicator size="small" color={a.primary ? "#09090B" : "#FFFFFF"} />
          ) : (
            <>
              <Icon name={a.icon} size={13} color={a.primary ? "#09090B" : "#D4D4D8"} />
              <Text style={[styles.orderBtnText, a.primary && styles.orderBtnTextPrimary]}>{a.label}</Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
};

const PortfolioTab: React.FC<Props> = ({ onSignIn, onSell, onOpenPost }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const wallet = useFractionWallet();
  const portfolio = useFractionPortfolio(wallet);
  const listings = useMyListings(wallet);
  const offers = useMyOffers(wallet);
  const openTrades = useOpenTrades(wallet);
  const cancelListing = useCancelListing();
  const cancelOffer = useCancelOffer();
  const { accept, reject } = useOfferResponse();

  if (!wallet) {
    return (
      <View style={styles.center}>
        <Icon name="Wallet" size={40} color="#3F3F46" />
        <Text style={styles.emptyText}>{t("fractions.signInToSee")}</Text>
        <Pressable onPress={onSignIn} style={styles.signIn} accessibilityRole="button">
          <Text style={styles.signInText}>{t("screens.signIn")}</Text>
        </Pressable>
      </View>
    );
  }

  const positions = portfolio.data || [];
  const totalHeld = positions.reduce((sum, p) => sum + p.balance, 0);
  const refreshing = portfolio.isRefetching;
  const refresh = () => {
    portfolio.refetch();
    listings.refetch();
    offers.refetch();
    openTrades.refetch();
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
    >
      <SettlementRail />

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.heading}>{t("fractions.yourFractions")}</Text>
          {totalHeld > 0 && (
            <Text style={styles.headingAside}>
              {totalHeld.toLocaleString()} {t("fractions.acrossPosts", { count: positions.length })}
            </Text>
          )}
        </View>
        {portfolio.isLoading ? (
          <View style={styles.loader}>
            <DeHubLoader size={48} />
          </View>
        ) : positions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="Image" size={30} color="#3F3F46" />
            <Text style={styles.emptyText}>{t("fractions.noneHeldYet")}</Text>
            <Text style={styles.emptyHint}>{t("fractions.noneHeldHint")}</Text>
          </View>
        ) : (
          <FractionPositionGrid positions={positions} onOpen={onOpenPost} onSell={onSell} />
        )}
      </View>

      {!!listings.data?.length && (
        <View style={styles.section}>
          <Text style={styles.heading}>{t("fractions.listedForSale")}</Text>
          {listings.data.map((l) => (
            <OrderRow
              key={l.id}
              title={l.post_title || t("fractions.postNumber", { id: l.token_id })}
              quantity={l.quantity - l.filled_quantity}
              price={l.price_per_fraction}
              actions={[
                {
                  label: t("fractions.cancel"),
                  icon: "X",
                  pending: cancelListing.isPending && cancelListing.variables?.listingId === l.id,
                  onPress: () =>
                    cancelListing
                      .mutateAsync({ listingId: l.id, tokenId: l.token_id })
                      .then(() => toastSuccess(t("fractions.listingCancelled")))
                      .catch((err) => toastError(err, t("fractions.cancelFailed"))),
                },
              ]}
            />
          ))}
        </View>
      )}

      {!!offers.data?.made.length && (
        <View style={styles.section}>
          <Text style={styles.heading}>{t("fractions.offersYouMade")}</Text>
          {offers.data.made.map((o) => (
            <OrderRow
              key={o.id}
              title={t("fractions.postNumber", { id: o.token_id })}
              quantity={o.quantity}
              price={o.price_per_fraction}
              actions={[
                {
                  label: t("fractions.withdraw"),
                  icon: "X",
                  pending: cancelOffer.isPending && cancelOffer.variables?.offerId === o.id,
                  onPress: () =>
                    cancelOffer
                      .mutateAsync({ offerId: o.id, tokenId: o.token_id })
                      .then(() => toastSuccess(t("fractions.offerWithdrawn")))
                      .catch((err) => toastError(err, t("fractions.withdrawFailed"))),
                },
              ]}
            />
          ))}
        </View>
      )}

      {!!offers.data?.received.length && (
        <View style={styles.section}>
          <Text style={styles.heading}>{t("fractions.offersForYourFractions")}</Text>
          {offers.data.received.map((o) => (
            <OrderRow
              key={o.id}
              title={t("fractions.postNumber", { id: o.token_id })}
              quantity={o.quantity}
              price={o.price_per_fraction}
              actions={[
                {
                  label: t("fractions.reject"),
                  icon: "X",
                  pending: reject.isPending && reject.variables?.offerId === o.id,
                  onPress: () => reject.mutate({ offerId: o.id, tokenId: o.token_id }),
                },
                {
                  label: t("fractions.acceptOffer"),
                  icon: "Send",
                  primary: true,
                  pending: accept.isPending && accept.variables?.id === o.id,
                  onPress: () => accept.mutate(o),
                },
              ]}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 22 },
  section: { gap: 8 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  heading: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  headingAside: { color: "#52525B", fontSize: 11.5 },
  loader: { alignItems: "center", paddingVertical: 32 },
  emptyBox: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32, paddingBottom: 80 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center" },
  emptyHint: { color: "#808089", fontSize: 12, textAlign: "center" },
  signIn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, backgroundColor: "#F4F4F5" },
  signInText: { color: "#09090B", fontSize: 13, fontWeight: "700" },

  order: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  orderMain: { flex: 1, minWidth: 0, gap: 3 },
  orderTitle: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  orderMeta: { color: "#A1A1AA", fontSize: 11.5 },
  orderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  orderBtnPrimary: { backgroundColor: "#F4F4F5" },
  orderBtnText: { color: "#D4D4D8", fontSize: 12, fontWeight: "600", flexShrink: 0 },
  orderBtnTextPrimary: { color: "#09090B" },
});

export default PortfolioTab;
