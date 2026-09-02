/**
 * SellAccountPanel
 * ================
 * List the account you are signed in as, and see what you have traded.
 *
 * Two things this has to be blunt about, because neither is guessable from a
 * price field:
 *
 * - **You are selling the whole account** — handle, posts, followers, tips
 *   history, badge entitlements. There is no picker; the form shows your own
 *   name and that is what goes on the market.
 * - **Your wallet does not sell.** DHB, staked badge balance and minted
 *   collectibles stay with your keys; after the sale the same wallet signs in
 *   to a brand-new, blank account.
 *
 * The history block is also where a buyer finishes an interrupted purchase:
 * a `failed` or `transferring` sale in `bought` carries the stored hash,
 * chain and delivery address, and Resume re-claims it until the account
 * demonstrably lives at the receiving wallet.
 */
import { DhbCoin } from "../common/DhbCoin";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { SCREEN_HEADER_HEIGHT } from "../ScreenHeader";
import {
  useAccountMarketConfig,
  useCancelAccountListing,
  useCreateAccountListing,
  useMyAccountMarket,
  useResumeAccountClaim,
} from "../../hooks/useAccountMarket";
import type { AccountSale, MyAccountListing } from "../../services/account-market.service";

interface Props {
  isAuthed: boolean;
  onSignIn: () => void;
}

const SellAccountPanel: React.FC<Props> = ({ isAuthed, onSignIn }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: config } = useAccountMarketConfig();
  const { data: mine, isLoading } = useMyAccountMarket(isAuthed);
  const createListing = useCreateAccountListing();
  const cancelListing = useCancelAccountListing();
  const resumeClaim = useResumeAccountClaim();

  const [priceDhb, setPriceDhb] = useState("");
  const [description, setDescription] = useState("");

  const active = mine?.listings.find((l) => l.status === "active");
  const history = (mine?.listings || []).filter((l) => l.status !== "active");
  // Purchases whose transfer was interrupted after payment — resumable.
  const stuck = (mine?.bought || []).filter((s) => s.status !== "completed");

  // Seed the form from an existing listing so "list" doubles as "edit".
  useEffect(() => {
    if (!active) return;
    setPriceDhb(String(active.priceDhb));
    setDescription(active.description || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!isAuthed) {
    return (
      <View style={styles.center}>
        <Icon name="IdCard" size={40} color="#3F3F46" />
        <Text style={styles.emptyText}>{t("accounts.signInToSell")}</Text>
        <Pressable onPress={onSignIn} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t("accounts.signIn")}</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const minPrice = config?.minPriceDhb ?? 1000;
  const maxPrice = config?.maxPriceDhb ?? Number.MAX_SAFE_INTEGER;
  const priceNumber = Math.floor(Number(priceDhb));
  const priceValid = Number.isFinite(priceNumber) && priceNumber >= minPrice && priceNumber <= maxPrice;
  const canSubmit = priceValid && !createListing.isPending;

  const submit = () => {
    createListing.mutate({
      priceDhb: priceNumber,
      description: description.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // The header sits above this panel, so it has to be declared here or the
      // keyboard covers the fields it is supposed to lift.
      keyboardVerticalOffset={SCREEN_HEADER_HEIGHT}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* An interrupted purchase outranks the sell form — the buyer has
            already paid and this is the button that finishes it. */}
        {stuck.map((sale) => (
          <View key={sale.id} style={styles.resumeCard}>
            <Text style={styles.resumeTitle}>
              {t("accounts.resumeTitle", { handle: sale.username })}
            </Text>
            <Text style={styles.resumeText}>
              {sale.failureReason || t("accounts.resumeBody")}
            </Text>
            <Pressable
              onPress={() =>
                resumeClaim.mutate({
                  listingId: sale.id,
                  txHash: sale.txHash,
                  chainId: sale.chainId,
                  receiveAddress: sale.receiveAddress,
                })
              }
              disabled={resumeClaim.isPending}
              style={[styles.primaryBtn, resumeClaim.isPending && styles.disabled]}
            >
              {resumeClaim.isPending && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.primaryBtnText}>{t("accounts.resumeTransfer")}</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>{t("accounts.youAreSelling")}</Text>
            <Text style={styles.currentHandle}>{t("accounts.wholeAccount")}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("accounts.askingPriceDhb")}</Text>
            <TextInput
              value={priceDhb}
              onChangeText={(v) => setPriceDhb(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder={String(minPrice)}
              placeholderTextColor="#8B8D90"
              style={styles.input}
            />
            <Text style={styles.hint}>
              {priceValid && config
                ? t("accounts.priceOk", {
                    usd: (priceNumber * config.dhbUsdPeg).toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    }),
                  })
                : t("accounts.priceRange", {
                    min: minPrice.toLocaleString("en-US"),
                    max: maxPrice.toLocaleString("en-US"),
                  })}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("accounts.pitchLabel")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={config?.maxDescriptionLength ?? 280}
              multiline
              placeholder={t("accounts.pitchPlaceholder")}
              placeholderTextColor="#8B8D90"
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.warning}>
            <Icon name="TriangleAlert" size={15} color="#D4D4D8" />
            <Text style={styles.warningText}>{t("accounts.saleFinal")}</Text>
          </View>

          <View style={styles.keepRow}>
            <Icon name="Wallet" size={13} color="#808089" />
            <Text style={styles.keepText}>{t("accounts.walletStays")}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.primaryBtn, styles.grow, !canSubmit && styles.disabled]}
            >
              {createListing.isPending && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.primaryBtnText}>
                {active ? t("accounts.updateListing") : t("accounts.listForSale")}
              </Text>
            </Pressable>
            {!!active && (
              <Pressable
                onPress={() => cancelListing.mutate(active.id)}
                disabled={cancelListing.isPending}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={t("accounts.withdrawListing")}
              >
                <Icon name="Trash2" size={17} color="#F4F4F5" />
              </Pressable>
            )}
          </View>
        </View>

        {((mine?.sold.length ?? 0) > 0 || (mine?.bought.length ?? 0) > 0 || history.length > 0) && (
          <View style={styles.historyBlock}>
            <Text style={styles.historyTitle}>{t("accounts.history")}</Text>
            {mine!.sold.map((s) => (
              <SaleRow key={s.id} sale={s} label={t("accounts.sold")} />
            ))}
            {mine!.bought
              .filter((s) => s.status === "completed")
              .map((s) => (
                <SaleRow key={s.id} sale={s} label={t("accounts.bought")} />
              ))}
            {history.map((l) => (
              <HistoryRow key={l.id} listing={l} soldLabel={t("accounts.sold")} />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const SaleRow: React.FC<{ sale: AccountSale; label: string }> = ({ sale, label }) => (
  <View style={styles.row}>
    <View style={styles.rowMain}>
      <Text style={styles.rowHandle} numberOfLines={1}>
        <Text style={styles.at}>@</Text>
        {sale.username}
      </Text>
      <Text style={styles.rowSub}>{label}</Text>
    </View>
    <Text style={styles.rowPrice}>{sale.paidDhb.toLocaleString("en-US")} <DhbCoin /></Text>
  </View>
);

const HistoryRow: React.FC<{ listing: MyAccountListing; soldLabel: string }> = ({
  listing,
  soldLabel,
}) => (
  <View style={styles.row}>
    <View style={styles.rowMain}>
      <Text style={styles.rowHandleMuted} numberOfLines={1}>
        <Text style={styles.at}>@</Text>
        {listing.username}
      </Text>
      <Text style={styles.rowSub} numberOfLines={1}>
        {listing.status === "cancelled" ? listing.cancelReason || "Withdrawn" : soldLabel}
      </Text>
    </View>
    <Text style={styles.rowPriceMuted}>{listing.priceDhb.toLocaleString("en-US")} <DhbCoin /></Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 14 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center", paddingHorizontal: 32 },

  resumeCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    gap: 10,
  },
  resumeTitle: { color: "#D4D4D8", fontSize: 14, fontWeight: "700" },
  resumeText: { color: "#D4D4D8", fontSize: 11.5, lineHeight: 17 },

  form: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 16,
  },
  field: { gap: 6 },
  fieldLabel: { color: "#808089", fontSize: 11, fontWeight: "600" },
  currentHandle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginTop: 2, flexShrink: 0 },
  at: { color: "#808089" },

  input: {
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  textArea: { minHeight: 62, textAlignVertical: "top" },
  hint: { color: "#808089", fontSize: 11, lineHeight: 16 },

  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  warningText: { flex: 1, color: "#D4D4D8", fontSize: 11.5, lineHeight: 17 },

  keepRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  keepText: { flex: 1, color: "#808089", fontSize: 11, lineHeight: 16 },

  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  disabled: { opacity: 0.45 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: "#F4F4F5",
  },
  // The accent is near-white; its foreground has to be the near-black.
  primaryBtnText: { color: "#09090B", fontSize: 14.5, fontWeight: "700", flexShrink: 0 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  historyBlock: { gap: 8 },
  historyTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowMain: { flex: 1, gap: 2 },
  rowHandle: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  rowHandleMuted: { color: "#D4D4D8", fontSize: 13.5 },
  rowSub: { color: "#808089", fontSize: 11 },
  rowPrice: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", flexShrink: 0 },
  rowPriceMuted: { color: "#808089", fontSize: 12, flexShrink: 0 },
});

export default SellAccountPanel;
