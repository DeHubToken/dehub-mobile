/**
 * SellUsernamePanel
 * =================
 * List one of the usernames you own, and see what you have traded.
 *
 * Which one you picked changes what this form even asks for, and that is the
 * whole shape of the panel:
 *
 * - **Selling the handle you are wearing** means moving out of it, so you have
 *   to say where you are going. The replacement is chosen here, while you are
 *   sitting in front of it, rather than being invented for you at the moment
 *   somebody pays — and it is checked against the same rules the profile editor
 *   enforces, so a listing can never promise a swap that fails.
 * - **Selling a name you hold** asks none of that. You are not living in it, so
 *   a sale never touches your profile; the form drops to a price and a pitch.
 *
 * The picker only appears once there is something to pick between. An account
 * that has never bought a handle owns exactly one.
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
} from "react-native";
import { DeHubLoader } from "../DeHubLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { SCREEN_HEADER_HEIGHT } from "../ScreenHeader";
import {
  useCancelUsernameListing,
  useCreateUsernameListing,
  useMyUsernameMarket,
  useUsernameMarketConfig,
} from "../../hooks/useUsernameMarket";
import type { MyUsernameListing, UsernameSale } from "../../services/username-market.service";

interface Props {
  isAuthed: boolean;
  onSignIn: () => void;
  /** Which owned name to open on. Null means the handle being worn. */
  username?: string | null;
  onUsernameChange?: (username: string) => void;
}

const SellUsernamePanel: React.FC<Props> = ({
  isAuthed,
  onSignIn,
  username: selectedUsername,
  onUsernameChange,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: config } = useUsernameMarketConfig();
  const { data: mine, isLoading } = useMyUsernameMarket(isAuthed);
  const createListing = useCreateUsernameListing();
  const cancelListing = useCancelUsernameListing();

  const [priceUsd, setPriceUsd] = useState("");
  const [replacement, setReplacement] = useState("");
  const [description, setDescription] = useState("");

  // Which of their names is on the form. The caller's choice wins; otherwise
  // the handle they are wearing, which is what this panel used to assume was
  // the only possibility.
  const held = mine?.held || [];
  const subject =
    held.find((h) => h.username === selectedUsername) || held.find((h) => h.active) || null;
  const sellingUsername = subject?.username || mine?.currentUsername || "";
  const fromVault = !!subject && !subject.active;

  const active = mine?.listings.find(
    (l) => l.status === "active" && l.username === sellingUsername,
  );
  const history = (mine?.listings || []).filter((l) => l.status !== "active");

  // Seed the form from an existing listing so "list" doubles as "edit", and
  // clear it when switching to a name that has none — otherwise the previous
  // name's price sits in the box looking like this one's.
  useEffect(() => {
    setPriceUsd(active ? String(active.priceUsd) : "");
    setReplacement(active?.replacementUsername || "");
    setDescription(active?.description || "");
  }, [active?.id, sellingUsername]);

  if (!isAuthed) {
    return (
      <View style={styles.center}>
        <Icon name="AtSign" size={40} color="#3F3F46" />
        <Text style={styles.emptyText}>{t("usernames.signInToSell")}</Text>
        <Pressable onPress={onSignIn} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t("usernames.signIn")}</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <DeHubLoader size={56} />
      </View>
    );
  }

  if (!mine?.currentUsername) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t("usernames.needUsername")}</Text>
      </View>
    );
  }

  const minPrice = config?.minPriceUsd ?? 1;
  const maxPrice = config?.maxPriceUsd ?? Number.MAX_SAFE_INTEGER;
  const priceNumber = Number(priceUsd);
  const priceValid = Number.isFinite(priceNumber) && Math.abs(priceNumber * 100 - Math.round(priceNumber * 100)) < 0.000001 && priceNumber >= minPrice && priceNumber <= maxPrice;
  // A replacement is only part of the deal when the seller is moving out of the
  // name. Requiring one for a vault sale would be asking them to rename
  // themselves to complete a trade that has nothing to do with their profile.
  const replacementValid =
    fromVault || /^[a-z0-9_-]{1,30}$/.test(replacement.trim().toLowerCase());
  const canSubmit = !!config && config.dhbUsdPeg > 0 && priceValid && replacementValid && !createListing.isPending;

  const submit = () => {
    createListing.mutate({
      username: sellingUsername,
      priceUsd: priceNumber,
      replacementUsername: fromVault ? undefined : replacement.trim().toLowerCase(),
      description: description.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
      // The header sits above this panel, so it has to be declared here or the
      // keyboard covers the fields it is supposed to lift.
      keyboardVerticalOffset={SCREEN_HEADER_HEIGHT}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>{t("usernames.youAreSelling")}</Text>
            <Text style={styles.currentHandle}>
              <Text style={styles.at}>@</Text>
              {sellingUsername}
            </Text>
            <Text style={styles.hint}>
              {t(fromVault ? "usernames.sellingHeldName" : "usernames.sellingWornName")}
            </Text>
          </View>

          {/* Only worth showing once there is a choice. Most accounts own one
              name and a picker of one option is furniture. */}
          {held.length > 1 && (
            <View style={styles.picker}>
              {held.map((holding) => (
                <Pressable
                  key={holding.username}
                  onPress={() => onUsernameChange?.(holding.username)}
                  style={[
                    styles.pickerChip,
                    holding.username === sellingUsername && styles.pickerChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      holding.username === sellingUsername && styles.pickerChipTextActive,
                    ]}
                  >
                    @{holding.username}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("usernames.askingPriceUsd", "Asking price (USD)")}</Text>
            <TextInput
              value={priceUsd}
              onChangeText={(v) => setPriceUsd(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder={String(minPrice)}
              placeholderTextColor="#8B8D90"
              style={styles.input}
            />
            <Text style={styles.hint}>
              {priceValid && config && config.dhbUsdPeg > 0 ? <>
                ≈ <DhbCoin /> {(Math.ceil(priceNumber / config.dhbUsdPeg * 1e6) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                {' · '}{t('usernames.fixedDollarPrice', 'Dollar price stays fixed; token amount updates.')}
              </> : t('usernames.dollarPriceRange', 'Enter $1–$1,000,000, with up to two decimal places.')}
            </Text>
          </View>

          {/* Where the seller lands. Only for the handle they are wearing — a
              vault sale leaves their profile exactly where it is. */}
          {!fromVault && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t("usernames.newHandleLabel")}</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>@</Text>
                <TextInput
                  value={replacement}
                  onChangeText={(v) => setReplacement(v.replace(/[^A-Za-z0-9_-]/g, "").toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  maxLength={config?.usernameMaxLength ?? 30}
                  placeholder={`${mine.currentUsername}_2`.slice(0, 30)}
                  placeholderTextColor="#8B8D90"
                  style={styles.inputInline}
                />
              </View>
              <Text style={styles.hint}>
                {t("usernames.newHandleHint", { handle: replacement || "…" })}
              </Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("usernames.pitchLabel")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={config?.maxDescriptionLength ?? 280}
              multiline
              placeholder={t("usernames.pitchPlaceholder")}
              placeholderTextColor="#8B8D90"
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.warning}>
            <Icon name="TriangleAlert" size={15} color="#D4D4D8" />
            <Text style={styles.warningText}>
              {t(fromVault ? "usernames.saleFinalHeld" : "usernames.saleFinal")}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.primaryBtn, styles.grow, !canSubmit && styles.disabled]}
            >
              {createListing.isPending && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.primaryBtnText}>
                {active ? t("usernames.updateListing") : t("usernames.listForSale")}
              </Text>
            </Pressable>
            {!!active && (
              <Pressable
                onPress={() => cancelListing.mutate(active.id)}
                disabled={cancelListing.isPending}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={t("usernames.withdrawListing")}
              >
                <Icon name="Trash2" size={17} color="#F4F4F5" />
              </Pressable>
            )}
          </View>
        </View>

        {!!active && !active.live && (
          <View style={styles.staleNotice}>
            <Text style={styles.staleText}>
              {t("usernames.staleListing", {
                listed: active.username,
                current: mine.currentUsername,
              })}
            </Text>
          </View>
        )}

        {(mine.sold.length > 0 || mine.bought.length > 0 || history.length > 0) && (
          <View style={styles.historyBlock}>
            <Text style={styles.historyTitle}>{t("usernames.history")}</Text>
            {mine.sold.map((s) => (
              <SaleRow key={s.id} sale={s} label={t("usernames.sold")} />
            ))}
            {mine.bought.map((s) => (
              <SaleRow key={s.id} sale={s} label={t("usernames.bought")} />
            ))}
            {history.map((l) => (
              <HistoryRow key={l.id} listing={l} soldLabel={t("usernames.sold")} />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const SaleRow: React.FC<{ sale: UsernameSale; label: string }> = ({ sale, label }) => (
  <View style={styles.row}>
    <View style={styles.rowMain}>
      <Text style={styles.rowHandle} numberOfLines={1}>
        <Text style={styles.at}>@</Text>
        {sale.username}
      </Text>
      <Text style={styles.rowSub}>{label}</Text>
    </View>
    <Text style={styles.rowPrice}>${sale.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{"\n"}<DhbCoin /> {sale.paidDhb.toLocaleString("en-US")}</Text>
  </View>
);

const HistoryRow: React.FC<{ listing: MyUsernameListing; soldLabel: string }> = ({
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
    <Text style={styles.rowPriceMuted}>${listing.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{"\n"}<DhbCoin /> {listing.priceDhb.toLocaleString("en-US")}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 14 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center", paddingHorizontal: 32 },

  form: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 16,
  },
  field: { gap: 6 },
  picker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pickerChipActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  pickerChipText: { color: "#A1A1AA", fontSize: 12 },
  pickerChipTextActive: { color: "#FFFFFF", fontWeight: "600" },
  fieldLabel: { color: "#808089", fontSize: 11, fontWeight: "600" },
  currentHandle: { color: "#FFFFFF", fontSize: 21, fontWeight: "700", marginTop: 2, flexShrink: 0 },
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputPrefix: { color: "#808089", fontSize: 14 },
  inputInline: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 10, paddingLeft: 2 },
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
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  // The accent is near-white; its foreground has to be the near-black.
  primaryBtnText: { color: "#09090B", fontSize: 14.5, fontWeight: "700", flexShrink: 0 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  staleNotice: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  staleText: { color: "#D4D4D8", fontSize: 11.5, lineHeight: 17 },

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

export default SellUsernamePanel;
