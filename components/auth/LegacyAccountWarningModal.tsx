import { DhbCoin } from "../common/DhbCoin";
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
import { useTranslation } from "react-i18next";
import type { LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
import {
  legacyAccountsForProvider,
  matchRecoveredLegacyAccount,
} from "../../libs/wallet-core/legacy-match";
import { predictSafeAddress } from "../../libs/wallet-core/predict-safe-address";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";

const log = createLogger("LegacyAccountWarningModal");

export interface LegacyAccountWarningModalProps {
  visible: boolean;
  accounts: LegacyAccountMatch[];
  /** Native recovery succeeded — hand the raw private key to the caller. */
  onRecovered: (privateKey: string, account: LegacyAccountMatch) => void;
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

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  twitter: "X (Twitter)",
  discord: "Discord",
  email: "Email",
  email_passwordless: "Email",
  sms: "Phone (SMS)",
  sms_passwordless: "Phone (SMS)",
  phone: "Phone (SMS)",
};

function providerLabel(method?: string): string | null {
  if (!method) return null;
  return PROVIDER_LABELS[method.trim().toLowerCase()] ?? method;
}

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
  const { t } = useTranslation();
  const [busyProvider, setBusyProvider] = useState<LegacyProvider | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const uniqueAccountFor = useCallback(
    (provider: string) => {
      const matches = legacyAccountsForProvider(accounts, provider);
      return matches.length === 1 ? matches[0] : undefined;
    },
    [accounts]
  );

  const emailAccount = useMemo(
    () => uniqueAccountFor("email_passwordless"),
    [uniqueAccountFor]
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
        const ownerAddress = deriveAddressFromPrivateKey(privateKey);
        if (!ownerAddress) {
          throw new Error(t("legacy.couldNotRead"));
        }
        const safeAddress = await predictSafeAddress(ownerAddress);
        const matched = matchRecoveredLegacyAccount(
          accounts,
          provider,
          ownerAddress,
          safeAddress,
        );
        if (!matched) {
          throw new Error(
            accounts.length > 1
              ? t("legacy.didNotRecoverEither")
              : t("legacy.didNotRecoverThis")
          );
        }
        reset();
        onRecovered(privateKey, matched);
      } catch (e: any) {
        log.error("recover:error", { provider, message: e?.message });
        setError(
          e?.message || t("legacy.couldNotRetrieve")
        );
        setBusyProvider(null);
      }
    },
    [busyProvider, accounts, reset, onRecovered, t]
  );

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="bottom" blurIntensity={50} maxHeight="88%">
      <ScrollView className="px-6 pt-6 pb-8" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.titleRow}>
          <Ionicons name="warning-outline" size={22} color={authColors.label} />
          <Text style={authText.modalTitle}>
            {accounts.length > 1
              ? t("legacy.chooseAccount")
              : t("legacy.recoverYourAccount")}
          </Text>
        </View>
        <Text style={[authText.body, { marginBottom: 16 }]}>
          {accounts.length > 1
            ? t("legacy.foundMany", { count: accounts.length })
            : t("legacy.foundOne")}
        </Text>

        <View style={styles.accountCard}>
          {accounts.map((a, i) => (
            <View key={a.ethAddress || i} style={styles.accountRow}>
              <View style={styles.accountHeading}>
                <Text style={styles.accountName}>
                  {a.username ? `@${a.username}` : t("legacy.olderProfile", { n: i + 1 })}
                </Text>
                {typeof a.badgeBalance === "number" && (
                  <Text style={authText.caption}>{a.badgeBalance.toLocaleString()} <DhbCoin /></Text>
                )}
              </View>
              <Text style={authText.caption}>
                {providerLabel(a.signupMethod)
                  ? t("legacy.originalSignIn", { method: providerLabel(a.signupMethod) })
                  : t("legacy.originalSignInUnknown")}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[authText.body, { marginTop: 16, marginBottom: 12 }]}>
          {t("legacy.useOriginalSignIn")}
        </Text>

        {busyProvider ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={authColors.label} />
            <Text style={authText.body}>{t("legacy.retrieving")}</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {PROVIDERS.map(({ key, label }) => {
              const known = uniqueAccountFor(key);
              // A known match is marked with a filled chip rather than a green
              // border — the design system is monochrome, and colour alone is
              // not an accessible signal anyway.
              return (
                <AuthButton
                  key={key}
                  align="start"
                  label={
                    known?.username
                      ? t("legacy.providerForUser", { provider: label, name: known.username })
                      : t("legacy.tryProvider", { provider: label })
                  }
                  onPress={() => handleProviderPress(key)}
                  disabled={!!busyProvider}
                  style={known ? styles.matchedButton : undefined}
                  accessibilityLabel={
                    known?.username
                      ? t("legacy.recoverOldNamed", { provider: label, name: known.username })
                      : t("legacy.recoverOldAccount", { provider: label })
                  }
                  trailing={
                    known ? (
                      <View style={styles.matchChip}>
                        <Ionicons name="checkmark" size={12} color={authColors.onPrimary} />
                        <Text style={styles.matchChipLabel} numberOfLines={1}>
                          {typeof known.badgeBalance === "number"
                            ? t("legacy.matchedWithBalance", {
                                balance: known.badgeBalance.toLocaleString(),
                              })
                            : t("legacy.matched")}
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
                label={
                  emailAccount?.username
                    ? t("legacy.emailFor", { name: emailAccount.username })
                    : t("legacy.oldAccountEmail")
                }
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                accessibilityLabel={t("legacy.oldAccountEmail")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <AuthButton
                label={t("legacy.recover")}
                icon="arrow-forward-outline"
                onPress={() => handleProviderPress("email_passwordless", email)}
                disabled={!!busyProvider || !email}
                accessibilityLabel={t("legacy.recoverFromEmailA11y")}
                style={styles.emailSubmit}
              />
            </View>
            {emailAccount && (
              <Text style={[authText.caption, { paddingHorizontal: 4 }]}>
                {t("legacy.thisEmailRecovers", {
                  target: emailAccount.username
                    ? `@${emailAccount.username}`
                    : t("legacy.matchedProfile"),
                })}
                {typeof emailAccount.badgeBalance === "number"
                  ? `, ${emailAccount.badgeBalance.toLocaleString()} DHB`
                  : ""}
              </Text>
            )}
          </View>
        )}

        <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

        <Text style={[authText.caption, { marginTop: 16, marginBottom: 12 }]}>
          {t("legacy.providerNotWorking")}
        </Text>
        <AuthButton
          icon="open-outline"
          label={t("legacy.recoverOnWebsite")}
          onPress={() => openInApp(WEBSITE_LINK)}
          disabled={!!busyProvider}
        />

        <AuthTextButton
          label={t("legacy.createNewAnyway")}
          onPress={onCreateAnyway}
          disabled={!!busyProvider}
          style={{ marginTop: 16 }}
        />
        <AuthTextButton label={t("common.cancel")} onPress={handleClose} disabled={!!busyProvider} />
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
    gap: 4,
    paddingVertical: 2,
  },
  accountHeading: {
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
    alignItems: "flex-end",
    gap: 8,
  },
  emailSubmit: {
    width: "auto",
    minHeight: AUTH_CONTROL_HEIGHT,
    paddingHorizontal: 14,
  },
});

export default LegacyAccountWarningModal;
