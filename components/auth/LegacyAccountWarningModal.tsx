import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
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
        <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
          <Ionicons name="warning-outline" size={22} color="#fbbf24" />
          <Text className="text-white text-xl font-bold">Existing account found</Text>
        </View>
        <Text className="text-theme-neutrals-400 text-sm mb-4">
          This login is linked to an older DeHub account. Creating a new wallet here will NOT
          recover it — you'd end up with a separate, empty account instead.
        </Text>

        <View className="rounded-xl border border-white/10 bg-white/5 p-3" style={{ gap: 8 }}>
          {accounts.map((a, i) => (
            <View key={i} className="flex-row items-center justify-between">
              <Text className="text-white text-sm">
                {a.username ? `@${a.username}` : "Unnamed account"}
                {a.signupMethod ? ` · ${a.signupMethod}` : ""}
              </Text>
              {typeof a.badgeBalance === "number" && (
                <Text className="text-green-300 text-xs">{a.badgeBalance.toLocaleString()} DHB</Text>
              )}
            </View>
          ))}
        </View>

        <Text className="text-theme-neutrals-400 text-sm mt-4 mb-2">
          Sign in with the OLD login for the account you want back — this reconstructs its wallet
          right here on your phone:
        </Text>

        {busyProvider ? (
          <View className="flex-row items-center py-3" style={{ gap: 8 }}>
            <ActivityIndicator color="#fff" />
            <Text className="text-theme-neutrals-400 text-sm">Retrieving old wallet…</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {PROVIDERS.map(({ key, label }) => {
              const known = accountFor(key);
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleProviderPress(key)}
                  disabled={!!busyProvider}
                  className={`rounded-xl px-4 py-3 flex-row items-center justify-between bg-white/10 border ${
                    known ? "border-green-400/50" : "border-white/10"
                  }`}
                >
                  <Text className="text-white text-sm font-medium">Old account: {label}</Text>
                  {known && (
                    <Text className="text-green-300 text-xs">
                      {known.username ? `@${known.username}` : ""}
                      {typeof known.badgeBalance === "number" ? ` · ${known.badgeBalance.toLocaleString()} DHB` : ""}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View
                className={`flex-1 flex-row items-center rounded-xl border bg-theme-neutrals-900 px-3 py-2 ${
                  emailAccount ? "border-green-400/50" : "border-theme-neutrals-700"
                }`}
              >
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Old account email"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  className="flex-1 text-white text-sm"
                />
              </View>
              <TouchableOpacity
                onPress={() => handleProviderPress("email_passwordless", email)}
                disabled={!!busyProvider || !email}
                className="rounded-xl px-4 py-3 items-center justify-center bg-white/10 border border-white/10"
                style={{ opacity: !email ? 0.5 : 1 }}
              >
                <Ionicons name="arrow-down-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {emailAccount && (
              <Text className="text-green-300 text-[10px] px-1">
                {emailAccount.username ? `@${emailAccount.username}` : ""}
                {typeof emailAccount.badgeBalance === "number"
                  ? ` · ${emailAccount.badgeBalance.toLocaleString()} DHB`
                  : ""}
              </Text>
            )}
          </View>
        )}

        {error && <Text className="text-red-400 text-xs mt-3">{error}</Text>}

        <Text className="text-theme-neutrals-500 text-xs mt-4 mb-2">
          Provider not working, or Twitter/Discord/email not shown above? Recover it on the
          website instead.
        </Text>
        <TouchableOpacity
          onPress={() => openInApp(WEBSITE_LINK)}
          disabled={!!busyProvider}
          className="rounded-xl px-4 py-3 items-center active:opacity-80 bg-neutral-800 border border-neutral-700 flex-row justify-center"
          style={{ gap: 8 }}
        >
          <Ionicons name="open-outline" size={18} color="#FFFFFF" />
          <Text className="text-white text-sm font-medium">Recover on dehub.io</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCreateAnyway} disabled={!!busyProvider} className="mt-4 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">
            I don't want that account — create a new one anyway
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleClose} disabled={!!busyProvider} className="mt-2 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
};

export default LegacyAccountWarningModal;
