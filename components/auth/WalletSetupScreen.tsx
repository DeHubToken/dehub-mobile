import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import {
  assessLocal,
  assessPassword,
  MIN_PASSWORD_LENGTH,
  type PasswordAssessment,
} from "../../libs/wallet-core/passwordStrength";
import { isBiometricUnlockAvailable } from "../../libs/wallet-core/biometric-unlock";
import type { EncryptedPayload } from "../../libs/wallet-core/crypto";

export type WalletSetupRequest =
  | { mode: "unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "biometric-unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "create"; supabaseUserId: string };

export type CreateProtection = { kind: "password"; password: string } | { kind: "biometric" };

export interface WalletSetupScreenProps {
  visible: boolean;
  request: WalletSetupRequest | null;
  onClose: () => void;
  /** unlock mode: decrypt the Supabase payload with this password. */
  onUnlock: (password: string) => Promise<void>;
  /** biometric-unlock mode: unlock using this device's stored wrap key. */
  onBiometricUnlock: () => Promise<void>;
  /** create mode: generate + protect + save a brand-new wallet. */
  onCreate: (protection: CreateProtection) => Promise<void>;
}

const inputWrapClass =
  "flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 py-2";

/**
 * Full wallet setup/unlock experience — the mobile counterpart of dehubweb's
 * WalletCreateStep / WalletUnlockStep, condensed into one screen. Unlike the
 * web version there is no WebAuthn PRF, so "biometric" protection here means
 * a device-local wrap key (see wallet-core/biometric-unlock.ts): fast, but
 * only ever recoverable from this device, unlike a password.
 */
const WalletSetupScreen: React.FC<WalletSetupScreenProps> = memo(
  ({ visible, request, onClose, onUnlock, onBiometricUnlock, onCreate }) => {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [protectionChoice, setProtectionChoice] = useState<"biometric" | "password">("password");
    const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
    const [liveAssessment, setLiveAssessment] = useState<PasswordAssessment | null>(null);

    const mode = request?.mode ?? "create";

    const reset = useCallback(() => {
      setPassword("");
      setConfirm("");
      setError(null);
      setLiveAssessment(null);
    }, []);

    useEffect(() => {
      if (!visible) return;
      reset();
    }, [visible, request, reset]);

    useEffect(() => {
      if (mode !== "create") return;
      let cancelled = false;
      isBiometricUnlockAvailable().then((available) => {
        if (cancelled) return;
        setBiometricAvailable(available);
        if (available) setProtectionChoice("biometric");
      });
      return () => {
        cancelled = true;
      };
    }, [mode, visible]);

    // Instant local feedback as the user types — no network on every keystroke.
    useEffect(() => {
      if (mode !== "create" || protectionChoice !== "password") {
        setLiveAssessment(null);
        return;
      }
      setLiveAssessment(password ? assessLocal(password) : null);
    }, [password, mode, protectionChoice]);

    const handleClose = useCallback(() => {
      if (busy) return;
      reset();
      onClose();
    }, [busy, onClose, reset]);

    const canSubmitPassword = useMemo(() => {
      if (password.length < MIN_PASSWORD_LENGTH) return false;
      if (mode === "create" && password !== confirm) return false;
      return true;
    }, [password, confirm, mode]);

    const handleUnlockSubmit = useCallback(async () => {
      if (!canSubmitPassword || busy) return;
      setBusy(true);
      setError(null);
      try {
        await onUnlock(password);
        reset();
      } catch (e: any) {
        setError(e?.message || "Incorrect password");
      } finally {
        setBusy(false);
      }
    }, [canSubmitPassword, busy, onUnlock, password, reset]);

    const handleBiometricUnlockPress = useCallback(async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await onBiometricUnlock();
        reset();
      } catch (e: any) {
        setError(e?.message || "Biometric unlock failed");
      } finally {
        setBusy(false);
      }
    }, [busy, onBiometricUnlock, reset]);

    const handleCreateWithPassword = useCallback(async () => {
      if (!canSubmitPassword || busy) return;
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
        await onCreate({ kind: "password", password });
        reset();
      } catch (e: any) {
        setError(e?.message || "Could not secure your wallet");
      } finally {
        setBusy(false);
      }
    }, [canSubmitPassword, busy, password, onCreate, reset]);

    const handleCreateWithBiometric = useCallback(async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await onCreate({ kind: "biometric" });
        reset();
      } catch (e: any) {
        setError(e?.message || "Could not secure your wallet");
      } finally {
        setBusy(false);
      }
    }, [busy, onCreate, reset]);

    const title =
      mode === "create"
        ? "Secure your wallet"
        : mode === "biometric-unlock"
        ? "Unlock your wallet"
        : "Unlock your wallet";

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
          <Text className="text-white text-2xl font-bold mb-2">{title}</Text>

          {mode === "create" && (
            <>
              <Text className="text-theme-neutrals-400 text-sm mb-5">
                To ensure only you can post or transact with this account, protect your wallet with a
                password or your device's biometrics.
              </Text>

              {biometricAvailable && (
                <View className="flex-row rounded-xl bg-white/5 p-1 mb-5" style={{ gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => setProtectionChoice("biometric")}
                    className="flex-1 h-10 rounded-lg items-center justify-center"
                    style={{ backgroundColor: protectionChoice === "biometric" ? "#ffffff26" : "transparent" }}
                  >
                    <Text className="text-white text-sm">Biometric</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setProtectionChoice("password")}
                    className="flex-1 h-10 rounded-lg items-center justify-center"
                    style={{ backgroundColor: protectionChoice === "password" ? "#ffffff26" : "transparent" }}
                  >
                    <Text className="text-white text-sm">Password</Text>
                  </TouchableOpacity>
                </View>
              )}

              {protectionChoice === "biometric" && biometricAvailable ? (
                <View>
                  <View className="rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 p-4 flex-row items-start" style={{ gap: 10 }}>
                    <Ionicons name="finger-print" size={22} color="#FFFFFF" />
                    <Text className="text-theme-neutrals-400 text-xs flex-1">
                      Unlock with your fingerprint or face on THIS device — nothing to type or remember.
                      This is device-only: it can't recover your wallet on a different phone. Use a
                      password instead if you need that.
                    </Text>
                  </View>
                  {error && <Text className="text-red-400 text-xs mt-3">{error}</Text>}
                  <TouchableOpacity
                    onPress={handleCreateWithBiometric}
                    disabled={busy}
                    className="mt-4 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent flex-row justify-center"
                    style={{ opacity: busy ? 0.5 : 1, gap: 8 }}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="finger-print" size={18} color="#FFFFFF" />
                        <Text className="text-white text-sm font-medium">Secure with biometrics</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text className="text-theme-neutrals-500 text-xs mb-2">
                    Password (min {MIN_PASSWORD_LENGTH} chars)
                  </Text>
                  <View className={inputWrapClass}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Password"
                      placeholderTextColor="#6B7280"
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showPw}
                      className="flex-1 text-white text-sm"
                      autoFocus
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

                  {error && <Text className="text-red-400 text-xs mt-3">{error}</Text>}

                  <TouchableOpacity
                    onPress={handleCreateWithPassword}
                    disabled={!canSubmitPassword || busy}
                    className="mt-4 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent"
                    style={{ opacity: !canSubmitPassword || busy ? 0.5 : 1 }}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white text-sm font-medium">Secure wallet</Text>
                    )}
                  </TouchableOpacity>
                  {busy && (
                    <Text className="text-theme-neutrals-500 text-xs mt-3 text-center">
                      Securing your wallet — this can take up to a minute on some devices…
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {mode === "biometric-unlock" && (
            <View>
              <Text className="text-theme-neutrals-400 text-sm mb-5">
                This account's wallet is protected by this device's biometrics.
              </Text>
              {error && (
                <Text className="text-red-400 text-xs mb-3">
                  {error} If this keeps failing, use "Import external wallet" instead.
                </Text>
              )}
              <TouchableOpacity
                onPress={handleBiometricUnlockPress}
                disabled={busy}
                className="rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent flex-row justify-center"
                style={{ opacity: busy ? 0.5 : 1, gap: 8 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={18} color="#FFFFFF" />
                    <Text className="text-white text-sm font-medium">Unlock with biometrics</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {mode === "unlock" && (
            <View>
              <Text className="text-theme-neutrals-400 text-sm mb-5">
                This account already has a wallet, protected by a password. Enter it to recover your
                wallet on this device.
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mb-2">Wallet password</Text>
              <View className={inputWrapClass}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPw}
                  className="flex-1 text-white text-sm"
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPw((s) => !s)} className="pl-2 py-1">
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {error && <Text className="text-red-400 text-xs mt-3">{error}</Text>}

              <TouchableOpacity
                onPress={handleUnlockSubmit}
                disabled={!canSubmitPassword || busy}
                className="mt-4 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent"
                style={{ opacity: !canSubmitPassword || busy ? 0.5 : 1 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-medium">Unlock</Text>
                )}
              </TouchableOpacity>
              {busy && (
                <Text className="text-theme-neutrals-500 text-xs mt-3 text-center">
                  Unlocking your wallet — this can take up to a minute on some devices…
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity onPress={handleClose} disabled={busy} className="mt-4 items-center py-2">
            <Text className="text-theme-neutrals-500 text-xs">Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </GlassModal>
    );
  }
);

WalletSetupScreen.displayName = "WalletSetupScreen";
export default WalletSetupScreen;
