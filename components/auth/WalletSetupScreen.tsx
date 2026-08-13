import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import {
  AUTH_RADIUS,
  AuthButton,
  AuthErrorNotice,
  AuthField,
  AuthIconButton,
  AuthTextButton,
  authColors,
  authText,
} from "./AuthControls";
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

/** Shared reveal toggle for every password field on this screen. */
const RevealToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({ shown, onToggle }) => (
  <AuthIconButton
    icon={shown ? "eye-off-outline" : "eye-outline"}
    onPress={onToggle}
    accessibilityLabel={shown ? "Hide password" : "Show password"}
  />
);

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
    // Biometric-first. On a phone, fingerprint/face is the protection people
    // expect and the one they can actually complete — a typed password is the
    // fallback, not the default. It also skips Argon2id entirely (HKDF over a
    // device wrap key is instant), which is the single largest stall between
    // confirming a code and reaching the app. Flipped to "password" below when
    // the device turns out to have no usable biometrics.
    const [protectionChoice, setProtectionChoice] = useState<"biometric" | "password">("biometric");
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
        // No enrolled fingerprint/face (or no sensor) — the biometric tab is
        // not rendered at all in that case, so the choice has to move off it
        // or the create body would show an option the user cannot pick.
        if (!available) setProtectionChoice("password");
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
          <Text style={[authText.title, { marginBottom: 8 }]}>{title}</Text>

          {mode === "create" && biometricAvailable === null && (
            // Held until the capability check answers. Rendering the password
            // form first and swapping to biometric a moment later flashed a
            // keyboard up and stole focus on every biometric-capable phone —
            // which is nearly all of them.
            <ActivityIndicator color={authColors.label} style={{ marginVertical: 32 }} />
          )}

          {mode === "create" && biometricAvailable !== null && (
            <>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                To ensure only you can post or transact with this account, protect your wallet with
                your device's biometrics or a password.
              </Text>

              {biometricAvailable && (
                <View style={styles.segment} accessibilityRole="tablist">
                  {(["biometric", "password"] as const).map((choice) => {
                    const active = protectionChoice === choice;
                    return (
                      <TouchableOpacity
                        key={choice}
                        onPress={() => setProtectionChoice(choice)}
                        activeOpacity={0.7}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={[styles.segmentItem, active && styles.segmentItemActive]}
                      >
                        <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                          {choice === "biometric" ? "Biometric" : "Password"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {protectionChoice === "biometric" && biometricAvailable ? (
                <View>
                  <View style={styles.note}>
                    <Ionicons name="finger-print" size={22} color={authColors.label} />
                    <Text style={[authText.caption, { flex: 1 }]}>
                      Unlock with your fingerprint or face — nothing to type or remember. This is
                      device-only: to reach this wallet from another phone or the website, choose
                      Password instead.
                    </Text>
                  </View>
                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />
                  <AuthButton
                    variant="primary"
                    icon="finger-print"
                    label="Secure with biometrics"
                    onPress={handleCreateWithBiometric}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />
                </View>
              ) : (
                <View>
                  <AuthField
                    label={`Password (min ${MIN_PASSWORD_LENGTH} chars)`}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoFocus
                    trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  <PasswordStrengthMeter assessment={liveAssessment} />

                  <AuthField
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="Confirm password"
                    accessibilityLabel="Confirm password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    containerStyle={{ marginTop: 12 }}
                  />

                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

                  <AuthButton
                    variant="primary"
                    label="Secure wallet"
                    onPress={handleCreateWithPassword}
                    disabled={!canSubmitPassword}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />
                  {busy && (
                    <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                      Securing your wallet — this can take up to a minute on some devices…
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {mode === "web-passkey-sync" && request?.mode === "web-passkey-sync" && (
            <View>
              <Text style={[authText.body, { marginBottom: 16 }]}>
                Your wallet uses <Text style={authText.emphasis}>biometrics or a passkey on the web</Text>.
                That unlock stays in your browser — it does not sync to this phone, so we cannot prompt
                for fingerprint here yet.
              </Text>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                To use this account on mobile, open dehub.io on your computer, sign in with the same
                Google account, and <Text style={authText.emphasis}>add a wallet password</Text>{" "}
                (this saves an encrypted backup to the cloud). Then come back here and sign in again.
              </Text>
              <Text style={[authText.caption, { marginBottom: 16 }]}>
                Wallet: {request.address.slice(0, 6)}…{request.address.slice(-4)}
              </Text>
              <AuthButton
                variant="primary"
                icon="open-outline"
                label="Open dehub.io"
                onPress={() => openInApp(WEBSITE_LINK)}
                style={{ marginBottom: 12 }}
              />
              <AuthButton
                label="I added a password — try again"
                onPress={handleClose}
              />
            </View>
          )}

          {mode === "legacy-recovered" && request?.mode === "legacy-recovered" && (
            <View>
              <Text style={[authText.body, { marginBottom: 16 }]}>
                Verified your old account{request.label ? ` (${request.label})` : ""} and recovered
                its wallet. Set a password to protect it on this device — on this phone and
                everywhere else, from now on.
              </Text>
              {legacyRecoveredAddress && (
                <View style={styles.summaryCard}>
                  <Text style={[authText.caption, { marginBottom: 4 }]}>Recovered wallet</Text>
                  <Text style={styles.summaryValue}>
                    {legacyRecoveredAddress.slice(0, 6)}…{legacyRecoveredAddress.slice(-4)}
                  </Text>
                </View>
              )}

              <AuthField
                label={`New password (min ${MIN_PASSWORD_LENGTH} chars)`}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="newPassword"
                autoFocus
                trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
              />
              <AuthField
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm password"
                accessibilityLabel="Confirm password"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="newPassword"
                containerStyle={{ marginTop: 12 }}
              />

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                label="Finish setting up this account"
                onPress={handleLegacyRecoveredSubmit}
                disabled={!canSubmitLegacyRecovered}
                loading={busy}
                style={{ marginTop: 20 }}
              />
            </View>
          )}

          {mode === "biometric-unlock" && (
            <View>
              {deviceWrapKeyReady === null ? (
                <ActivityIndicator color={authColors.label} style={{ marginVertical: 24 }} />
              ) : deviceWrapKeyReady ? (
                <>
                  <Text style={[authText.body, { marginBottom: 20 }]}>
                    This wallet is protected by this device&apos;s biometrics. Confirm with
                    fingerprint or face to continue.
                  </Text>
                  <AuthErrorNotice
                    message={
                      error
                        ? `${error} If this keeps failing, use your wallet password below or "Import external wallet".`
                        : null
                    }
                    style={{ marginBottom: 12 }}
                  />
                  <AuthButton
                    variant="primary"
                    icon="finger-print"
                    label="Unlock with biometrics"
                    onPress={handleBiometricUnlockPress}
                    loading={busy}
                  />
                </>
              ) : (
                <>
                  <Text style={[authText.body, { marginBottom: 20 }]}>
                    This wallet uses biometrics or a passkey on the web. This phone does not have
                    the biometric key yet — enter your wallet password to unlock here, or set a
                    password backup on dehub.io if you only use passkey on web.
                  </Text>
                  <AuthButton
                    icon="finger-print"
                    label="Try biometrics on this phone"
                    onPress={handleBiometricUnlockPress}
                    disabled={busy}
                    style={{ marginBottom: 16 }}
                  />
                  <AuthField
                    label="Or enter wallet password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Wallet password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="password"
                    autoFocus
                    trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />
                  <AuthButton
                    variant="primary"
                    label="Unlock with password"
                    onPress={handleUnlockSubmit}
                    disabled={!canSubmitPassword}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />
                </>
              )}
            </View>
          )}

          {mode === "unlock" && (
            <View>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                {unlockPasskeyOnly
                  ? "This wallet was secured with a passkey on the web and has no password backup in the cloud yet. If you set a wallet password on dehub.io, enter it here — otherwise use Import external wallet below."
                  : "This account already has a wallet, protected by a password. Enter it to recover your wallet on this device."}
              </Text>
              <AuthField
                label="Wallet password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="password"
                autoFocus
                trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
              />

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                icon="lock-open"
                label="Unlock"
                onPress={handleUnlockSubmit}
                disabled={!canSubmitPassword}
                loading={busy}
                style={{ marginTop: 16 }}
              />
              {busy && (
                <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                  Unlocking your wallet — this can take up to a minute on some devices…
                </Text>
              )}
            </View>
          )}

          <AuthTextButton
            label="Cancel"
            onPress={handleClose}
            disabled={busy}
            style={{ marginTop: 16 }}
          />
        </ScrollView>
      </GlassModal>
    );
  }
);

WalletSetupScreen.displayName = "WalletSetupScreen";

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: AUTH_RADIUS,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: AUTH_RADIUS - 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: {
    backgroundColor: authColors.surfacePressed,
  },
  segmentLabel: {
    color: authColors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  segmentLabelActive: {
    color: authColors.label,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    borderRadius: AUTH_RADIUS,
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  summaryCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderRadius: AUTH_RADIUS,
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  summaryValue: {
    color: authColors.label,
    fontSize: 14,
    fontWeight: "600",
  },
});

export default WalletSetupScreen;
