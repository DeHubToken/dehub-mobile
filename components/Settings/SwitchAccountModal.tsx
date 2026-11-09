import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import PasswordStrengthMeter from "../auth/PasswordStrengthMeter";
import {
  assessLocal,
  assessPassword,
  MIN_PASSWORD_LENGTH,
  type PasswordAssessment,
} from "../../libs/wallet-core/passwordStrength";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";
import { switchActiveWalletForIdentity } from "../../libs/identity-wallet";
import {
  getSupabaseUserId,
  getSupabaseAuthMeta,
} from "../../services/auth/supabaseAuth.service";
import { getPreferredChainId } from "../../libs/auth.utils";
import { ChainId } from "../../config/constants";
import { createLocalEip1193ProviderForChain } from "../../services/localwallet.provider";
import { setSigningProvider, setEoaSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { useAuthActions } from "../../context/AuthContext";
import { toastSuccess } from "../../libs";
import { createLogger } from "../../libs/logger";
import { useSecureScreen } from "../../hooks/useSecureScreen";

const log = createLogger("SwitchAccountModal");

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

type SwitchAccountModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Currently active wallet address, so a same-account paste can be rejected up front. */
  currentAddress?: string | null;
};

const inputWrapClass =
  "flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 py-2";

/**
 * Self-service recovery for the "linked to more than one wallet" state:
 * Supabase links Google/Email logins that share a verified email into ONE
 * identity, so a person who ended up with two separate Riftn accounts under
 * it (e.g. one created on web, one created on this phone) can only ever have
 * ONE of them be what Google/email sign-in resolves to. This lets them pick
 * which one that is by pasting that account's private key.
 *
 * There is no old-login (Web3Auth) recovery here any more: an account that
 * never moved off the old sign-in is moved by support, not by this sheet.
 */
const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  visible,
  onClose,
  currentAddress,
}) => {
  const { t } = useTranslation();
  const { signInWithWallet } = useAuthActions();
  const [privateKey, setPrivateKey] = useState("");
  useSecureScreen(visible, "switch-account-key");
  const [showPk, setShowPk] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAssessment, setLiveAssessment] = useState<PasswordAssessment | null>(null);

  const reset = useCallback(() => {
    setPrivateKey("");
    setPassword("");
    setConfirm("");
    setError(null);
    setLiveAssessment(null);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const isPkValid = useMemo(() => {
    const v = privateKey.trim();
    if (!v) return false;
    const hex = v.startsWith("0x") ? v.slice(2) : v;
    return /^[0-9a-fA-F]{64}$/.test(hex);
  }, [privateKey]);

  const derivedAddress = useMemo(
    () => (isPkValid ? deriveAddressFromPrivateKey(privateKey.trim()) : null),
    [isPkValid, privateKey]
  );

  const isSameAsCurrent = useMemo(
    () =>
      !!derivedAddress &&
      !!currentAddress &&
      derivedAddress.toLowerCase() === currentAddress.toLowerCase(),
    [derivedAddress, currentAddress]
  );

  const canSubmit = useMemo(
    () =>
      isPkValid &&
      !isSameAsCurrent &&
      password.length >= MIN_PASSWORD_LENGTH &&
      password === confirm,
    [isPkValid, isSameAsCurrent, password, confirm]
  );

  const handlePasswordChange = useCallback((v: string) => {
    setPassword(v);
    setLiveAssessment(v ? assessLocal(v) : null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const full = await assessPassword(password);
      if (!full.acceptable) {
        setError(
          full.breached === true
            ? t("switchAccount.breached")
            : full.warnings[0]
            ? t(full.warnings[0], { n: MIN_PASSWORD_LENGTH })
            : t("switchAccount.stronger")
        );
        return;
      }

      const supabaseUserId = await getSupabaseUserId();
      if (!supabaseUserId) {
        setError(t("switchAccount.needSignIn"));
        return;
      }

      const pk = privateKey.trim();
      const { address, privateKey: derivedPk } = await switchActiveWalletForIdentity(
        supabaseUserId,
        pk,
        password
      );

      const web3AuthMeta = await getSupabaseAuthMeta();
      const preferred = await getPreferredChainId();
      const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
      const localProvider = createLocalEip1193ProviderForChain(derivedPk, effectiveChainId);
      setSigningProvider(localProvider);
      setEoaSigningProvider(localProvider);
      try {
        await signInWithWallet(address, effectiveChainId, derivedPk, web3AuthMeta);
      } finally {
        clearSigningProvider();
      }

      toastSuccess(t("switchAccount.switched"));
      reset();
      onClose();
    } catch (e: any) {
      log.error("switch:error", e);
      setError(e?.message || t("switchAccount.failed"));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, busy, password, privateKey, signInWithWallet, reset, onClose, t]);

  return (
    <GlassModal
      visible={visible}
      onClose={handleClose}
      presentation="bottom"
      blurIntensity={50}
      maxHeight="92%"
      dismissible={!busy}
    >
      <ScrollView
        className="px-6 pt-6 pb-8"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-white text-2xl font-bold mb-2">{t("settings.switchAccount")}</Text>
        <Text className="text-theme-neutrals-400 text-sm mb-5">{t("settings.switchAccountDesc")}</Text>

        <View>
          <Text className="text-theme-neutrals-500 text-xs mb-2">{t("switchAccount.keyOfOther")}</Text>
          <View className={inputWrapClass}>
            <TextInput
              value={privateKey}
              onChangeText={setPrivateKey}
              placeholder="0x..."
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPk}
              importantForAutofill="no"
              autoComplete="off"
              className="flex-1 text-white text-sm"
            />
            <TouchableOpacity onPress={() => setShowPk((s) => !s)} className="pl-2 py-1">
              <Ionicons name={showPk ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {derivedAddress && !isSameAsCurrent && (
            <Text className="text-theme-neutrals-500 text-xs mt-2">{t("switchAccount.resolvesTo", { address: derivedAddress })}</Text>
          )}
          {isSameAsCurrent && (
            <Text className="text-amber-400 text-xs mt-2">
              {t("switchAccount.alreadyActive")}
            </Text>
          )}
        </View>

        <Text className="text-theme-neutrals-500 text-xs mb-2 mt-4">
          {t("switchAccount.newPassword", { min: MIN_PASSWORD_LENGTH })}
        </Text>
        <View className={inputWrapClass}>
          <TextInput
            value={password}
            onChangeText={handlePasswordChange}
            placeholder={t("switchAccount.password")}
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPw}
            className="flex-1 text-white text-sm"
          />
          <TouchableOpacity onPress={() => setShowPw((s) => !s)} className="pl-2 py-1">
            <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <PasswordStrengthMeter assessment={liveAssessment} />

        <View className={`${inputWrapClass} mt-3`}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder={t("switchAccount.confirmPassword")}
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPw}
            className="flex-1 text-white text-sm"
          />
        </View>

        <View className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 mt-4 flex-row items-start" style={{ gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#D4D4D8" />
          <Text className="text-amber-200 text-xs flex-1">
            {t("switchAccount.backupWarning")}
          </Text>
        </View>

        {error && <Text className="text-white/80 text-xs mt-3">{error}</Text>}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || busy}
          className="mt-5 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent"
          style={{ opacity: !canSubmit || busy ? 0.5 : 1 }}
        >
          {busy ? <ActivityIndicator color="#09090B" /> : <Text className="text-theme-accent-foreground text-sm font-medium">{t("settings.switchAccount")}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleClose} disabled={busy} className="mt-4 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">{t("common.cancel")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
};

export default SwitchAccountModal;
