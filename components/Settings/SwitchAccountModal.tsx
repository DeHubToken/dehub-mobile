import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { setSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { useAuthActions } from "../../context/AuthContext";
import { toastSuccess } from "../../libs";
import { createLogger } from "../../libs/logger";

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
 * identity, so a person who ended up with two separate DeHub accounts under
 * it (e.g. one created on web, one created on this phone) can only ever have
 * ONE of them be what Google/email sign-in resolves to. This lets them pick
 * which one that is, self-service — mirrors dehubweb's "Switch to a
 * different old account" tool in Settings → Account Security.
 *
 * Unlike the web version (which re-derives the OTHER account by signing in
 * with its old login), this asks for that account's private key directly —
 * mobile already has this exact input via "Import external wallet", so
 * reusing it here needs no new recovery mechanism.
 */
const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  visible,
  onClose,
  currentAddress,
}) => {
  const { signInWithWallet } = useAuthActions();
  const [privateKey, setPrivateKey] = useState("");
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
            ? "This password has appeared in a data breach — choose a different one"
            : full.warnings[0] || "Choose a stronger password"
        );
        return;
      }

      const supabaseUserId = await getSupabaseUserId();
      if (!supabaseUserId) {
        setError("You need to be signed in with Google or email to switch accounts.");
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
      try {
        await signInWithWallet(address, effectiveChainId, derivedPk, web3AuthMeta);
      } finally {
        clearSigningProvider();
      }

      toastSuccess("Switched account");
      reset();
      onClose();
    } catch (e: any) {
      log.error("switch:error", e);
      setError(e?.message || "Could not switch accounts. Please check the private key and try again.");
    } finally {
      setBusy(false);
    }
  }, [canSubmit, busy, password, privateKey, signInWithWallet, reset, onClose]);

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
        <Text className="text-white text-2xl font-bold mb-2">Switch account</Text>
        <Text className="text-theme-neutrals-400 text-sm mb-5">
          Google/email sign-in can only recognize ONE wallet for your account at a time. If you
          have another DeHub account under the same login (e.g. one created on the website), paste
          its private key below to make THAT one the account Google/email sign-in opens from now
          on — on this phone and everywhere else.
        </Text>

        <Text className="text-theme-neutrals-500 text-xs mb-2">Private key of the other account</Text>
        <View className={inputWrapClass}>
          <TextInput
            value={privateKey}
            onChangeText={setPrivateKey}
            placeholder="0x..."
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPk}
            className="flex-1 text-white text-sm"
          />
          <TouchableOpacity onPress={() => setShowPk((s) => !s)} className="pl-2 py-1">
            <Ionicons name={showPk ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        {derivedAddress && !isSameAsCurrent && (
          <Text className="text-theme-neutrals-500 text-xs mt-2">Resolves to {derivedAddress}</Text>
        )}
        {isSameAsCurrent && (
          <Text className="text-amber-400 text-xs mt-2">
            This is already your active wallet — nothing to switch.
          </Text>
        )}

        <Text className="text-theme-neutrals-500 text-xs mb-2 mt-4">
          New password (protects this wallet going forward, min {MIN_PASSWORD_LENGTH} chars)
        </Text>
        <View className={inputWrapClass}>
          <TextInput
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Password"
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
            placeholder="Confirm password"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPw}
            className="flex-1 text-white text-sm"
          />
        </View>

        <View className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 mt-4 flex-row items-start" style={{ gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#fbbf24" />
          <Text className="text-amber-200 text-xs flex-1">
            Make sure you've backed up the private key of your CURRENT wallet first (Settings →
            Export Private Key) — this device will stop offering it once you switch.
          </Text>
        </View>

        {error && <Text className="text-red-400 text-xs mt-3">{error}</Text>}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || busy}
          className="mt-5 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent"
          style={{ opacity: !canSubmit || busy ? 0.5 : 1 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-sm font-medium">Switch account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleClose} disabled={busy} className="mt-4 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
};

export default SwitchAccountModal;
