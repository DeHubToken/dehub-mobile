/**
 * BuyAccountSheet
 * ===============
 * The account, what it costs, where it will be delivered, and one button.
 *
 * Delivery is the part this sheet exists for. The account does not land on
 * the wallet that pays — it lands on a VACANT wallet the buyer names, one
 * that has signed in to DeHub at least once (that is how the platform knows
 * the address is really theirs). The address is validated server-side BEFORE
 * any DHB moves, and the pay button stays dead until that check passes.
 * Paying first and validating later is the one ordering this sheet must
 * never allow. When the paying wallet is itself fresh (`selfReceivable`),
 * delivery defaults to it and the address field never appears.
 *
 * The price is quoted by the server every time this opens — a listing can sit
 * in the list for days and the seller can reprice it. Nothing here computes
 * an amount.
 */
import { DhbCoin } from "../common/DhbCoin";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Share } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { ShareLinks } from "../../navigation/linking.config";
import { useBuyAccount, useCheckReceiveAddress } from "../../hooks/useAccountMarket";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { ChainId } from "../../config/constants";
import { accountSince, compactCount } from "../../screens/AccountsScreen";
import type { AccountListing, AccountQuote, ReceiveCheck } from "../../services/account-market.service";

interface Props {
  listing: AccountListing | null;
  visible: boolean;
  onClose: () => void;
  isAuthed: boolean;
  onSignIn: () => void;
}

const CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "Base",
  [ChainId.BSC_MAINNET]: "BNB Chain",
};

const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;

const BuyAccountSheet: React.FC<Props> = ({ listing, visible, onClose, isAuthed, onSignIn }) => {
  const { t } = useTranslation();
  const { getQuote, buy, stage, activeChainId, canPayHere, myAddress } = useBuyAccount();
  const checkReceive = useCheckReceiveAddress();
  const [quote, setQuote] = useState<AccountQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [deliverToSelf, setDeliverToSelf] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState("");
  const [check, setCheck] = useState<ReceiveCheck | null>(null);

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
      setReceiveAddress("");
      setCheck(null);
      return;
    }
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    setReceiveAddress("");
    setCheck(null);
    getQuote
      .mutateAsync(listingId!)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        // A fresh, vacant paying wallet can take delivery itself; make that
        // the default so a second wallet is only asked for when it is
        // actually needed.
        setDeliverToSelf(q.selfReceivable);
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

  // Live validation of the delivery wallet, debounced so the server is not hit
  // on every keystroke of a pasted-then-corrected address.
  const debouncedAddress = useDebouncedValue(receiveAddress.trim(), 400);
  const usingSelf = deliverToSelf && !!quote?.selfReceivable;
  useEffect(() => {
    setCheck(null);
    if (!quote || usingSelf) return;
    if (!ADDRESS_SHAPE.test(debouncedAddress)) return;
    let cancelled = false;
    checkReceive
      .mutateAsync({ listingId: quote.listingId, receiveAddress: debouncedAddress })
      .then((result) => {
        if (!cancelled) setCheck(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setCheck({ receiveAddress: debouncedAddress, ok: false, problem: err.message });
      });
    return () => {
      cancelled = true;
    };
    // checkReceive is a fresh mutation object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAddress, quote?.listingId, usingSelf]);

  if (!listing) return null;

  const busy = stage === "paying" || stage === "confirming";
  const priceDhb = quote?.priceDhb ?? listing.priceDhb;
  const priceUsd = quote?.priceUsd ?? listing.priceUsd;
  const since = accountSince(listing.seller.accountCreatedAt);

  const receiveOk =
    usingSelf ||
    (!!check?.ok && check.receiveAddress.toLowerCase() === debouncedAddress.toLowerCase());
  const checking =
    !usingSelf &&
    ADDRESS_SHAPE.test(debouncedAddress) &&
    (checkReceive.isPending || (receiveAddress.trim() !== debouncedAddress && !check));

  const handleBuy = async () => {
    if (!isAuthed) return onSignIn();
    if (!quote || !receiveOk) return;
    const result = await buy
      .mutateAsync({ quote, receiveAddress: usingSelf ? undefined : debouncedAddress })
      .catch(() => null);
    if (result) onClose();
  };

  const handleShare = () => {
    const url = ShareLinks.accountListing(listing.username);
    void Share.share({
      message: `${t("accounts.shareMessage", { handle: listing.username })}\n${url}`,
      url,
    });
  };

  const buttonLabel = () => {
    if (stage === "paying") return t("accounts.confirmInWallet");
    if (stage === "confirming") return t("accounts.confirmingOnChain");
    if (!isAuthed) return t("accounts.signInToBuy");
    return t("accounts.buyAccount", { handle: listing.username });
  };

  const buyDisabled = isOwn || busy || (isAuthed && (!quote || !canPayHere || !receiveOk));

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

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.handle}>
            <Text style={styles.at}>@</Text>
            {listing.username}
          </Text>

          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Icon name="Users" size={12} color="#A1A1AA" />
              <Text style={styles.statText}>{compactCount(listing.seller.followers)}</Text>
            </View>
            <View style={styles.stat}>
              <Icon name="Upload" size={12} color="#A1A1AA" />
              <Text style={styles.statText}>{compactCount(listing.seller.uploads)}</Text>
            </View>
            {!!since && (
              <View style={styles.stat}>
                <Icon name="CalendarClock" size={12} color="#A1A1AA" />
                <Text style={styles.statText}>{t("accounts.since", { year: since })}</Text>
              </View>
            )}
          </View>

          {!!listing.description && <Text style={styles.desc}>{listing.description}</Text>}

          {/* Price */}
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>{t("accounts.askingPrice")}</Text>
            <Text style={styles.price}>
              {priceDhb.toLocaleString("en-US")}
              <Text style={styles.priceUnit}> <DhbCoin size={14} /></Text>
            </Text>
            <Text style={styles.panelHint}>
              {t("accounts.priceHint", {
                usd: priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }),
              })}
            </Text>
          </View>

          {/* Delivery — the account lands on a vacant wallet, not on the one
              that pays. Said out loud, validated before any money moves. */}
          {!!quote && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>{t("accounts.deliveryLabel")}</Text>
              {usingSelf ? (
                <>
                  <View style={styles.deliverRow}>
                    <Icon name="Check" size={14} color="#34D399" />
                    <Text style={styles.deliverOkText}>{t("accounts.deliverToSelf")}</Text>
                  </View>
                  <Pressable onPress={() => setDeliverToSelf(false)} hitSlop={6}>
                    <Text style={styles.deliverSwitch}>{t("accounts.useAnotherWallet")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.panelHint}>{t("accounts.deliveryExplainer")}</Text>
                  <TextInput
                    value={receiveAddress}
                    onChangeText={setReceiveAddress}
                    placeholder="0x…"
                    placeholderTextColor="#8B8D90"
                    style={styles.addressInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                  {checking ? (
                    <View style={styles.deliverRow}>
                      <ActivityIndicator size="small" color="#A1A1AA" />
                      <Text style={styles.panelHint}>{t("accounts.checkingWallet")}</Text>
                    </View>
                  ) : check ? (
                    <View style={styles.deliverRow}>
                      <Icon name={check.ok ? "Check" : "X"} size={14} color={check.ok ? "#34D399" : "#F87171"} />
                      <Text style={check.ok ? styles.deliverOkText : styles.deliverBadText}>
                        {check.ok ? t("accounts.walletOk") : check.problem}
                      </Text>
                    </View>
                  ) : null}
                  {!!quote.selfReceivable && (
                    <Pressable onPress={() => setDeliverToSelf(true)} hitSlop={6}>
                      <Text style={styles.deliverSwitch}>{t("accounts.deliverHereInstead")}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}

          {/* Network. Switching is a full re-auth on this app, so this reports
              the chain the buyer is already on rather than offering a picker. */}
          {isAuthed && (
            <View style={styles.networkRow}>
              <Icon name={canPayHere ? "Check" : "TriangleAlert"} size={14} color={canPayHere ? "#34D399" : "#FBBF24"} />
              <Text style={canPayHere ? styles.networkText : styles.networkWarn}>
                {canPayHere
                  ? t("accounts.payingOn", { chain: CHAIN_NAMES[activeChainId] || `chain ${activeChainId}` })
                  : t("accounts.wrongChain")}
              </Text>
            </View>
          )}

          {!!quoteError && <Text style={styles.error}>{quoteError}</Text>}

          {isOwn && <Text style={styles.ownNote}>{t("accounts.ownListing")}</Text>}

          <View style={styles.actions}>
            <Pressable
              onPress={handleBuy}
              disabled={buyDisabled}
              style={[styles.buyBtn, buyDisabled && styles.buyBtnDisabled]}
            >
              {busy && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.buyText}>{buttonLabel()}</Text>
            </Pressable>
            <Pressable
              onPress={handleShare}
              disabled={busy}
              style={styles.shareBtn}
              accessibilityRole="button"
              accessibilityLabel={t("accounts.shareListing")}
            >
              <Icon name="Share2" size={17} color="#E4E4E7" />
            </Pressable>
          </View>

          <View style={styles.assuranceRow}>
            <Icon name="ShieldCheck" size={13} color="#71717A" />
            <Text style={styles.assurance}>{t("accounts.assurance")}</Text>
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
  at: { color: "#71717A" },
  desc: { color: "#D4D4D8", fontSize: 13, lineHeight: 19 },

  statRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stat: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", flexShrink: 0 },

  panel: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  panelLabel: { color: "#71717A", fontSize: 11, fontWeight: "600" },
  panelHint: { color: "#71717A", fontSize: 11, lineHeight: 16, flexShrink: 1 },
  price: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", flexShrink: 0 },
  priceUnit: { color: "#71717A", fontSize: 14, fontWeight: "500" },

  addressInput: {
    color: "#FFFFFF",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  deliverRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  deliverOkText: { flex: 1, color: "#D1FAE5", fontSize: 12, lineHeight: 17 },
  deliverBadText: { flex: 1, color: "#FCA5A5", fontSize: 12, lineHeight: 17 },
  deliverSwitch: { color: "#A1A1AA", fontSize: 12, textDecorationLine: "underline" },

  networkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  networkText: { color: "#A1A1AA", fontSize: 12, flex: 1 },
  networkWarn: { color: "#FDE68A", fontSize: 12, flex: 1 },

  error: { color: "#FCA5A5", fontSize: 12.5, lineHeight: 18 },
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
  assurance: { flex: 1, color: "#71717A", fontSize: 11, lineHeight: 16 },
});

export default BuyAccountSheet;
