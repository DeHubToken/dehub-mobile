import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import {
  AUTH_CONTROL_HEIGHT,
  AUTH_RADIUS,
  AuthButton,
  AuthErrorNotice,
  AuthField,
  AuthTextButton,
  authColors,
  authText,
} from "./AuthControls";
import { WEBSITE_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";
import { startLegacyMigration, type LegacyProvider } from "../../libs/legacy-web3auth";
import { createLogger } from "../../libs/logger";
import type { LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";

const log = createLogger("LegacyAccountWarningModal");

export interface LegacyAccountWarningModalProps {
  visible: boolean;
  accounts: LegacyAccountMatch[];
  /** Native recovery succeeded — hand the raw private key to the caller. */
  onRecovered: (privateKey: string, label?: string) => void;
  /** User chose to proceed with a brand-new wallet anyway. */
  onCreateAnyway: () => void;
  onClose: () => void;
}

const PROVIDERS: { key: LegacyProvider; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "discord", label: "Discord" },
];

/**
 * Gate shown instead of silently creating a wallet when this Supabase
 * identity's email matches a pre-migration (Web3Auth-era) DeHub account.
 *
 * Mirrors dehubweb's "Switch to a different old account" (WalletRecoveryTools
 * -> SwitchOldAccountDialog): sign in with the OLD login once, reconstruct
 * that account's private key on-device (Sapphire DKG — the key never touches
 * our servers, see libs/legacy-web3auth.ts), then hand it to the same
 * switch-account flow already used for the cloud/backend-link mismatch case.
 * "Recover on dehub.io" stays as a fallback if native extraction fails for a
 * given provider.
 */
const LegacyAccountWarningModal: React.FC<LegacyAccountWarningModalProps> = ({
  visible,
  accounts,
  onRecovered,
  onCreateAnyway,
  onClose,
}) => {
  const [busyProvider, setBusyProvider] = useState<LegacyProvider | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accountFor = useCallback(
    (provider: string) => accounts.find((a) => a.signupMethod === provider),
    [accounts]
  );

  const emailAccount = useMemo(
    () => accountFor("email") ?? accountFor("email_passwordless"),
    [accountFor]
  );

  const reset = useCallback(() => {
    setBusyProvider(null);
    setEmail("");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (busyProvider) return;
    reset();
    onClose();
  }, [busyProvider, onClose, reset]);

  const handleProviderPress = useCallback(
    async (provider: LegacyProvider, loginHint?: string) => {
      if (busyProvider) return;
      setError(null);
      setBusyProvider(provider);
      try {
        const privateKey = await startLegacyMigration(provider, loginHint);
        const known = accountFor(provider === "email_passwordless" ? "email_passwordless" : provider) ?? accountFor("email");
        reset();
        onRecovered(privateKey, known?.username ? `@${known.username}` : undefined);
      } catch (e: any) {
        log.error("recover:error", { provider, message: e?.message });
        setError(
          e?.message ||
            "Could not retrieve that old wallet on this device. You can still recover it on dehub.io below."
        );
        setBusyProvider(null);
      }
    },
    [busyProvider, accountFor, reset, onRecovered]
  );

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="bottom" blurIntensity={50} maxHeight="88%">
      <ScrollView className="px-6 pt-6 pb-8" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.titleRow}>
          <Ionicons name="warning-outline" size={22} color={authColors.label} />
          <Text style={authText.modalTitle}>Existing account found</Text>
        </View>
        <Text style={[authText.body, { marginBottom: 16 }]}>
          This login is linked to an older DeHub account. Creating a new wallet here will NOT
          recover it — you'd end up with a separate, empty account instead.
        </Text>

        <View style={styles.accountCard}>
          {accounts.map((a, i) => (
            <View key={i} style={styles.accountRow}>
              <Text style={styles.accountName}>
                {a.username ? `@${a.username}` : "Unnamed account"}
                {a.signupMethod ? ` · ${a.signupMethod}` : ""}
              </Text>
              {typeof a.badgeBalance === "number" && (
                <Text style={authText.caption}>{a.badgeBalance.toLocaleString()} DHB</Text>
              )}
            </View>
          ))}
        </View>

        <Text style={[authText.body, { marginTop: 16, marginBottom: 12 }]}>
          Sign in with the OLD login for the account you want back — this reconstructs its wallet
          right here on your phone:
        </Text>

        {busyProvider ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={authColors.label} />
            <Text style={authText.body}>Retrieving old wallet…</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {PROVIDERS.map(({ key, label }) => {
              const known = accountFor(key);
              // A known match is marked with a filled chip rather than a green
              // border — the design system is monochrome, and colour alone is
              // not an accessible signal anyway.
              return (
                <AuthButton
                  key={key}
                  align="start"
                  label={`Old account: ${label}`}
                  onPress={() => handleProviderPress(key)}
                  disabled={!!busyProvider}
                  style={known ? styles.matchedButton : undefined}
                  accessibilityLabel={
                    known
                      ? `Recover old ${label} account${known.username ? ` @${known.username}` : ""}`
                      : `Recover old ${label} account`
                  }
                  trailing={
                    known ? (
                      <View style={styles.matchChip}>
                        <Ionicons name="checkmark" size={12} color={authColors.onPrimary} />
                        <Text style={styles.matchChipLabel} numberOfLines={1}>
                          {known.username ? `@${known.username}` : "Found"}
                          {typeof known.badgeBalance === "number"
                            ? ` · ${known.badgeBalance.toLocaleString()} DHB`
                            : ""}
                        </Text>
                      </View>
                    ) : null
                  }
                />
              );
            })}
            <View style={styles.emailRow}>
              <AuthField
                containerStyle={{ flex: 1 }}
                value={email}
                onChangeText={setEmail}
                placeholder="Old account email"
                accessibilityLabel="Old account email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <AuthButton
                label="Recover"
                icon="arrow-forward-outline"
                onPress={() => handleProviderPress("email_passwordless", email)}
                disabled={!!busyProvider || !email}
                accessibilityLabel="Recover old account from this email"
                style={styles.emailSubmit}
              />
            </View>
            {emailAccount && (
              <Text style={[authText.caption, { paddingHorizontal: 4 }]}>
                Match found:{" "}
                {emailAccount.username ? `@${emailAccount.username}` : "this email"}
                {typeof emailAccount.badgeBalance === "number"
                  ? ` · ${emailAccount.badgeBalance.toLocaleString()} DHB`
                  : ""}
              </Text>
            )}
          </View>
        )}

        <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

        <Text style={[authText.caption, { marginTop: 16, marginBottom: 12 }]}>
          Provider not working, or Twitter/Discord/email not shown above? Recover it on the
          website instead.
        </Text>
        <AuthButton
          icon="open-outline"
          label="Recover on dehub.io"
          onPress={() => openInApp(WEBSITE_LINK)}
          disabled={!!busyProvider}
        />

        <AuthTextButton
          label="I don't want that account — create a new one anyway"
          onPress={onCreateAnyway}
          disabled={!!busyProvider}
          style={{ marginTop: 16 }}
        />
        <AuthTextButton label="Cancel" onPress={handleClose} disabled={!!busyProvider} />
      </ScrollView>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  accountCard: {
    gap: 8,
    padding: 12,
    borderRadius: AUTH_RADIUS,
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  accountName: {
    color: authColors.label,
    fontSize: 14,
    flexShrink: 1,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  matchedButton: {
    borderColor: "rgba(255,255,255,0.45)",
  },
  matchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "50%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: authColors.primary,
  },
  matchChipLabel: {
    color: authColors.onPrimary,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emailSubmit: {
    width: "auto",
    minHeight: AUTH_CONTROL_HEIGHT,
    paddingHorizontal: 14,
  },
});

export default LegacyAccountWarningModal;
