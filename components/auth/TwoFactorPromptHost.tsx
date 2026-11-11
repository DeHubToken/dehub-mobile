/**
 * The sign-in code step, mounted once for the whole app.
 *
 * Any login on an account with two-step sign-in on pauses in apiClient until a
 * code is accepted (libs/two-factor-login). That can happen from the sign-in
 * screen, the sign-in sheet, a wallet coming back from another app or a
 * profile switch, so the step lives beside the tree like WalletUnlockHost and
 * covers whatever started it. It is the login look: the clip wall with the
 * Riftn logo over it, the headline swapped for "One more step".
 */
import React, { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import LoginShortsStack from "./LoginShortsStack";
import TwoFactorCodeBoxes from "./TwoFactorCodeBoxes";
import { AuthButton, AuthErrorNotice, AuthTextButton, authColors, authText } from "./AuthControls";
import { useTwoFactorPrompt, type TwoFactorPrompt } from "../../libs/two-factor-login";
import { getAvatarUrl } from "../../libs/misc";
import { openInApp } from "../../libs/links.utils";

export default function TwoFactorPromptHost() {
  const prompt = useTwoFactorPrompt();
  // Keep the last prompt drawn while the sheet slides away.
  const [shown, setShown] = useState<TwoFactorPrompt | null>(prompt);
  useEffect(() => { if (prompt) setShown(prompt); }, [prompt]);

  return (
    <Modal
      visible={!!prompt}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => prompt?.cancel()}
    >
      {shown ? <TwoFactorSignIn key={String(shown.account.address ?? "")} prompt={shown} /> : null}
    </Modal>
  );
}

function TwoFactorSignIn({ prompt }: { prompt: TwoFactorPrompt }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"app" | "backup">("app");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState<number | undefined>(undefined);
  const [formHeight, setFormHeight] = useState(360);

  const ready = mode === "app" ? code.length === 6 : backupCode.replace(/[^a-z0-9]/gi, "").length >= 8;

  const submit = async (value?: string) => {
    if (busy) return;
    const appCode = value ?? code;
    if (mode === "app" ? appCode.length !== 6 : !ready) return;
    setBusy(true);
    setError(null);
    try {
      await prompt.submit(mode === "app" ? { code: appCode, trustDevice } : { backupCode: backupCode.trim(), trustDevice });
    } catch (e: any) {
      setError(e?.message || t("twoFactor.wrongCode", "That code didn’t match. Try the newest one in your app."));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const { username, displayName, avatarImageUrl } = prompt.account;
  const name = username ? `@${username}` : displayName || "";
  const avatar = avatarImageUrl ? getAvatarUrl(avatarImageUrl, 24) : null;

  return (
    <SafeAreaView className="flex-1 bg-theme-background">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        >
          <View style={{ marginBottom: 24 }}>
            <LoginShortsStack
              viewportHeight={viewport}
              reservedHeight={formHeight + 24}
              headline={{
                top: t("twoFactor.stackTop", "One more step"),
                accent: t("twoFactor.stackAccent", "Enter your app code."),
              }}
            />
          </View>

          <View style={{ gap: 14 }} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
            {!!name && (
              <View style={styles.who}>
                {avatar && avatar !== "default-avatar" ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.initial]}>
                    <Text style={styles.initialText}>{name.replace("@", "").slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={authText.body}>
                  {t("twoFactor.signingInAs", "Signing in as")} <Text style={authText.emphasis}>{name}</Text>
                </Text>
              </View>
            )}

            {mode === "app" ? (
              <TwoFactorCodeBoxes
                value={code}
                onChange={(v) => { setCode(v); setError(null); }}
                onComplete={(v) => void submit(v)}
                invalid={!!error}
                disabled={busy}
              />
            ) : (
              <TextInput
                value={backupCode}
                onChangeText={(v) => { setBackupCode(v.toUpperCase()); setError(null); }}
                placeholder="XXXXX-XXXXX"
                placeholderTextColor={authColors.placeholder}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                accessibilityLabel={t("twoFactor.backupLabel", "Backup code")}
                style={[styles.backup, error ? { borderColor: "#F87171" } : null]}
                onSubmitEditing={() => void submit()}
              />
            )}

            <AuthErrorNotice message={error} />

            <AuthButton
              variant="primary"
              label={t("twoFactor.signIn", "Sign in")}
              onPress={() => void submit()}
              loading={busy}
              disabled={busy || !ready}
            />

            <Pressable
              onPress={() => setTrustDevice((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: trustDevice }}
              style={styles.trust}
            >
              <View style={[styles.check, trustDevice && styles.checkOn]}>
                {trustDevice && <Ionicons name="checkmark" size={14} color={authColors.onPrimary} />}
              </View>
              <Text style={[authText.body, { flexShrink: 1 }]}>
                {t("twoFactor.trustDevice", "Don’t ask again on this device for 30 days")}
              </Text>
            </Pressable>

            <View style={styles.links}>
              <AuthTextButton
                label={mode === "app" ? t("twoFactor.useBackupShort", "Use a backup code") : t("twoFactor.useApp", "Use my authenticator app")}
                onPress={() => { setMode(mode === "app" ? "backup" : "app"); setError(null); }}
                tone="default"
              />
              <View style={styles.divider} />
              <AuthTextButton
                label={t("twoFactor.useAnotherShort", "Different account")}
                onPress={() => prompt.cancel()}
                tone="muted"
              />
            </View>
            <AuthTextButton
              label={t("twoFactor.lostEverything", "Lost your phone and your backup codes? Contact support")}
              onPress={() => void openInApp("https://riftn.com/support")}
              tone="muted"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  initial: { backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  initialText: { color: authColors.label, fontSize: 12, fontWeight: "700" },
  backup: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
    backgroundColor: authColors.surface,
    color: authColors.label,
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
  },
  trust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 4 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: authColors.primary, borderColor: authColors.primary },
  links: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  divider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: authColors.hairline },
});
