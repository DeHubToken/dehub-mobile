/**
 * BuyUsernameSheet
 * ================
 * The handle, what it costs, what you give up, and one button.
 *
 * "What you give up" is the part that is easy to leave out and must not be:
 * buying a handle **replaces** the one you are wearing, and nobody should
 * discover that after paying. The sheet says the old name out loud, next to
 * the new one, above the button.
 *
 * The price is quoted by the server every time this opens — a listing can sit
 * in the grid for days and the seller can reprice it. Nothing here computes an
 * amount, which is the one thing web's Stores drawer had to be rewritten to
 * stop doing.
 */
import { DhbCoin } from "../common/DhbCoin";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Share } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { ShareLinks } from "../../navigation/linking.config";
import { useBuyUsername } from "../../hooks/useUsernameMarket";
import { ChainId } from "../../config/constants";
import type { UsernameListing, UsernameQuote } from "../../services/username-market.service";

interface Props {
  listing: UsernameListing | null;
  visible: boolean;
  onClose: () => void;
  isAuthed: boolean;
  onSignIn: () => void;
}

const CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "Base",
  [ChainId.BSC_MAINNET]: "BNB Chain",
};

const BuyUsernameSheet: React.FC<Props> = ({ listing, visible, onClose, isAuthed, onSignIn }) => {
  const { t } = useTranslation();
  const { getQuote, buy, stage, activeChainId, canPayHere, myAddress } = useBuyUsername();
  const [quote, setQuote] = useState<UsernameQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const isOwn = !!myAddress && myAddress === listing?.seller.address.toLowerCase();
  const listingId = listing?.id;
  // Quoting needs a DeHub token, so a signed-out browser would only get a 401.
  // They see the asking price off the card and Buy opens sign-in; the quote
  // fetches on its own once they are in, because this flips with it.
  const canQuote = visible && !!listingId && isAuthed && !isOwn;

  useEffect(() => {
    if (!canQuote) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    getQuote
      .mutateAsync(listingId!)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err: Error) => {
        if (!cancelled) setQuoteError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // getQuote is a fresh mutation object each render; keying on the listing is
    // what stops this re-firing forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, listingId]);

  if (!listing) return null;

  const busy = stage === "paying" || stage === "confirming";
  const priceDhb = quote?.priceDhb ?? listing.priceDhb;
  const priceUsd = quote?.priceUsd ?? listing.priceUsd;

  const handleBuy = async () => {
    if (!isAuthed) return onSignIn();
    if (!quote) return;
    const result = await buy.mutateAsync(quote).catch(() => null);
    if (result && !result.pending) onClose();
  };

  const handleShare = () => {
    const url = ShareLinks.usernameListing(listing.username);
    void Share.share({
      message: `${t("usernames.shareMessage", { handle: listing.username })}\n${url}`,
      url,
    });
  };

  const buttonLabel = () => {
    if (stage === "paying") return t("usernames.confirmInWallet");
    if (stage === "confirming") return t("usernames.confirmingOnChain");
    if (!isAuthed) return t("usernames.signInToBuy");
    return t("usernames.buyHandle", { handle: listing.username });
  };

  return (
    <GlassModal
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      presentation="bottom"
      dismissible={!busy}
      maxHeight="86%"
    >
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <Text style={styles.handle}>
            <Text style={styles.at}>@</Text>
            {listing.username}
          </Text>

          {!!listing.description && <Text style={styles.desc}>{listing.description}</Text>}

          {/* Price */}
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>{t("usernames.askingPrice")}</Text>
            <Text style={styles.price}>
              {priceDhb.toLocaleString("en-US")}
              <Text style={styles.priceUnit}> <DhbCoin size={14} /></Text>
            </Text>
            <Text style={styles.panelHint}>
              {t("usernames.priceHint", {
                usd: priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }),
              })}
            </Text>
          </View>

          {/* The swap, said out loud. */}
          {!!quote && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>{t("usernames.yourHandleChanges")}</Text>
              <View style={styles.swapRow}>
                <Text style={styles.swapOld} numberOfLines={1}>
                  @{quote.currentUsername || "—"}
                </Text>
                <Icon name="ArrowRight" size={14} color="#52525B" />
                <Text style={styles.swapNew} numberOfLines={1}>
                  @{quote.username}
                </Text>
              </View>
              <Text style={styles.panelHint}>{t("usernames.swapHint")}</Text>
            </View>
          )}

          {/* Network. Switching is a full re-auth on this app, so this reports
              the chain the buyer is already on rather than offering a picker. */}
          {isAuthed && (
            <View style={styles.networkRow}>
              <Icon name={canPayHere ? "Check" : "TriangleAlert"} size={14} color={canPayHere ? "#F4F4F5" : "#D4D4D8"} />
              <Text style={canPayHere ? styles.networkText : styles.networkWarn}>
                {canPayHere
                  ? t("usernames.payingOn", { chain: CHAIN_NAMES[activeChainId] || `chain ${activeChainId}` })
                  : t("usernames.wrongChain")}
              </Text>
            </View>
          )}

          {!!quoteError && <Text style={styles.error}>{quoteError}</Text>}

          {isOwn && <Text style={styles.ownNote}>{t("usernames.ownListing")}</Text>}

          <View style={styles.actions}>
            <Pressable
              onPress={handleBuy}
              disabled={isOwn || busy || (isAuthed && (!quote || !canPayHere))}
              style={[
                styles.buyBtn,
                (isOwn || busy || (isAuthed && (!quote || !canPayHere))) && styles.buyBtnDisabled,
              ]}
            >
              {busy && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.buyText}>{buttonLabel()}</Text>
            </Pressable>
            <Pressable
              onPress={handleShare}
              disabled={busy}
              style={styles.shareBtn}
              accessibilityRole="button"
              accessibilityLabel={t("usernames.shareListing")}
            >
              <Icon name="Share2" size={17} color="#E4E4E7" />
            </Pressable>
          </View>

          <View style={styles.assuranceRow}>
            <Icon name="ShieldCheck" size={13} color="#808089" />
            <Text style={styles.assurance}>{t("usernames.assurance")}</Text>
          </View>
        </ScrollView>
      </View>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 12,
  },
  body: { paddingHorizontal: 18, paddingBottom: 22, gap: 14 },

  handle: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", flexShrink: 0 },
  at: { color: "#808089" },
  desc: { color: "#D4D4D8", fontSize: 13, lineHeight: 19 },

  panel: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 5,
  },
  panelLabel: { color: "#808089", fontSize: 11, fontWeight: "600" },
  panelHint: { color: "#808089", fontSize: 11, lineHeight: 16 },
  price: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", flexShrink: 0 },
  priceUnit: { color: "#808089", fontSize: 14, fontWeight: "500" },

  swapRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  swapOld: { color: "#A1A1AA", fontSize: 14, textDecorationLine: "line-through", flexShrink: 1 },
  swapNew: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 1 },

  networkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  networkText: { color: "#A1A1AA", fontSize: 12, flex: 1 },
  networkWarn: { color: "#D4D4D8", fontSize: 12, flex: 1 },

  error: { color: "#F4F4F5", fontSize: 12.5, lineHeight: 18 },
  ownNote: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18 },

  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  buyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#F4F4F5",
  },
  shareBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buyBtnDisabled: { opacity: 0.45 },
  // The accent is near-white, so its foreground has to be the near-black —
  // white-on-white is the classic miss on this palette.
  buyText: { color: "#09090B", fontSize: 15, fontWeight: "700", flexShrink: 0 },

  assuranceRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  assurance: { flex: 1, color: "#808089", fontSize: 11, lineHeight: 16 },
});

export default BuyUsernameSheet;
