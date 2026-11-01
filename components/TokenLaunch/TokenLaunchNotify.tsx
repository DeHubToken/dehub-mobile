import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { KitButton, PageSection, ThemeIcon, useKitColors } from "../page/PageKit";
import { getTokenLaunchStatus, isValidLaunchEmail, joinTokenLaunch } from "../../services/token-launch.service";

/** Remembered on the device too, so a slow network never asks twice. */
const JOINED_KEY = "dehub.tokenLaunch.joined";

/**
 * Shown wherever Buy Tokens used to start a purchase: the token is launching
 * soon, and people can ask to be emailed when it does. With an email on the
 * account it is one tap; otherwise they type one.
 */
export default function TokenLaunchNotify() {
  const { t, i18n } = useTranslation();
  const c = useKitColors();
  const [joined, setJoined] = React.useState<string | null>(null);
  const [accountEmail, setAccountEmail] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await AsyncStorage.getItem(JOINED_KEY).catch(() => null);
      if (!cancelled && local) setJoined(local);
      try {
        const status = await getTokenLaunchStatus();
        if (cancelled) return;
        setAccountEmail(status?.accountEmail ?? null);
        if (status?.joined) {
          const masked = status.email || "1";
          setJoined(masked);
          AsyncStorage.setItem(JOINED_KEY, masked).catch(() => {});
        }
      } catch {
        // Offline: the email field still works.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (useAccountEmail: boolean) => {
    if (!useAccountEmail && !isValidLaunchEmail(email)) {
      setError(t("tokenLaunch.invalidEmail"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await joinTokenLaunch(useAccountEmail
        ? { useAccountEmail: true, locale: i18n.language }
        : { email: email.trim(), locale: i18n.language });
      const masked = result?.email || "1";
      setJoined(masked);
      AsyncStorage.setItem(JOINED_KEY, masked).catch(() => {});
    } catch (err: any) {
      setError(err?.code === "INVALID_EMAIL" ? t("tokenLaunch.invalidEmail") : t("tokenLaunch.failed"));
    } finally {
      setBusy(false);
    }
  };

  const radius = c.isMinimal || c.cardMaterial?.borderRadius === 0 ? 0 : 10;

  return (
    <PageSection>
      <View style={styles.wrap} testID="token-launch">
        <ThemeIcon icon="buy" size={64} style={{ marginBottom: 14 }} />
        <Text style={styles.eyebrow}>{t("tokenLaunch.eyebrow").toUpperCase()}</Text>
        <Text className="text-theme-neutrals-100" style={styles.title}>{t("tokenLaunch.title")}</Text>

        {joined ? (
          <View style={{ alignItems: "center", marginTop: 16 }} accessibilityLiveRegion="polite">
            <View style={[styles.joinedPill, { borderRadius: radius }]}>
              <Ionicons name="checkmark" size={16} color="#34D399" />
              <Text style={styles.joinedText}>{t("tokenLaunch.joinedTitle")}</Text>
            </View>
            <Text className="text-theme-neutrals-400" style={styles.body}>
              {joined.includes("@") ? t("tokenLaunch.joinedBody", { email: joined }) : t("tokenLaunch.joinedBodyNoEmail")}
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-theme-neutrals-400" style={styles.body}>{t("tokenLaunch.body")}</Text>
            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#A1A1AA" />
            ) : accountEmail ? (
              <View style={styles.form}>
                <KitButton label={busy ? "…" : t("tokenLaunch.notifyMe")} onPress={() => void submit(true)} disabled={busy} />
                <Text style={styles.small}>{t("tokenLaunch.sendTo", { email: accountEmail })}</Text>
              </View>
            ) : (
              <View style={styles.form}>
                <TextInput
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (error) setError(""); }}
                  placeholder={t("tokenLaunch.emailPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={() => void submit(false)}
                  accessibilityLabel={t("tokenLaunch.emailLabel")}
                  style={[styles.input, { borderRadius: radius, borderColor: error ? "#F87171" : "rgba(255,255,255,0.12)" }]}
                />
                <KitButton label={busy ? "…" : t("tokenLaunch.notifyMe")} onPress={() => void submit(false)} disabled={busy || !email.trim()} />
              </View>
            )}
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            <Text style={[styles.small, { marginTop: 12 }]}>{t("tokenLaunch.privacy")}</Text>
          </>
        )}
      </View>
    </PageSection>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 12 },
  eyebrow: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.4, color: "rgba(255,255,255,0.5)" },
  title: { fontSize: 19, fontWeight: "700", marginTop: 4, textAlign: "center" },
  body: { fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: "center", maxWidth: 300 },
  form: { alignSelf: "stretch", marginTop: 20, gap: 8, paddingHorizontal: 8 },
  input: { height: 44, paddingHorizontal: 12, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.06)", color: "#FFFFFF", fontSize: 15 },
  small: { fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" },
  error: { fontSize: 12.5, color: "#F87171", marginTop: 8, textAlign: "center" },
  joinedPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(16,185,129,0.15)" },
  joinedText: { color: "#34D399", fontSize: 14, fontWeight: "600" },
});
