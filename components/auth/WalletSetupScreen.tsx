import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Trans, useTranslation } from "react-i18next";
import { copySecretToClipboard } from "../../libs/clipboard.utils";
import GlassModal from "../ui/GlassModal";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import {
  AUTH_RADIUS,
  AuthButton,
  AuthDivider,
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
import { BiometricRejectedError, requireDeviceOwner } from "../../libs/biometric-gate";
import { probeOtherSeedCopies, type OtherSeedCopies } from "../../libs/wallet-core/store";
import { isRawPrivateKey, isValidMnemonic } from "../../libs/wallet-core/derive";
import { openInApp } from "../../libs/links.utils";
import { WEBSITE_LINK } from "../../config/links";
import { createLogger } from "../../libs/logger";

const unlockLog = createLogger("WalletUnlock");

import type { EncryptedPayload } from "../../libs/wallet-core/crypto";
import { getPayloadKdf } from "../../libs/wallet-core/crypto";
import { useSecureScreen } from "../../hooks/useSecureScreen";

export type WalletSetupRequest =
  | { mode: "unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "biometric-unlock"; supabaseUserId: string; address: string; payload: EncryptedPayload }
  | { mode: "web-passkey-sync"; supabaseUserId: string; address: string }
  /**
   * The signed-in profile's wallet is on no device and in no cloud row this
   * app can open — a Connect Wallet session after a relaunch, an identity
   * with no wallet row, or no Supabase identity at all. The only way to sign
   * is to bring the key here: recovery phrase or private key, pinned to the
   * session's address. With a Supabase identity the restore also writes the
   * cloud row (password-protected); without one it stays on this phone.
   */
  | { mode: "restore"; supabaseUserId: string | null; address: string }
  | {
      mode: "legacy-recovered";
      supabaseUserId: string;
      privateKey: string;
      label?: string;
      /** Profile wallet recorded by the legacy-account detector. */
      expectedAddress: string;
    }
  | {
      mode: "create";
      supabaseUserId: string;
      /**
       * Set only by the reset escape hatch. Carries the address being
       * abandoned so the create write can clean up after itself, and flips the
       * default protection to password — this population is, by definition,
       * people who just lost a device-bound key.
       */
      replacing?: { address: string; clearOtherSeedCopies: boolean };
    };

export type CreateProtection = { kind: "password"; password: string } | { kind: "biometric" };

/**
 * What onCreate hands back. A biometric wallet returns its recovery phrase:
 * its wrap key never leaves this device, so the phrase is the ONLY thing that
 * can bring the wallet back after a reinstall, a lost handset, or an Android
 * backup restore that leaves the keystore behind. The screen refuses to finish
 * sign-in until the user has confirmed they've written it down.
 *
 * A password wallet returns nothing — the password is already the backup, and
 * it re-derives the same seed from any device or from the website.
 */
export type CreateResult = { recoveryPhrase?: string } | undefined;

export interface WalletSetupScreenProps {
  visible: boolean;
  request: WalletSetupRequest | null;
  onClose: () => void;
  /** unlock mode: decrypt the Supabase payload with this password. */
  onUnlock: (password: string) => Promise<void>;
  /** biometric-unlock mode: unlock using this device's stored wrap key. */
  onBiometricUnlock: () => Promise<void>;
  /**
   * create mode: generate + protect + save a brand-new wallet. When it returns
   * a recovery phrase, it must NOT have completed sign-in — the screen calls
   * onCreateConfirmed for that once the phrase has been acknowledged.
   */
  onCreate: (protection: CreateProtection) => Promise<CreateResult>;
  /** create mode: finish sign-in after a returned recovery phrase is acknowledged. */
  onCreateConfirmed?: () => Promise<void>;
  /**
   * legacy-recovered and biometric-unlock modes: adopt `secret` (a BIP-39
   * recovery phrase or a raw private key) as this identity's wallet, protected
   * by `password`.
   */
  onSwitchAccount?: (secret: string, password: string) => Promise<void>;
  /**
   * The two states where nothing anywhere can open the wallet on file, and
   * nowhere else:
   *  - biometric-unlock with the device wrap key absent (HKDF payload, and the
   *    key that opens it is on a device this isn't);
   *  - web-passkey-sync, where the row has an address and no payload at all.
   * Abandon that wallet and switch this screen to `create`. This screen owns
   * the confirmation gate; the caller owns the pre-flight re-read of the cloud
   * row and the mode switch.
   */
  onResetWallet?: () => Promise<void>;
  /**
   * restore mode: the wallet lives in an external wallet app (Trust, MetaMask)
   * reached over WalletConnect. Reopen that connection and, once the same
   * address is back, sign with it — no phrase needed.
   */
  onConnectWallet?: () => Promise<void>;
}

/** Shared reveal toggle for every password field on this screen. */
const RevealToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({ shown, onToggle }) => {
  const { t } = useTranslation();
  return (
    <AuthIconButton
      icon={shown ? "eye-off-outline" : "eye-outline"}
      onPress={onToggle}
      accessibilityLabel={shown ? t("walletSetup.hidePassword") : t("walletSetup.showPassword")}
    />
  );
};

/** One line of the "what you lose" / "what stays" lists. */
const ResetPoint: React.FC<{ tone: "lose" | "keep"; head: string; body: string }> = memo(
  ({ tone, head, body }) => (
    <View style={styles.resetPoint}>
      <Ionicons
        name={tone === "lose" ? "close-circle-outline" : "checkmark-circle-outline"}
        size={16}
        color={tone === "lose" ? authColors.danger : authColors.muted}
        style={{ marginTop: 2 }}
      />
      <Text style={[authText.caption, { flex: 1 }]}>
        <Text style={authText.emphasis}>{head}</Text> {body}
      </Text>
    </View>
  )
);
ResetPoint.displayName = "ResetPoint";

interface ResetWalletPanelProps {
  address: string;
  otherCopies: OtherSeedCopies | null;
  overrode: boolean;
  onOverride: () => void;
  acknowledged: boolean;
  onToggleAcknowledged: () => void;
  confirmText: string;
  onChangeConfirmText: (v: string) => void;
  canReset: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * The last-resort escape from a wallet nothing can open.
 *
 * Every claim below was checked against what the code actually does, because
 * the previous version of this screen was wrong about exactly this and cost a
 * user their account:
 *
 *  - The DeHub account really is lost. The backend keys accounts on the wallet
 *    ADDRESS, so a new address is a signup: `isNewAccount: true`, a generated
 *    username, every counter at zero.
 *  - The old account is orphaned rather than deleted. Its document survives
 *    with its username, which is why that username can never be reclaimed, and
 *    the first sign-in with the new wallet actively unlinks the Supabase
 *    identity from it.
 *  - The funds are NOT destroyed. They sit at an address on-chain. Anyone who
 *    later finds that wallet's phrase or key can still reach them, here or in
 *    any other wallet app. Saying "your balance is lost" would be false.
 *  - The originating handset keeps its own local copy of the key while DeHub
 *    is still installed on it — so "export it there first" is real advice, not
 *    a hedge.
 */
const ResetWalletPanel: React.FC<ResetWalletPanelProps> = memo(
  ({
    address,
    otherCopies,
    overrode,
    onOverride,
    acknowledged,
    onToggleAcknowledged,
    confirmText,
    onChangeConfirmText,
    canReset,
    busy,
    error,
    onConfirm,
    onBack,
  }) => {
    const { t } = useTranslation();
    const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : t("walletSetup.thisWallet");
    const hasOtherWayIn = !!otherCopies && (otherCopies.recovery || otherCopies.passkeys > 0);

    if (!otherCopies) {
      return (
        <View>
          <Text style={[authText.body, { marginBottom: 16 }]}>
            {t("walletSetup.checkingWaysBack")}
          </Text>
          <ActivityIndicator color={authColors.label} style={{ marginVertical: 16 }} />
          {/* Both probe reads are un-timed Supabase queries, so this can sit
              here a while. Without its own way back, the only exit is the
              screen-level Cancel — which closes the whole sheet and, on the
              biometric-unlock route, wipes a half-typed recovery phrase that
              exitResetReview deliberately preserves. */}
          <AuthTextButton label={t("walletSetup.goBack")} onPress={onBack} />
        </View>
      );
    }

    // Another wrap of the same seed exists. This user is not actually locked
    // out, and must be told before being offered a way to throw the wallet
    // away — this block, not the warning, is the important one for them.
    if (hasOtherWayIn && !overrode) {
      const n = otherCopies.passkeys;
      return (
        <View>
          <Text style={[authText.title, { fontSize: 18, marginBottom: 12 }]}>
            {t("walletSetup.mayGetItBack")}
          </Text>
          {otherCopies.recovery && (
            <Text style={[authText.body, { marginBottom: 12 }]}>
              <Trans
                i18nKey="walletSetup.recoveryRecordNotice"
                components={{ em: <Text style={authText.emphasis} /> }}
              />
            </Text>
          )}
          {/* One-or-several rather than an i18next plural: only _one/_other are
              stored per locale, and languages with more plural forms would
              fall back to English for counts like 3. */}
          {n > 0 && (
            <Text style={[authText.body, { marginBottom: 12 }]}>
              {n === 1 ? t("walletSetup.passkeyNoticeSingle") : t("walletSetup.passkeyNoticeMultiple")}
            </Text>
          )}
          <AuthButton
            variant="primary"
            icon="open-outline"
            label={t("walletSetup.openDehub")}
            onPress={() => openInApp(WEBSITE_LINK)}
            style={{ marginTop: 4 }}
          />
          <AuthTextButton
            label={t("walletSetup.thatsGoneToo")}
            onPress={onOverride}
            style={{ marginTop: 8 }}
          />
          <AuthTextButton label={t("walletSetup.goBack")} onPress={onBack} tone="muted" />
        </View>
      );
    }

    return (
      <View>
        <Text style={[authText.body, { marginBottom: 16 }]}>
          {t("walletSetup.resetExplainer")}
        </Text>

        {otherCopies.failed && (
          <View style={{ marginBottom: 16 }}>
            <AuthErrorNotice message={t("walletSetup.otherWaysCheckFailed")} />
          </View>
        )}

        <Text style={styles.resetHeading}>{t("walletSetup.whatYouLose")}</Text>
        {/* Stated as a loss, not softened with "but it's still on-chain".
            Anyone who reaches this screen has already failed the restore form,
            i.e. has no phrase and no private key — so "you could still reach
            it if you find the phrase" describes a route this user has just
            told us they do not have, and reads as reassurance for a decision
            that deserves none. */}
        <ResetPoint
          tone="lose"
          head={t("walletSetup.loseFundsHead")}
          body={t("walletSetup.loseFundsBody", { address: short })}
        />
        {/* Gated on "might exist", not on "we know it exists". The reset
            clears both tables either way, so when the probe couldn't read
            them the honest line is that we don't know and are clearing them
            regardless — saying nothing would let a user with a recovery code
            proceed believing the list was complete. */}
        {(otherCopies.recovery || otherCopies.failed) && (
          <ResetPoint
            tone="lose"
            head={t("walletSetup.loseRecoveryHead")}
            body={
              otherCopies.recovery
                ? t("walletSetup.loseRecoveryBody")
                : t("walletSetup.loseRecoveryUnknownBody")
            }
          />
        )}
        {(otherCopies.passkeys > 0 || otherCopies.failed) && (
          <ResetPoint
            tone="lose"
            head={t("walletSetup.losePasskeysHead")}
            body={
              otherCopies.passkeys > 0
                ? t("walletSetup.losePasskeysBody")
                : t("walletSetup.losePasskeysUnknownBody")
            }
          />
        )}

        <Text style={[styles.resetHeading, { marginTop: 16 }]}>{t("walletSetup.whatYouKeep")}</Text>
        {/* The account is a record, and the wallet address is one field on it.
            Replacing the wallet used to mean starting again as a stranger with
            a generated name, while the old account sat there keeping the handle
            forever. It does not any more — see the backend's rotate-wallet. */}
        <ResetPoint
          tone="keep"
          head={t("walletSetup.keepAccountHead")}
          body={t("walletSetup.keepAccountBody")}
        />
        <ResetPoint
          tone="keep"
          head={t("walletSetup.keepMessagesHead")}
          body={t("walletSetup.keepMessagesBody")}
        />
        <ResetPoint
          tone="keep"
          head={t("walletSetup.keepSignInHead")}
          body={t("walletSetup.keepSignInBody")}
        />

        <Text style={[styles.resetHeading, { marginTop: 16 }]}>{t("walletSetup.beforeYouDoThis")}</Text>
        <ResetPoint
          tone="keep"
          head={t("walletSetup.checkDeviceHead")}
          body={t("walletSetup.checkDeviceBody")}
        />

        <Text style={[authText.caption, { marginTop: 16 }]}>
          {t("walletSetup.walletLeftBehind", { address: short })}
        </Text>

        <TouchableOpacity
          onPress={onToggleAcknowledged}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel={t("walletSetup.understandOldWalletA11y")}
          style={styles.ackRow}
        >
          <Ionicons
            name={acknowledged ? "checkbox" : "square-outline"}
            size={22}
            color={acknowledged ? authColors.label : authColors.muted}
          />
          <Text style={[authText.body, { flex: 1, color: authColors.label }]}>
            {t("walletSetup.understandOldWallet")}
          </Text>
        </TouchableOpacity>

        <AuthField
          label={t("walletSetup.typeResetLabel", { word: "RESET" })}
          value={confirmText}
          onChangeText={onChangeConfirmText}
          placeholder="RESET"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          containerStyle={{ marginTop: 12 }}
        />

        <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

        <AuthButton
          variant="danger"
          label={t("walletSetup.resetAndCreate")}
          onPress={onConfirm}
          disabled={!canReset}
          loading={busy}
          style={{ marginTop: 16 }}
        />
        <AuthTextButton label={t("walletSetup.goBack")} onPress={onBack} disabled={busy} />
      </View>
    );
  }
);
ResetWalletPanel.displayName = "ResetWalletPanel";

/**
 * Full wallet setup/unlock experience — the mobile counterpart of dehubweb's
 * WalletCreateStep / WalletUnlockStep, condensed into one screen. Unlike the
 * web version there is no WebAuthn PRF, so "biometric" protection here means
 * a device-local wrap key (see wallet-core/biometric-unlock.ts): fast, but
 * only ever recoverable from this device, unlike a password.
 */
const WalletSetupScreen: React.FC<WalletSetupScreenProps> = memo(
  ({
    visible,
    request,
    onClose,
    onUnlock,
    onBiometricUnlock,
    onCreate,
    onCreateConfirmed,
    onSwitchAccount,
    onResetWallet,
    onConnectWallet,
  }) => {
    const { t } = useTranslation();
    // Shows and takes the recovery phrase and wallet passwords.
    useSecureScreen(visible, "wallet-setup");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The biometric attempt reports separately from the restore form below it.
    // Sharing one `error` put "no key on this device" underneath a recovery-
    // phrase box and two password fields — several hundred pixels below the
    // button that produced it, so pressing it looked like nothing happened.
    const [biometricError, setBiometricError] = useState<string | null>(null);
    // Set between "wallet created with biometrics" and "user has confirmed
    // they wrote the phrase down". Sign-in is deliberately parked until then.
    const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
    const [phraseAcknowledged, setPhraseAcknowledged] = useState(false);
    // biometric-unlock fallback: a phrase or private key typed in to recover a
    // wallet whose device wrap key is gone.
    const [restoreSecret, setRestoreSecret] = useState("");
    // Last-resort escape: abandon the unreachable wallet for a new one. Staged
    // so the warning has to be read before the confirmation can be typed.
    const [resetStage, setResetStage] = useState<"hidden" | "review">("hidden");
    const [resetConfirmText, setResetConfirmText] = useState("");
    const [resetAcknowledged, setResetAcknowledged] = useState(false);
    const [otherCopies, setOtherCopies] = useState<OtherSeedCopies | null>(null);
    const [overrodeOtherCopies, setOverrodeOtherCopies] = useState(false);
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
      setBiometricError(null);
      setLiveAssessment(null);
      setRestoreSecret("");
      // The hosts keep this component mounted for the whole session and only
      // toggle `visible`, so a reveal left on in one mode would otherwise carry
      // into the next and render a fresh password in plaintext.
      setShowPw(false);
    }, []);

    // Deliberately NOT behind `if (!visible) return`. The hosts keep this
    // component mounted for the whole session and only toggle `visible`, so
    // clearing on open alone left every one of these alive across a close —
    // and the first committed render of the NEXT open, for whatever identity
    // opens it, showed the previous one's state before the effect ran. For
    // `recoveryPhrase` that is the abandoned wallet's 12 words on screen under
    // someone else's sign-in; for the reset group it is a pre-ticked
    // acknowledgement and a pre-typed RESET.
    useEffect(() => {
      reset();
      setDeviceWrapKeyReady(null);
      setRecoveryPhrase(null);
      setPhraseAcknowledged(false);
      setResetStage("hidden");
      setResetConfirmText("");
      setResetAcknowledged(false);
      setOtherCopies(null);
      setOverrodeOtherCopies(false);
    }, [visible, request, reset]);

    // What else could still open this wallet. Asked as the reset panel opens,
    // because "you have a recovery code on dehub.io" is the one answer that
    // means the user should not be doing this at all.
    useEffect(() => {
      if (
        resetStage !== "review" ||
        (request?.mode !== "biometric-unlock" && request?.mode !== "web-passkey-sync")
      ) {
        return;
      }
      let cancelled = false;
      setOtherCopies(null);
      probeOtherSeedCopies(request.supabaseUserId).then((copies) => {
        if (!cancelled) setOtherCopies(copies);
      });
      return () => {
        cancelled = true;
      };
    }, [resetStage, request]);

    const enterResetReview = useCallback(() => {
      setError(null);
      setResetStage("review");
    }, []);

    /**
     * Disarm completely on the way out. Leaving these set meant a user who
     * backed out could come straight back to a pre-ticked checkbox, a
     * pre-typed RESET, and — because overrodeOtherCopies survived — no sign of
     * the "you can still recover this on dehub.io" screen they had just seen.
     */
    const exitResetReview = useCallback(() => {
      setResetStage("hidden");
      setError(null);
      setResetConfirmText("");
      setResetAcknowledged(false);
      setOverrodeOtherCopies(false);
      setOtherCopies(null);
    }, []);

    useEffect(() => {
      if (!visible || mode !== "biometric-unlock" || request?.mode !== "biometric-unlock") {
        setDeviceWrapKeyReady(null);
        return;
      }
      let cancelled = false;
      setDeviceWrapKeyReady(null);
      hasBiometricWrapKey(request.address).then((ready) => {
        if (!cancelled) setDeviceWrapKeyReady(ready);
      }).catch((error) => {
        if (!cancelled) setBiometricError(error.message);
      });
      return () => {
        cancelled = true;
      };
    }, [visible, mode, request]);

    useEffect(() => {
      if (mode !== "create") return;
      let cancelled = false;
      // Re-derived on every request, never merely nudged in one direction:
      // both of the conditions below force "password", and leaving the choice
      // where a previous request put it meant one reset-create pinned the
      // password tab for every ordinary signup afterwards in the same mount.
      const replacingUnreachable = request?.mode === "create" && !!request.replacing;
      setBiometricAvailable(null);
      isBiometricUnlockAvailable().then((available) => {
        if (cancelled) return;
        setBiometricAvailable(available);
        // No enrolled fingerprint/face (or no sensor) — the biometric tab is
        // not rendered at all in that case, so the choice has to move off it
        // or the create body would show an option the user cannot pick.
        //
        // Replacing an unreachable wallet forces it too: this user is, by
        // definition, someone a device-bound key just locked out, so the
        // option that survives a lost handset should be preselected.
        // Biometric stays selectable in that case.
        setProtectionChoice(!available || replacingUnreachable ? "password" : "biometric");
      });
      return () => {
        cancelled = true;
      };
    }, [mode, visible, request]);

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

    const legacyRecoveredAddress =
      request?.mode === "legacy-recovered" ? request.expectedAddress : null;

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
              ? t("walletSetup.passwordBreached")
              : full.warnings[0] ? t(full.warnings[0], { n: MIN_PASSWORD_LENGTH }) : t("walletSetup.chooseStronger")
          );
          return;
        }
        await onSwitchAccount(request.privateKey, password);
        reset();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotFinishSetup"));
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
        unlockLog.error("unlock:password-failed", { errorName: e instanceof Error ? e.name : "unknown" });
        setError(e?.message || t("walletSetup.incorrectPassword"));
      } finally {
        setBusy(false);
      }
    }, [canSubmitPassword, busy, onUnlock, password, reset]);

    const handleBiometricUnlockPress = useCallback(async () => {
      if (busy) return;
      setBusy(true);
      setBiometricError(null);
      try {
        await onBiometricUnlock();
        reset();
      } catch (e: any) {
        unlockLog.error("unlock:biometric-failed", { errorName: e instanceof Error ? e.name : "unknown" });
        setBiometricError(e?.message || t("walletSetup.biometricFailed"));
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
              ? t("walletSetup.passwordBreached")
              : full.warnings[0] ? t(full.warnings[0], { n: MIN_PASSWORD_LENGTH }) : t("walletSetup.chooseStronger")
          );
          return;
        }
        await onCreate({ kind: "password", password });
        reset();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotSecure"));
      } finally {
        setBusy(false);
      }
    }, [canSubmitPassword, busy, password, onCreate, reset]);

    const handleCreateWithBiometric = useCallback(async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await onCreate({ kind: "biometric" });
        const phrase = result?.recoveryPhrase;
        // Sign-in is NOT finished yet when a phrase came back — the wallet is
        // saved, but the only copy of its key that survives this install is
        // the phrase, so it gets shown before anything else happens.
        if (phrase && onCreateConfirmed) {
          setRecoveryPhrase(phrase);
          setPhraseAcknowledged(false);
          return;
        }
        reset();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotSecure"));
      } finally {
        setBusy(false);
      }
    }, [busy, onCreate, onCreateConfirmed, reset]);

    const handlePhraseAcknowledged = useCallback(async () => {
      if (busy || !phraseAcknowledged || !onCreateConfirmed) return;
      setBusy(true);
      setError(null);
      try {
        await onCreateConfirmed();
        setRecoveryPhrase(null);
        setPhraseAcknowledged(false);
        reset();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotFinishSignIn"));
      } finally {
        setBusy(false);
      }
    }, [busy, phraseAcknowledged, onCreateConfirmed, reset]);

    const handleCopyPhrase = useCallback(async () => {
      if (!recoveryPhrase) return;
      try {
        await copySecretToClipboard(recoveryPhrase);
        setError(null);
      } catch {
        setError(t("walletSetup.couldNotCopy"));
      }
    }, [recoveryPhrase]);

    /**
     * A recovery phrase or a raw private key; deriveFromSecret takes either.
     * Whitespace is collapsed first — a phrase pasted from a note where it was
     * saved several words per line is correct, and rejecting it here would tell
     * the user their last way back into the account is invalid.
     */
    const normalizedRestoreSecret = useMemo(
      () => restoreSecret.trim().replace(/\s+/g, " "),
      [restoreSecret]
    );
    const restoreSecretValid = useMemo(
      () => isRawPrivateKey(normalizedRestoreSecret) || isValidMnemonic(normalizedRestoreSecret),
      [normalizedRestoreSecret]
    );

    /** Says why a non-empty entry was rejected — a disabled button explains nothing. */
    const restoreSecretHint = useMemo(() => {
      if (!normalizedRestoreSecret || restoreSecretValid) return null;
      const words = normalizedRestoreSecret.split(" ").length;
      if (words >= 9) {
        return t("walletSetup.phraseInvalidHint");
      }
      if (/^(0x)?[0-9a-fA-F]+$/.test(normalizedRestoreSecret)) {
        return t("walletSetup.privateKeyHint");
      }
      return null;
    }, [normalizedRestoreSecret, restoreSecretValid, t]);

    // A restore with no cloud identity has no row to protect, so no password.
    const restoreNeedsPassword = !(request?.mode === "restore" && !request.supabaseUserId);

    const canSubmitRestore =
      restoreSecretValid &&
      (!restoreNeedsPassword || (password.length >= MIN_PASSWORD_LENGTH && password === confirm));

    const handleRestoreSubmit = useCallback(async () => {
      if (!canSubmitRestore || busy || !onSwitchAccount) return;
      setBusy(true);
      setError(null);
      try {
        if (restoreNeedsPassword) {
          const full = await assessPassword(password);
          if (!full.acceptable) {
            setError(
              full.breached === true
                ? t("walletSetup.passwordBreached")
                : full.warnings[0] ? t(full.warnings[0], { n: MIN_PASSWORD_LENGTH }) : t("walletSetup.chooseStronger")
            );
            return;
          }
        }
        await onSwitchAccount(normalizedRestoreSecret, password);
        reset();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotRestore"));
      } finally {
        setBusy(false);
      }
    }, [canSubmitRestore, busy, onSwitchAccount, normalizedRestoreSecret, password, reset, restoreNeedsPassword]);

    const handleConnectPress = useCallback(async () => {
      if (!onConnectWallet || busy) return;
      setBusy(true);
      setError(null);
      try {
        await onConnectWallet();
      } catch (e: any) {
        setError(e?.message || t("walletSetup.couldNotRestore"));
      } finally {
        setBusy(false);
      }
    }, [onConnectWallet, busy]);

    /** Another copy of this seed exists, so the user is not actually stuck. */
    const hasOtherWayIn = !!otherCopies && (otherCopies.recovery || otherCopies.passkeys > 0);

    const canReset =
      resetAcknowledged &&
      resetConfirmText.trim().toUpperCase() === "RESET" &&
      !!otherCopies &&
      (overrodeOtherCopies || !hasOtherWayIn);

    const handleResetPress = useCallback(async () => {
      if (!canReset || busy || !onResetWallet) return;
      setBusy(true);
      setError(null);
      try {
        // A phone with no screen lock returns "unenforceable" without throwing,
        // consistent with every other key gate in the app.
        await requireDeviceOwner(t("walletSetup.confirmStartOver"));
        await onResetWallet();
      } catch (e: any) {
        setError(
          e instanceof BiometricRejectedError
            ? t("walletSetup.deviceCheckCancelled")
            : e?.message || t("walletSetup.couldNotStartOver")
        );
      } finally {
        setBusy(false);
      }
    }, [canReset, busy, onResetWallet]);

    const title =
      recoveryPhrase
        ? t("walletSetup.savePhraseTitle")
        : resetStage === "review"
        ? t("walletSetup.startOverTitle")
        : mode === "create" && request?.mode === "create" && request.replacing
        ? t("walletSetup.secureNewWalletTitle")
        : mode === "create"
        ? t("walletSetup.secureWalletTitle")
        : mode === "web-passkey-sync"
        ? t("walletSetup.unlockOnMobileTitle")
        : mode === "legacy-recovered"
        ? t("walletSetup.oldAccountFoundTitle")
        : mode === "restore"
        ? t("walletSetup.restoreTitle")
        : t("walletSetup.unlockWalletTitle");

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
        // Dismissible throughout. The recovery-phrase step used to be sealed
        // shut, because the wallet was already written by the time it showed
        // and leaving would have stranded a key nobody had a copy of — but
        // nothing is written until Continue now, so backing out simply means
        // no wallet was created. Sealing it would only trap a user whose
        // Continue keeps failing on a backend outage.
        dismissible={!busy}
      >
        <ScrollView
          className="px-6 pt-6 pb-8"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text style={[authText.title, { marginBottom: 8 }]}>{title}</Text>

          {/* Biometric protection wraps the seed with a key that exists only
              in this install's SecureStore. Uninstall the app, lose the phone,
              or restore an Android backup without the keystore and that key is
              gone — and with it the wallet, the DeHub account behind it, and
              anything either one holds. dehub.io cannot help: it never had the
              key. So the phrase is shown before the wallet is written at all,
              not buried in a settings screen the user may never open. Backing
              out here creates nothing. */}
          {recoveryPhrase && (
            <View>
              <Text style={[authText.body, { marginBottom: 16 }]}>
                <Trans
                  i18nKey="walletSetup.phraseExplainer"
                  components={{ em: <Text style={authText.emphasis} /> }}
                />
              </Text>

              <View style={styles.phraseCard}>
                {recoveryPhrase.split(/\s+/).map((word, i) => (
                  <View key={`${i}-${word}`} style={styles.phraseWord}>
                    <Text style={styles.phraseIndex}>{i + 1}</Text>
                    <Text style={styles.phraseText}>{word}</Text>
                  </View>
                ))}
              </View>

              <AuthButton
                icon="copy-outline"
                label={t("walletSetup.copyPhrase")}
                onPress={handleCopyPhrase}
                disabled={busy}
                style={{ marginTop: 12 }}
              />

              <Text style={[authText.caption, { marginTop: 12 }]}>
                {t("walletSetup.writeThemDown")}
              </Text>

              <TouchableOpacity
                onPress={() => setPhraseAcknowledged((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: phraseAcknowledged }}
                accessibilityLabel={t("walletSetup.savedPhraseA11y")}
                style={styles.ackRow}
              >
                <Ionicons
                  name={phraseAcknowledged ? "checkbox" : "square-outline"}
                  size={22}
                  color={phraseAcknowledged ? authColors.label : authColors.muted}
                />
                <Text style={[authText.body, { flex: 1, color: authColors.label }]}>
                  {t("walletSetup.savedTwelveWords")}
                </Text>
              </TouchableOpacity>

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                label={t("walletSetup.createMyWallet")}
                onPress={handlePhraseAcknowledged}
                disabled={!phraseAcknowledged}
                loading={busy}
                style={{ marginTop: 16 }}
              />
              {busy && (
                <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                  {t("walletSetup.creatingWallet")}
                </Text>
              )}
            </View>
          )}

          {mode === "create" && !recoveryPhrase && biometricAvailable === null && (
            // Held until the capability check answers. Rendering the password
            // form first and swapping to biometric a moment later flashed a
            // keyboard up and stole focus on every biometric-capable phone —
            // which is nearly all of them.
            <ActivityIndicator color={authColors.label} style={{ marginVertical: 32 }} />
          )}

          {mode === "create" && !recoveryPhrase && biometricAvailable !== null && (
            <>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                {t("walletSetup.protectWallet")}
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
                          {choice === "biometric" ? t("walletSetup.biometricTab") : t("walletSetup.password")}
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
                      {t("walletSetup.biometricExplainer")}
                    </Text>
                  </View>
                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />
                  <AuthButton
                    variant="primary"
                    icon="finger-print"
                    label={t("walletSetup.secureWithBiometrics")}
                    onPress={handleCreateWithBiometric}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />
                </View>
              ) : (
                <View>
                  <AuthField
                    label={t("walletSetup.passwordMin", { min: MIN_PASSWORD_LENGTH })}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("walletSetup.password")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    autoFocus
                    trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  <PasswordStrengthMeter assessment={liveAssessment} />

                  <AuthField
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder={t("walletSetup.confirmPassword")}
                    accessibilityLabel={t("walletSetup.confirmPassword")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    containerStyle={{ marginTop: 12 }}
                  />

                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

                  <AuthButton
                    variant="primary"
                    label={t("walletSetup.secureWallet")}
                    onPress={handleCreateWithPassword}
                    disabled={!canSubmitPassword}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />
                  {busy && (
                    <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                      {t("walletSetup.securingWallet")}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {mode === "web-passkey-sync" && resetStage === "review" && (
            <ResetWalletPanel
              address={request?.mode === "web-passkey-sync" ? request.address : ""}
              otherCopies={otherCopies}
              overrode={overrodeOtherCopies}
              onOverride={() => setOverrodeOtherCopies(true)}
              acknowledged={resetAcknowledged}
              onToggleAcknowledged={() => setResetAcknowledged((v) => !v)}
              confirmText={resetConfirmText}
              onChangeConfirmText={setResetConfirmText}
              canReset={canReset}
              busy={busy}
              error={error}
              onConfirm={handleResetPress}
              onBack={exitResetReview}
            />
          )}

          {mode === "web-passkey-sync" &&
            resetStage === "hidden" &&
            request?.mode === "web-passkey-sync" && (
            <View>
              {/* This row has an address and NO payload at all. The obvious
                  reading is a web WebAuthn wallet whose seed columns were
                  deliberately omitted — but it is equally an interrupted
                  sign-up on this phone that never wrote a seed, and phrasing it
                  as a certainty sent people who had never opened dehub.io to
                  dehub.io. Say both, and let the probe below settle it. */}
              <Text style={[authText.body, { marginBottom: 16 }]}>
                <Trans
                  i18nKey="walletSetup.noUsableBackup"
                  components={{ em: <Text style={authText.emphasis} /> }}
                />
              </Text>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                <Trans
                  i18nKey="walletSetup.addPasswordOnWeb"
                  components={{ em: <Text style={authText.emphasis} /> }}
                />
              </Text>
              <Text style={[authText.caption, { marginBottom: 16 }]}>
                {t("walletSetup.walletAddress", {
                  address: `${request.address.slice(0, 6)}…${request.address.slice(-4)}`,
                })}
              </Text>
              <AuthButton
                variant="primary"
                icon="open-outline"
                label={t("walletSetup.openDehub")}
                onPress={() => openInApp(WEBSITE_LINK)}
                style={{ marginBottom: 12 }}
              />
              <AuthButton
                label={t("walletSetup.addedPasswordRetry")}
                onPress={handleClose}
              />
              {!!onResetWallet && (
                <AuthTextButton
                  label={t("walletSetup.neverUsedDehub")}
                  onPress={enterResetReview}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                />
              )}
            </View>
          )}

          {mode === "legacy-recovered" && request?.mode === "legacy-recovered" && (
            <View>
              <Text style={[authText.body, { marginBottom: 16 }]}>
                {t("walletSetup.legacyRecovered", {
                  suffix: request.label ? ` (${request.label})` : "",
                })}
              </Text>
              {legacyRecoveredAddress && (
                <View style={styles.summaryCard}>
                  <Text style={[authText.caption, { marginBottom: 4 }]}>{t("walletSetup.profileWalletLabel")}</Text>
                  <Text style={styles.summaryValue}>
                    {legacyRecoveredAddress.slice(0, 6)}…{legacyRecoveredAddress.slice(-4)}
                  </Text>
                </View>
              )}

              <AuthField
                label={t("walletSetup.newPasswordMin", { min: MIN_PASSWORD_LENGTH })}
                value={password}
                onChangeText={setPassword}
                placeholder={t("walletSetup.password")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="newPassword"
                autoComplete="new-password"
                autoFocus
                trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
              />
              <AuthField
                value={confirm}
                onChangeText={setConfirm}
                placeholder={t("walletSetup.confirmPassword")}
                accessibilityLabel={t("walletSetup.confirmPassword")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="newPassword"
                autoComplete="new-password"
                containerStyle={{ marginTop: 12 }}
              />

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                label={t("walletSetup.finishSettingUp")}
                onPress={handleLegacyRecoveredSubmit}
                disabled={!canSubmitLegacyRecovered}
                loading={busy}
                style={{ marginTop: 20 }}
              />
            </View>
          )}

          {mode === "biometric-unlock" && resetStage === "review" && (
            <ResetWalletPanel
              address={request?.mode === "biometric-unlock" ? request.address : ""}
              otherCopies={otherCopies}
              overrode={overrodeOtherCopies}
              onOverride={() => setOverrodeOtherCopies(true)}
              acknowledged={resetAcknowledged}
              onToggleAcknowledged={() => setResetAcknowledged((v) => !v)}
              confirmText={resetConfirmText}
              onChangeConfirmText={setResetConfirmText}
              canReset={canReset}
              busy={busy}
              error={error}
              onConfirm={handleResetPress}
              onBack={exitResetReview}
            />
          )}

          {mode === "biometric-unlock" && resetStage === "hidden" && (
            <View>
              {deviceWrapKeyReady === null ? (
                biometricError ? (
                  <>
                    <AuthErrorNotice message={biometricError} style={{ marginBottom: 12 }} />
                    <AuthButton
                      icon="finger-print"
                      label={t("walletSetup.tryBiometrics")}
                      onPress={handleBiometricUnlockPress}
                      loading={busy}
                    />
                  </>
                ) : <ActivityIndicator color={authColors.label} style={{ marginVertical: 24 }} />
              ) : deviceWrapKeyReady ? (
                <>
                  <Text style={[authText.body, { marginBottom: 20 }]}>
                    {t("walletSetup.biometricPrompt")}
                  </Text>
                  <AuthErrorNotice
                    message={
                      biometricError
                        ? t("walletSetup.biometricKeepsFailing", { error: biometricError })
                        : null
                    }
                    style={{ marginBottom: 12 }}
                  />
                  <AuthButton
                    variant="primary"
                    icon="finger-print"
                    label={t("walletSetup.unlockWithBiometrics")}
                    onPress={handleBiometricUnlockPress}
                    loading={busy}
                  />
                </>
              ) : (
                // The wallet is wrapped with HKDF, so its key is held by a
                // device (or a browser passkey), not derived from anything
                // typeable. This phone doesn't have it.
                //
                // What used to be here sent the user to dehub.io to "add a
                // wallet password". That is a dead end and, for a wallet
                // created on a phone, simply false: the website has the same
                // ciphertext and no more ability to open it than we do, so it
                // shows its own "unlock this on your mobile" message and the
                // user bounces between the two forever. There is also no
                // password field any more — a password provably cannot open an
                // HKDF payload (see wallet-core/crypto's decryptString), so
                // offering one only produced a wrong-password error for a
                // password that was never wrong.
                <>
                  <Text style={[authText.body, { marginBottom: 12 }]}>
                    <Trans
                      i18nKey="walletSetup.deviceBoundKey"
                      components={{ em: <Text style={authText.emphasis} /> }}
                    />
                  </Text>
                  <Text style={[authText.caption, { marginBottom: 20 }]}>
                    {t("walletSetup.walletAddress", {
                      address:
                        request?.mode === "biometric-unlock"
                          ? `${request.address.slice(0, 6)}…${request.address.slice(-4)}`
                          : "",
                    })}
                  </Text>

                  {/* Reported right here rather than beside the restore form
                      further down: pressing this button when the key is
                      genuinely absent fails instantly, before any fingerprint
                      prompt can appear, so the message is the only feedback
                      there is. `loading` matters for the same reason — without
                      it the button had no visible reaction at all. */}
                  <AuthErrorNotice message={biometricError} style={{ marginBottom: 12 }} />

                  <AuthButton
                    icon="finger-print"
                    label={t("walletSetup.tryBiometrics")}
                    onPress={handleBiometricUnlockPress}
                    disabled={busy}
                    loading={busy}
                    accessibilityHint={t("walletSetup.tryBiometricsHint")}
                  />

                  <AuthDivider label={t("walletSetup.orRestoreIt")} />

                  <Text style={[authText.body, { marginBottom: 16 }]}>
                    {t("walletSetup.enterRecoveryPhrase")}
                  </Text>

                  <AuthField
                    label={t("walletSetup.recoveryPhraseLabel")}
                    value={restoreSecret}
                    onChangeText={setRestoreSecret}
                    placeholder={t("walletSetup.phrasePlaceholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    // Twelve words do not fit on one line, and RN ignores
                    // secureTextEntry on a multiline input anyway — so this one
                    // is visible by design rather than masked-but-not-really.
                    multiline
                    numberOfLines={2}
                    style={styles.secretInput}
                  />
                  {!!restoreSecretHint && (
                    <Text style={styles.inlineHint} accessibilityLiveRegion="polite">
                      {restoreSecretHint}
                    </Text>
                  )}
                  <AuthField
                    label={t("walletSetup.newWalletPasswordMin", { min: MIN_PASSWORD_LENGTH })}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("walletSetup.password")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    containerStyle={{ marginTop: 12 }}
                    trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  <AuthField
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder={t("walletSetup.confirmPassword")}
                    accessibilityLabel={t("walletSetup.confirmPassword")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    containerStyle={{ marginTop: 12 }}
                  />

                  <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

                  <AuthButton
                    variant="primary"
                    label={t("walletSetup.restoreThisWallet")}
                    onPress={handleRestoreSubmit}
                    disabled={!canSubmitRestore}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />

                  <Text style={[authText.caption, { marginTop: 16 }]}>
                    {t("walletSetup.noPhraseNoKey")}
                  </Text>

                  {/* Deliberately the last thing on the screen, and a text
                      button rather than a filled one: it must never read as
                      the way forward. Offered only in the two states nothing
                      can open — here, and web-passkey-sync above. The other
                      unlock states all still have a working key somewhere, and
                      a failed cloud read never reaches this screen at all. */}
                  {!!onResetWallet && (
                    <AuthTextButton
                      label={t("walletSetup.lostPhraseToo")}
                      onPress={enterResetReview}
                      disabled={busy}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </>
              )}
            </View>
          )}

          {mode === "restore" && request?.mode === "restore" && (
            <View>
              <Text style={[authText.body, { marginBottom: 12 }]}>
                {t("walletSetup.restoreMissing")}
              </Text>
              <View style={styles.summaryCard}>
                <Text style={[authText.caption, { marginBottom: 4 }]}>{t("walletSetup.profileWalletLabel")}</Text>
                <Text style={styles.summaryValue}>
                  {request.address.slice(0, 6)}…{request.address.slice(-4)}
                </Text>
              </View>
              {!!onConnectWallet && (
                <>
                  <AuthButton
                    variant="primary"
                    icon="wallet-outline"
                    label={t("walletSetup.connectWalletApp")}
                    onPress={handleConnectPress}
                    disabled={busy}
                    loading={busy}
                  />
                  <AuthDivider label={t("walletSetup.orRestoreIt")} />
                </>
              )}
              <AuthField
                label={t("walletSetup.recoveryPhraseLabel")}
                value={restoreSecret}
                onChangeText={setRestoreSecret}
                placeholder={t("walletSetup.phrasePlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                multiline
                numberOfLines={2}
                autoFocus
                style={styles.secretInput}
              />
              {!!restoreSecretHint && (
                <Text style={styles.inlineHint} accessibilityLiveRegion="polite">
                  {restoreSecretHint}
                </Text>
              )}
              {restoreNeedsPassword ? (
                <>
                  <AuthField
                    label={t("walletSetup.newWalletPasswordMin", { min: MIN_PASSWORD_LENGTH })}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("walletSetup.password")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    containerStyle={{ marginTop: 12 }}
                    trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  <AuthField
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder={t("walletSetup.confirmPassword")}
                    accessibilityLabel={t("walletSetup.confirmPassword")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    containerStyle={{ marginTop: 12 }}
                  />
                </>
              ) : (
                <Text style={[authText.caption, { marginTop: 12 }]}>
                  {t("walletSetup.restoreLocalNote")}
                </Text>
              )}
              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />
              <AuthButton
                variant="primary"
                label={t("walletSetup.restoreThisWallet")}
                onPress={handleRestoreSubmit}
                disabled={!canSubmitRestore}
                loading={busy}
                style={{ marginTop: 16 }}
              />
              <Text style={[authText.caption, { marginTop: 16 }]}>
                {t("walletSetup.noPhraseNoKey")}
              </Text>
              {!!onResetWallet && (
                <AuthTextButton
                  label={t("walletSetup.signOutAndStartOver")}
                  onPress={() => { void onResetWallet(); }}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                />
              )}
            </View>
          )}

          {mode === "unlock" && (
            <View>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                {unlockPasskeyOnly
                  ? t("walletSetup.unlockPasskeyOnly")
                  : t("walletSetup.unlockWithPasswordExplainer")}
              </Text>
              <AuthField
                label={t("walletSetup.walletPassword")}
                value={password}
                onChangeText={setPassword}
                placeholder={t("walletSetup.password")}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPw}
                textContentType="password"
                autoComplete="current-password"
                autoFocus
                trailing={<RevealToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
              />

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                icon="lock-open"
                label={t("walletSetup.unlock")}
                onPress={handleUnlockSubmit}
                disabled={!canSubmitPassword}
                loading={busy}
                style={{ marginTop: 16 }}
              />
              {busy && (
                <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                  {t("walletSetup.unlockingWallet")}
                </Text>
              )}
            </View>
          )}

          <AuthTextButton
            label={t("common.cancel")}
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
  // Two columns of numbered words: numbering is what makes a phrase
  // transcribable without losing your place, and what makes a wrong order
  // obvious when it is typed back in.
  phraseCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    borderRadius: AUTH_RADIUS,
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  phraseWord: {
    width: "50%",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  phraseIndex: {
    color: authColors.subtle,
    fontSize: 12,
    minWidth: 16,
    textAlign: "right",
  },
  phraseText: {
    color: authColors.label,
    fontSize: 15,
    fontWeight: "600",
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    marginTop: 12,
  },
  secretInput: {
    minHeight: 48,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  inlineHint: {
    color: authColors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  resetHeading: {
    color: authColors.label,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resetPoint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
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
