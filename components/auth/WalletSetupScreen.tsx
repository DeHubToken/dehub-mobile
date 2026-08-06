import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isBiometricUnlockAvailable, hasBiometricWrapKey } from "../../libs/wallet-core/biometric-unlock";
import { openInApp } from "../../libs/links.utils";
import { WEBSITE_LINK } from "../../config/links";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";

import type { EncryptedPayload } from "../../libs/wallet-core/crypto";
import { getPayloadKdf } from "../../libs/wallet-core/crypto";

export type WalletSetupRequest =
  | { mode: "unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "biometric-unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "web-passkey-sync"; supabaseUserId: string; address: string }
  | {
      mode: "legacy-recovered";
      supabaseUserId: string;
      privateKey: string;
      label?: string;
    }
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
  /** legacy-recovered mode: make the recovered key's wallet the active one for this identity. */
  onSwitchAccount?: (privateKey: string, password: string) => Promise<void>;
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
  ({ visible, request, onClose, onUnlock, onBiometricUnlock, onCreate, onSwitchAccount }) => {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [protectionChoice, setProtectionChoice] = useState<"biometric" | "password">("password");
    const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
    const [deviceWrapKeyReady, setDeviceWrapKeyReady] = useState<boolean | null>(null);
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
      setDeviceWrapKeyReady(null);
    }, [visible, request, reset]);

    useEffect(() => {
      if (!visible || mode !== "biometric-unlock" || request?.mode !== "biometric-unlock") {
        setDeviceWrapKeyReady(null);
        return;
      }
      let cancelled = false;
      hasBiometricWrapKey(request.address).then((ready) => {
        if (!cancelled) setDeviceWrapKeyReady(ready);
      });
      return () => {
        cancelled = true;
      };
    }, [visible, mode, request]);

    useEffect(() => {
      if (mode !== "create") return;
      let cancelled = false;
      isBiometricUnlockAvailable().then((available) => {
        if (cancelled) return;
        setBiometricAvailable(available);
        // Default to password — it works across devices. Biometric protection
        // is device-local only and strands users on a new phone (the bug
        // captchahenryevery@gmail.com hit when mobile minted a fresh wallet).
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

    const legacyRecoveredAddress = useMemo(
      () =>
        request?.mode === "legacy-recovered" ? deriveAddressFromPrivateKey(request.privateKey) : null,
      [request]
    );

    const canSubmitLegacyRecovered = useMemo(
      () => password.length >= MIN_PASSWORD_LENGTH && password === confirm,
      [password, confirm]
    );

    const handleLegacyRecoveredSubmit = useCallback(async () => {
      if (
        !canSubmitLegacyRecovered ||
        busy ||
        !onSwitchAccount ||
        !request ||
        request.mode !== "legacy-recovered"
      ) {
        return;
      }
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
        await onSwitchAccount(request.privateKey, password);
        reset();
      } catch (e: any) {
        setError(e?.message || "Could not finish setting up this account. Please try again.");
      } finally {
        setBusy(false);
      }
    }, [canSubmitLegacyRecovered, busy, onSwitchAccount, request, password, reset]);

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

    // When this phone enrolled the biometric wrap key, prompt immediately.
    const autoBiometricAttemptedRef = useRef(false);
    useEffect(() => {
      if (!visible) {
        autoBiometricAttemptedRef.current = false;
        return;
      }
      if (
        mode !== "biometric-unlock" ||
        deviceWrapKeyReady !== true ||
        busy ||
        autoBiometricAttemptedRef.current
      ) {
        return;
      }
      autoBiometricAttemptedRef.current = true;
      handleBiometricUnlockPress();
    }, [visible, mode, deviceWrapKeyReady, busy, handleBiometricUnlockPress]);

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
        : mode === "web-passkey-sync"
        ? "Unlock on mobile"
        : mode === "legacy-recovered"
        ? "Old account found"
        : mode === "biometric-unlock"
        ? "Unlock your wallet"
        : "Unlock your wallet";

    const unlockPasskeyOnly =
      mode === "unlock" &&
      request?.mode === "unlock" &&
      getPayloadKdf(request.payload) === "hkdf";

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

          {mode === "web-passkey-sync" && request?.mode === "web-passkey-sync" && (
            <View>
              <Text className="text-theme-neutrals-400 text-sm mb-4">
                Your wallet uses <Text className="text-white font-medium">biometrics or a passkey on the web</Text>.
                That unlock stays in your browser — it does not sync to this phone, so we cannot prompt
                for fingerprint here yet.
              </Text>
              <Text className="text-theme-neutrals-400 text-sm mb-5">
                To use this account on mobile, open dehub.io on your computer, sign in with the same
                Google account, and <Text className="text-white font-medium">add a wallet password</Text>{" "}
                (this saves an encrypted backup to the cloud). Then come back here and sign in again.
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mb-4">
                Wallet: {request.address.slice(0, 6)}…{request.address.slice(-4)}
              </Text>
              <TouchableOpacity
                onPress={() => openInApp(WEBSITE_LINK)}
                className="rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent mb-3"
              >
                <Text className="text-white text-sm font-medium">Open dehub.io</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClose}
                className="rounded-xl px-4 py-3 items-center active:opacity-80 bg-neutral-800 border border-neutral-700"
              >
                <Text className="text-white text-sm font-medium">I added a password — try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === "legacy-recovered" && request?.mode === "legacy-recovered" && (
            <View>
              <Text className="text-theme-neutrals-400 text-sm mb-4">
                Verified your old account{request.label ? ` (${request.label})` : ""} and recovered
                its wallet. Set a password to protect it on this device — on this phone and
                everywhere else, from now on.
              </Text>
              {legacyRecoveredAddress && (
                <View className="rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-4 py-3 mb-4">
                  <Text className="text-theme-neutrals-500 text-xs mb-1">Recovered wallet</Text>
                  <Text className="text-white text-sm font-medium">
                    {legacyRecoveredAddress.slice(0, 6)}…{legacyRecoveredAddress.slice(-4)}
                  </Text>
                </View>
              )}

              <Text className="text-theme-neutrals-500 text-xs mb-2">
                New password (min {MIN_PASSWORD_LENGTH} chars)
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
                onPress={handleLegacyRecoveredSubmit}
                disabled={!canSubmitLegacyRecovered || busy}
                className="mt-5 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent"
                style={{ opacity: !canSubmitLegacyRecovered || busy ? 0.5 : 1 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-medium">Finish setting up this account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {mode === "biometric-unlock" && (
            <View>
              {deviceWrapKeyReady === null ? (
                <ActivityIndicator color="#fff" className="my-6" />
              ) : deviceWrapKeyReady ? (
                <>
                  <Text className="text-theme-neutrals-400 text-sm mb-5">
                    This wallet is protected by this device&apos;s biometrics. Confirm with
                    fingerprint or face to continue.
                  </Text>
                  {error && (
                    <Text className="text-red-400 text-xs mb-3">
                      {error} If this keeps failing, use your wallet password below or
                      &quot;Import external wallet&quot;.
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
                </>
              ) : (
                <>
                  <Text className="text-theme-neutrals-400 text-sm mb-5">
                    This wallet uses biometrics or a passkey on the web. This phone does not have
                    the biometric key yet — enter your wallet password to unlock here, or set a
                    password backup on dehub.io if you only use passkey on web.
                  </Text>
                  <TouchableOpacity
                    onPress={handleBiometricUnlockPress}
                    disabled={busy}
                    className="mb-4 rounded-xl px-4 py-3 items-center active:opacity-80 bg-neutral-800 border border-neutral-700 flex-row justify-center"
                    style={{ opacity: busy ? 0.5 : 1, gap: 8 }}
                  >
                    <Ionicons name="finger-print" size={18} color="#FFFFFF" />
                    <Text className="text-white text-sm font-medium">Try biometrics on this phone</Text>
                  </TouchableOpacity>
                  <Text className="text-theme-neutrals-500 text-xs mb-2">Or enter wallet password</Text>
                  <View className={inputWrapClass}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Wallet password"
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
                    className="mt-4 flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700 active:opacity-80"
                    style={{ height: 60, opacity: !canSubmitPassword || busy ? 0.5 : 1 }}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white text-sm font-medium">Unlock with password</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {mode === "unlock" && (
            <View>
              <Text className="text-theme-neutrals-400 text-sm mb-5">
                {unlockPasskeyOnly
                  ? "This wallet was secured with a passkey on the web and has no password backup in the cloud yet. If you set a wallet password on dehub.io, enter it here — otherwise use Import external wallet below."
                  : "This account already has a wallet, protected by a password. Enter it to recover your wallet on this device."}
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
                className="mt-4 flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700 active:opacity-80"
                style={{ height: 60, opacity: !canSubmitPassword || busy ? 0.5 : 1 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="lock-open" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                    <Text className="text-base font-medium text-white">Unlock</Text>
                  </>
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
