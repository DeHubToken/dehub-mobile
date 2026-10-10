import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * What the ticker sheet shows for $DHB while the token is not trading:
 * "Token listing soon!" and a "Notify me" button that puts the person on the
 * listing email list.
 *
 * Google and email logins are one tap — the address they sign in with is used.
 * Wallet, phone and Telegram accounts, and anyone signed out, have no usable
 * address, so for them the button opens an email field instead.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from "react-native";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs/toast";
import {
  getSignInEmail,
  isValidListingEmail,
  joinDhbListingWaitlist,
  readJoinedEmail,
  rememberJoinedEmail,
} from "../../libs/dhb-listing";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

type Step = "idle" | "ask" | "joined";

export function DhbListingSoon() {
  const { t } = useTranslation();
  const user = useUser();
  const [step, setStep] = useState<Step>("idle");
  const [joinedEmail, setJoinedEmail] = useState<string | null>(null);
  const [email, setEmail] = useSurfaceDraft("components/Home/DhbListingSoon.tsx:email", "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readJoinedEmail().then((saved) => {
      if (cancelled || !saved) return;
      setJoinedEmail(saved);
      setStep("joined");
    });
    return () => { cancelled = true; };
  }, []);

  const submit = async (address: string) => {
    setBusy(true);
    try {
      await joinDhbListingWaitlist({
        email: address,
        walletAddress: user?.walletAddress ?? null,
        username: user?.username ?? null,
      });
      const saved = address.trim().toLowerCase();
      await rememberJoinedEmail(saved);
      setJoinedEmail(saved);
      setStep("joined");
      toastSuccess(t("cashtag.listingJoined", { email: saved }));
    } catch {
      toastError(t("careers.applicationFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleNotify = async () => {
    setBusy(true);
    const signInEmail = await getSignInEmail();
    setBusy(false);
    if (signInEmail) await submit(signInEmail);
    else setStep("ask");
  };

  const handleSubmit = () => {
    if (!isValidListingEmail(email)) {
      toastError(t("loginModal.invalidEmail"));
      return;
    }
    void submit(email);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Image source={DEHUB_COIN} style={styles.coin} />
        <View style={{ flex: 1 }}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("hero.comingSoon")}</Text>
          </View>
          <Text style={styles.title}>{t("cashtag.listingTitle")}</Text>
        </View>
      </View>

      {step === "joined" ? (
        <View style={styles.joinedBox}>
          <Icon name="Check" size={16} color="#34D399" />
          <Text style={styles.joinedText}>{t("cashtag.listingJoined", { email: joinedEmail ?? "" })}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.body}>{t("cashtag.listingBody")}</Text>

          {step === "ask" && (
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("loginModal.emailPlaceholder")}
              placeholderTextColor="#6F7174"
              accessibilityLabel={t("loginModal.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              style={styles.input}
            />
          )}

          <TouchableOpacity
            onPress={step === "ask" ? handleSubmit : handleNotify}
            disabled={busy}
            style={[styles.button, busy && { opacity: 0.6 }]}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#0C0C0E" /> : <Icon name="Bell" size={16} color="#0C0C0E" />}
            <Text style={styles.buttonText}>{t("cashtag.notifyMe")}</Text>
          </TouchableOpacity>

          {step === "ask" && <Text style={styles.privacy}>{t("cashtag.listingPrivacy")}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 18 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  coin: { width: 48, height: 48, borderRadius: 24 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(52,211,153,0.15)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.3)",
  },
  badgeText: { color: "#34D399", fontSize: 11, fontWeight: "600" },
  title: { color: "#F9FBFF", fontSize: 22, fontWeight: "700", marginTop: 4 },
  body: { color: "#8B8D90", fontSize: 14, lineHeight: 20, marginTop: 14 },
  input: {
    marginTop: 14,
    color: "#F9FBFF",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  button: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  buttonText: { color: "#0C0C0E", fontSize: 15, fontWeight: "700" },
  privacy: { color: "#6F7174", fontSize: 12, marginTop: 8, textAlign: "center" },
  joinedBox: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(52,211,153,0.1)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.25)",
  },
  joinedText: { color: "#E4E4E7", fontSize: 14, lineHeight: 20, flex: 1 },
});
