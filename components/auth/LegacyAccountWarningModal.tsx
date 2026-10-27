import { DhbCoin } from "../common/DhbCoin";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { isSignInCancelled, serverAuthText } from "../../libs/auth-error-text";
import { useTranslation } from "react-i18next";
import type { LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
import {
  legacyAccountsForProvider,
  matchRecoveredLegacyAccount,
} from "../../libs/wallet-core/legacy-match";
import { normalisePhoneHint } from "../../libs/wallet-core/phone-hint";
import { predictSafeAddress } from "../../libs/wallet-core/predict-safe-address";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";

const log = createLogger("LegacyAccountWarningModal");

export interface LegacyAccountWarningModalProps {
  visible: boolean;
  accounts: LegacyAccountMatch[];
  /**
   * The verified email the old accounts were matched on. Pre-fills the email
   * recovery, which only works with the exact address the old profile used.
   */
  email?: string;
  /** Native recovery succeeded — hand the raw private key to the caller. */
  onRecovered: (privateKey: string, account: LegacyAccountMatch) => void;
  /** User chose to proceed with a brand-new wallet anyway. */
  onCreateAnyway: () => void;
  onClose: () => void;
}

type SocialProvider = "google" | "apple" | "twitter" | "discord";

// Brand names stay as they are in every language. These went through the
// copy table once and came back as "Elma" (Turkish for the fruit) and worse.
const PROVIDERS: { key: SocialProvider; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "google", label: "Google", icon: "logo-google" },
  { key: "apple", label: "Apple", icon: "logo-apple" },
  { key: "twitter", label: "X (Twitter)", icon: "logo-x" },
  { key: "discord", label: "Discord", icon: "logo-discord" },
];

/** The old login an account was made with, in the shape the buttons use. */
type OldLogin = SocialProvider | "email" | "sms";

function oldLoginOf(method?: string): OldLogin | null {
  const m = method?.trim().toLowerCase();
  if (!m) return null;
  if (m === "email" || m === "email_passwordless") return "email";
  if (m === "sms" || m === "sms_passwordless" || m === "phone") return "sms";
  return PROVIDERS.some((p) => p.key === m) ? (m as SocialProvider) : null;
}

/**
 * The one old login every listed account was made with, when there is
 * exactly one. Web3Auth keys are per login, so that login is the only one
 * that can open these profiles; anything else derives a different wallet.
 */
function sharedOldLogin(accounts: LegacyAccountMatch[]): OldLogin | null {
  const logins = new Set(accounts.map((a) => oldLoginOf(a.signupMethod)));
  if (logins.size !== 1 || logins.has(null)) return null;
  return [...logins][0];
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
 *
 * When the old login is known it is the only thing offered up front. The
 * sheet used to list every provider plus an email box pre-filled from a draft,
 * and people who had just signed in with an email code naturally used the
 * email box — which can never open a profile made with Google. They got a
 * second code, then "recovered a different wallet", and went round again.
 */
const LegacyAccountWarningModal: React.FC<LegacyAccountWarningModalProps> = ({
  visible,
  accounts,
  email: knownEmail,
  onRecovered,
  onCreateAnyway,
  onClose,
}) => {
  const { t } = useTranslation();
  const [busyProvider, setBusyProvider] = useState<LegacyProvider | null>(null);
  const [email, setEmail] = useState(knownEmail ?? "");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const lead = useMemo(() => sharedOldLogin(accounts), [accounts]);
  const leadLabel = lead === "email"
    ? t("legacy.methodEmail", "an email code")
    : lead === "sms"
      ? t("legacy.methodPhone", "a phone number")
      : PROVIDERS.find((p) => p.key === lead)?.label;
  const single = accounts.length === 1 ? accounts[0] : undefined;
  const name = single?.username;

  // Each time the sheet opens it starts from the known old login again.
  useEffect(() => {
    if (!visible) return;
    setEmail(knownEmail ?? "");
    setPhone("");
    setError(null);
    setShowAll(false);
  }, [visible, knownEmail]);

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

  const handleClose = useCallback(() => {
    if (busyProvider) return;
    onClose();
  }, [busyProvider, onClose]);

  /** The message for a login that opened some other wallet. */
  const mismatchMessage = useCallback(
    (provider: LegacyProvider) => {
      const used = oldLoginOf(provider);
      if (lead && leadLabel && used !== lead) {
        return name
          ? t("legacy.wrongSignInNamed", {
              name,
              method: leadLabel,
              defaultValue: "That sign-in opens a different wallet, not @{{name}}. @{{name}} was made with {{method}}, so only that can bring it back.",
            })
          : t("legacy.wrongSignIn", {
              method: leadLabel,
              defaultValue: "That sign-in opens a different wallet. This profile was made with {{method}}, so only that can bring it back.",
            });
      }
      return accounts.length > 1 ? t("legacy.didNotRecoverEither") : t("legacy.didNotRecoverThis");
    },
    [accounts.length, lead, leadLabel, name, t]
  );

  const handleProviderPress = useCallback(
    async (provider: LegacyProvider, loginHint?: string) => {
      if (busyProvider) return;
      setError(null);
      if (provider === "sms_passwordless" && !loginHint) {
        setError(t("legacy.phoneNeedsCode", "Enter the number with its country code, like +90 532 123 4567."));
        return;
      }
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
          log.warn("recover:mismatch", { provider, lead });
          setError(mismatchMessage(provider));
          setBusyProvider(null);
          return;
        }
        setBusyProvider(null);
        onRecovered(privateKey, matched);
      } catch (e: any) {
        setBusyProvider(null);
        // Closing the old login's browser is a choice; the sheet stays as it was.
        if (isSignInCancelled(e)) {
          log.warn("recover:cancelled", { provider });
          return;
        }
        log.error("recover:error", { provider, message: e?.message });
        setError(serverAuthText(e?.message, t("legacy.couldNotRetrieve")));
      }
    },
    [busyProvider, accounts, lead, mismatchMessage, onRecovered, t]
  );

  const recoverEmail = () => handleProviderPress("email_passwordless", email.trim());
  const recoverPhone = () => handleProviderPress("sms_passwordless", normalisePhoneHint(phone) ?? undefined);

  const leadIntro = lead && leadLabel
    ? (lead === "email"
        ? (name
            ? t("legacy.madeWithEmailNamed", { name, defaultValue: "@{{name}} was made with an email code. We'll send one more code to that email to bring it back." })
            : t("legacy.madeWithEmail", "This profile was made with an email code. We'll send one more code to that email to bring it back."))
        : lead === "sms"
          ? (name
              ? t("legacy.madeWithPhoneNamed", { name, defaultValue: "@{{name}} was made with a phone number. We'll text one more code to that number to bring it back." })
              : t("legacy.madeWithPhone", "This profile was made with a phone number. We'll text one more code to that number to bring it back."))
          : (name
              ? t("legacy.madeWithNamed", { name, method: leadLabel, defaultValue: "@{{name}} was made with {{method}}. Continue with the same {{method}} account to bring it back." })
              : t("legacy.madeWith", { method: leadLabel, defaultValue: "This profile was made with {{method}}. Continue with the same {{method}} account to bring it back." })))
    : null;

  const emailRow = (primary: boolean) => (
    <View style={styles.inputRow}>
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
        returnKeyType="go"
        onSubmitEditing={recoverEmail}
      />
      <AuthButton
        variant={primary ? "primary" : "secondary"}
        label={t("legacy.recover")}
        icon="arrow-forward-outline"
        onPress={recoverEmail}
        disabled={!!busyProvider || !email.trim()}
        accessibilityLabel={t("legacy.recoverFromEmailA11y")}
        style={styles.inlineSubmit}
      />
    </View>
  );

  const phoneRow = (primary: boolean) => (
    <View style={styles.inputRow}>
      <AuthField
        containerStyle={{ flex: 1 }}
        label={t("legacy.oldAccountPhone", "Old account phone number")}
        value={phone}
        onChangeText={setPhone}
        placeholder="+90 532 123 4567"
        accessibilityLabel={t("legacy.oldAccountPhone", "Old account phone number")}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        returnKeyType="go"
        onSubmitEditing={recoverPhone}
      />
      <AuthButton
        variant={primary ? "primary" : "secondary"}
        label={t("legacy.recover")}
        icon="arrow-forward-outline"
        onPress={recoverPhone}
        disabled={!!busyProvider || !phone.trim()}
        accessibilityLabel={t("legacy.recoverFromPhoneA11y", "Recover old account from this phone number")}
        style={styles.inlineSubmit}
      />
    </View>
  );

  // Every other way in. The known old login, when there is one, is already
  // the button above this list.
  const otherOptions = (
    <View style={{ gap: 8 }}>
      {PROVIDERS.filter(({ key }) => key !== lead).map(({ key, label, icon }) => {
        const known = uniqueAccountFor(key);
        return (
          <AuthButton
            key={key}
            align="start"
            icon={icon}
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
                // An outline, not a filled chip: on Xiaomi's forced dark mode a
                // light fill keeps its colour while its dark label is flipped
                // to white, and "Matched" disappeared into its own pill.
                <View style={styles.matchChip}>
                  <Ionicons name="checkmark" size={12} color={authColors.label} />
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
      {lead !== "email" && emailRow(false)}
      {lead !== "email" && emailAccount && (
        <Text style={[authText.caption, { paddingHorizontal: 4 }]}>
          {t("legacy.thisEmailRecovers", {
            target: emailAccount.username
              ? `@${emailAccount.username}`
              : t("legacy.matchedProfile"),
          })}
          {typeof emailAccount.badgeBalance === "number" ? (
            <>, {emailAccount.badgeBalance.toLocaleString()} <DhbCoin /></>
          ) : null}
        </Text>
      )}
      {lead !== "sms" && phoneRow(false)}
    </View>
  );

  const leadAction = (() => {
    if (!lead) return null;
    if (lead === "email") return emailRow(true);
    if (lead === "sms") return phoneRow(true);
    const provider = PROVIDERS.find((p) => p.key === lead)!;
    return (
      <AuthButton
        variant="primary"
        icon={provider.icon}
        label={t("legacy.continueWith", { provider: provider.label, defaultValue: "Continue with {{provider}}" })}
        onPress={() => handleProviderPress(provider.key)}
        disabled={!!busyProvider}
      />
    );
  })();

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="bottom" blurIntensity={50} maxHeight="88%">
      <ScrollView
        className="px-6 pt-6"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Ionicons name="warning-outline" size={22} color={authColors.label} />
          <Text style={[authText.modalTitle, { flexShrink: 1 }]}>
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
          {accounts.map((a, i) => {
            const login = oldLoginOf(a.signupMethod);
            const method = login === "email"
              ? t("copy.969ccbd3cf63", { defaultValue: "Email" })
              : login === "sms"
                ? t("copy.75d6c93885ba", { defaultValue: "Phone (SMS)" })
                : PROVIDERS.find((p) => p.key === login)?.label ?? a.signupMethod;
            return (
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
                  {method
                    ? t("legacy.originalSignIn", { method })
                    : t("legacy.originalSignInUnknown")}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={[authText.body, { marginTop: 16, marginBottom: 12 }]}>
          {leadIntro ?? t("legacy.useOriginalSignIn")}
        </Text>

        {busyProvider ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={authColors.label} />
            <Text style={authText.body}>{t("legacy.retrieving")}</Text>
          </View>
        ) : lead && !showAll ? (
          <View style={{ gap: 4 }}>
            {leadAction}
            <AuthTextButton
              label={t("legacy.differentSignIn", "Used a different sign-in?")}
              onPress={() => { setError(null); setShowAll(true); }}
              align="start"
            />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {leadAction}
            {otherOptions}
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
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  matchChipLabel: {
    color: authColors.label,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inlineSubmit: {
    width: "auto",
    minHeight: AUTH_CONTROL_HEIGHT,
    paddingHorizontal: 14,
  },
});

export default LegacyAccountWarningModal;
