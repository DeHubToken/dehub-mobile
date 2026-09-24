/**
 * MakeOfferSheet
 * ==============
 * Name a price for a handle somebody else is wearing.
 *
 * Reached from the "somebody holds this" banner in Browse, which is the exact
 * moment the want exists: you searched for a name, it is taken, and its owner
 * never listed it. Before this there was nothing to do at that point but close
 * the app.
 *
 * The amount is **dollars**, not tokens. The marketplace prices everything in
 * fixed dollars and converts at checkout, and an offer denominated in DHB
 * would quietly be worth something different by the time it was answered.
 * The token equivalent is shown underneath, as information.
 *
 * The line this sheet must not lose is the one about nothing being spent. An
 * offer moves no money and locks no balance, and a reader who thinks otherwise
 * will not make one.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { useUsernameMarketConfig } from "../../hooks/useUsernameMarket";
import { useCreateUsernameOffer } from "../../hooks/useUsernameOffers";
import { sanitizeAmountInput } from "../../libs/amount-input";

interface Props {
  /** The handle being bid for, without the @. */
  username: string | null;
  visible: boolean;
  onClose: () => void;
  isAuthed: boolean;
  onSignIn: () => void;
}

const MakeOfferSheet: React.FC<Props> = ({ username, visible, onClose, isAuthed, onSignIn }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: config } = useUsernameMarketConfig();
  const createOffer = useCreateUsernameOffer();

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const priceUsd = Number(amount);
  const valid =
    Number.isFinite(priceUsd) &&
    priceUsd >= (config?.minPriceUsd ?? 1) &&
    priceUsd <= (config?.maxPriceUsd ?? Number.MAX_SAFE_INTEGER) &&
    Math.abs(priceUsd * 100 - Math.round(priceUsd * 100)) < 0.000001;

  // What the typed figure is worth in tokens right now. Shown, never sent.
  const offerDhb = valid && config?.dhbUsdPeg ? Math.ceil(priceUsd / config.dhbUsdPeg) : null;

  const submit = () => {
    if (!username || !valid) return;
    // The sheet closes on success only. A refusal — a price out of bounds, a
    // handle whose owner has since renamed — leaves the amount where it was
    // typed, next to the toast saying why.
    createOffer.mutate(
      { username, priceUsd, message: message.trim() || undefined },
      {
        onSuccess: () => {
          setAmount("");
          setMessage("");
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text style={styles.title}>
              {t("profile.makeOffer", { handle: username ? `@${username}` : "" })}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Icon name="X" size={18} color="#A1A1AA" />
            </Pressable>
          </View>

          <Text style={styles.blurb}>{t("profile.enterOfferAmount")}</Text>

          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(sanitizeAmountInput(v, 2))}
              placeholder="0"
              placeholderTextColor="#8B8D90"
              keyboardType="decimal-pad"
              style={styles.inputInline}
            />
            <Text style={styles.inputSuffix}>USD</Text>
          </View>

          {offerDhb !== null && (
            <View style={styles.equivalent}>
              <DhbCoin size={12} />
              <Text style={styles.hint}>
                {t("profile.offerWorthNow", {
                  amount: offerDhb.toLocaleString(undefined, { maximumFractionDigits: 0 }),
                })}
              </Text>
            </View>
          )}

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t("profile.offerNotePlaceholder")}
            placeholderTextColor="#8B8D90"
            maxLength={280}
            style={styles.input}
          />

          {/* The most important line in the sheet. Nothing is spent here. */}
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t("profile.offerCommitsNothing")}</Text>
          </View>

          {isAuthed ? (
            <Pressable
              style={[styles.primaryBtn, (!valid || createOffer.isPending) && styles.disabled]}
              disabled={!valid || createOffer.isPending}
              onPress={submit}
            >
              {createOffer.isPending && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.primaryBtnText}>{t("profile.submitOffer")}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={onSignIn}>
              <Text style={styles.primaryBtnText}>{t("usernames.signIn")}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0B0D10",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 6,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, color: "#FFFFFF", fontSize: 16.5, fontWeight: "700" },
  blurb: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputPrefix: { color: "#A1A1AA", fontSize: 15 },
  inputSuffix: { color: "#808089", fontSize: 12, fontWeight: "600" },
  inputInline: { flex: 1, color: "#FFFFFF", fontSize: 15, paddingVertical: 12, paddingHorizontal: 6 },
  input: {
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  equivalent: { flexDirection: "row", alignItems: "center", gap: 6 },
  hint: { color: "#808089", fontSize: 11.5 },

  notice: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  noticeText: { color: "#D4D4D8", fontSize: 11.5, lineHeight: 17 },

  disabled: { opacity: 0.45 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  // The accent is near-white; its foreground has to be the near-black.
  primaryBtnText: { color: "#09090B", fontSize: 14.5, fontWeight: "700" },
});

export default MakeOfferSheet;
