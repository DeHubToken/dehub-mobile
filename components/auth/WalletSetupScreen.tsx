import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
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
}

/** Shared reveal toggle for every password field on this screen. */
const RevealToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({ shown, onToggle }) => (
  <AuthIconButton
    icon={shown ? "eye-off-outline" : "eye-outline"}
    onPress={onToggle}
    accessibilityLabel={shown ? "Hide password" : "Show password"}
  />
);

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
    const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "this wallet";
    const hasOtherWayIn = !!otherCopies && (otherCopies.recovery || otherCopies.passkeys > 0);

    if (!otherCopies) {
      return (
        <View>
          <Text style={[authText.body, { marginBottom: 16 }]}>
            Checking whether you have any other way back into this wallet…
          </Text>
          <ActivityIndicator color={authColors.label} style={{ marginVertical: 16 }} />
          {/* Both probe reads are un-timed Supabase queries, so this can sit
              here a while. Without its own way back, the only exit is the
              screen-level Cancel — which closes the whole sheet and, on the
              biometric-unlock route, wipes a half-typed recovery phrase that
              exitResetReview deliberately preserves. */}
          <AuthTextButton label="Go back" onPress={onBack} />
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
            You may still be able to get this wallet back
          </Text>
          {otherCopies.recovery && (
            <Text style={[authText.body, { marginBottom: 12 }]}>
              This account has a <Text style={authText.emphasis}>recovery record</Text> from
              dehub.io. The 24-word recovery code you were given still opens this wallet. Open
              dehub.io on a computer, sign in the same way and with the same account, and use that
              code — it brings the wallet, and your account, back exactly as they were.
            </Text>
          )}
          {n > 0 && (
            <Text style={[authText.body, { marginBottom: 12 }]}>
              This account has {n} passkey unlock{n === 1 ? "" : "s"} registered on dehub.io. In the
              browser that holds {n === 1 ? "it" : "one of them"}, dehub.io can still open this
              wallet.
            </Text>
          )}
          <AuthButton
            variant="primary"
            icon="open-outline"
            label="Open dehub.io"
            onPress={() => openInApp(WEBSITE_LINK)}
            style={{ marginTop: 4 }}
          />
          <AuthTextButton
            label="That's gone too — start over anyway"
            onPress={onOverride}
            style={{ marginTop: 8 }}
          />
          <AuthTextButton label="Go back" onPress={onBack} tone="muted" />
        </View>
      );
    }

    return (
      <View>
        <Text style={[authText.body, { marginBottom: 16 }]}>
          This gives your sign-in a brand-new, empty wallet. It does not open the old one — this
          phone can&apos;t, dehub.io can&apos;t, and neither can we.
        </Text>

        {otherCopies.failed && (
          <View style={{ marginBottom: 16 }}>
            <AuthErrorNotice message="Couldn't check whether you have other ways back into this wallet. If you ever set up a recovery code or a passkey on dehub.io, go and try that first — continuing here clears them." />
          </View>
        )}

        <Text style={styles.resetHeading}>What you lose</Text>
        <ResetPoint
          tone="lose"
          head="Your DeHub account."
          body="Posts, comments, followers, tips and token balances all belong to the old wallet's address. They stay with it. You start again on an empty profile."
        />
        <ResetPoint
          tone="lose"
          head="Your username."
          body="The old account isn't deleted — it keeps existing under its own name, so that name stays taken and you can't pick it again."
        />
        <ResetPoint
          tone="lose"
          head="The way back in."
          body="From now on your sign-in opens the new account, and stops opening the old one."
        />
        {/* Gated on "might exist", not on "we know it exists". The reset
            clears both tables either way, so when the probe couldn't read
            them the honest line is that we don't know and are clearing them
            regardless — saying nothing would let a user with a recovery code
            proceed believing the list was complete. */}
        {(otherCopies.recovery || otherCopies.failed) && (
          <ResetPoint
            tone="lose"
            head="Your recovery code."
            body={
              otherCopies.recovery
                ? "The recovery record on dehub.io is cleared as part of this, so that route closes too."
                : "If you ever set up a 24-word recovery code on dehub.io, it is cleared as part of this. We couldn't check whether you have one."
            }
          />
        )}
        {(otherCopies.passkeys > 0 || otherCopies.failed) && (
          <ResetPoint
            tone="lose"
            head="Your passkey unlocks."
            body={
              otherCopies.passkeys > 0
                ? "The passkeys registered on dehub.io are removed as part of this."
                : "Any passkeys registered on dehub.io are removed as part of this. We couldn't check whether you have any."
            }
          />
        )}

        <Text style={[styles.resetHeading, { marginTop: 16 }]}>What this does not do</Text>
        <ResetPoint
          tone="keep"
          head="It doesn't touch what the old wallet holds."
          body={`Everything in it stays at ${short} on the blockchain. Nothing is spent, burned or taken.`}
        />
        <ResetPoint
          tone="keep"
          head="It doesn't close that door forever."
          body="If you ever find that wallet's 12-word phrase or its private key, you can import it here — or into any other wallet app — and reach what's in it again."
        />
        <ResetPoint
          tone="keep"
          head="It doesn't touch the device you set it up on."
          body="A phone keeps its own copy of the key while DeHub is installed, and a browser keeps its passkey. If you still have either, go there and export the private key before you continue."
        />
        <ResetPoint
          tone="keep"
          head="It doesn't change how you sign in."
          body="Same login, same one tap."
        />

        <Text style={[authText.caption, { marginTop: 16 }]}>Wallet being left behind: {short}</Text>

        <TouchableOpacity
          onPress={onToggleAcknowledged}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel="I understand the old wallet and its account will be out of reach"
          style={styles.ackRow}
        >
          <Ionicons
            name={acknowledged ? "checkbox" : "square-outline"}
            size={22}
            color={acknowledged ? authColors.label : authColors.muted}
          />
          <Text style={[authText.body, { flex: 1, color: authColors.label }]}>
            I understand the old wallet and its DeHub account will be out of my reach for good
          </Text>
        </TouchableOpacity>

        <AuthField
          label="Type RESET to confirm"
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
          label="Reset and create a new wallet"
          onPress={onConfirm}
          disabled={!canReset}
          loading={busy}
          style={{ marginTop: 16 }}
        />
        <AuthTextButton label="Go back" onPress={onBack} disabled={busy} />
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
  }) => {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        setError(e?.message || "Could not secure your wallet");
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
        setError(e?.message || "Could not finish signing in");
      } finally {
        setBusy(false);
      }
    }, [busy, phraseAcknowledged, onCreateConfirmed, reset]);

    const handleCopyPhrase = useCallback(async () => {
      if (!recoveryPhrase) return;
      try {
        await Clipboard.setStringAsync(recoveryPhrase);
        setError(null);
      } catch {
        setError("Could not copy — write the words down instead.");
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
        return "That doesn't check out as a recovery phrase — 12 words, in the order they were shown, all lowercase.";
      }
      if (/^(0x)?[0-9a-fA-F]+$/.test(normalizedRestoreSecret)) {
        return "A private key is 64 hex characters after the 0x.";
      }
      return null;
    }, [normalizedRestoreSecret, restoreSecretValid]);

    const canSubmitRestore =
      restoreSecretValid && password.length >= MIN_PASSWORD_LENGTH && password === confirm;

    const handleRestoreSubmit = useCallback(async () => {
      if (!canSubmitRestore || busy || !onSwitchAccount) return;
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
        await onSwitchAccount(normalizedRestoreSecret, password);
        reset();
      } catch (e: any) {
        setError(e?.message || "Could not restore this wallet");
      } finally {
        setBusy(false);
      }
    }, [canSubmitRestore, busy, onSwitchAccount, normalizedRestoreSecret, password, reset]);

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
        await requireDeviceOwner("Confirm you want to start over with a new wallet");
        await onResetWallet();
      } catch (e: any) {
        setError(
          e instanceof BiometricRejectedError
            ? "Device check cancelled — nothing was changed."
            : e?.message || "Could not start over. Nothing was changed."
        );
      } finally {
        setBusy(false);
      }
    }, [canReset, busy, onResetWallet]);

    const title =
      recoveryPhrase
        ? "Save your recovery phrase"
        : resetStage === "review"
        ? "Start over with a new wallet"
        : mode === "create" && request?.mode === "create" && request.replacing
        ? "Secure your new wallet"
        : mode === "create"
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
                Your wallet will be protected by this phone&apos;s biometrics. That unlock{" "}
                <Text style={authText.emphasis}>only works on this phone</Text> — these 12 words
                are the only way back in if you reinstall DeHub, switch handset, or lose it.
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
                label="Copy phrase"
                onPress={handleCopyPhrase}
                disabled={busy}
                style={{ marginTop: 12 }}
              />

              <Text style={[authText.caption, { marginTop: 12 }]}>
                Write them down somewhere only you can reach. Anyone who has these words has your
                wallet — DeHub support cannot recover them and cannot reset them.
              </Text>

              <TouchableOpacity
                onPress={() => setPhraseAcknowledged((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: phraseAcknowledged }}
                accessibilityLabel="I have saved my recovery phrase"
                style={styles.ackRow}
              >
                <Ionicons
                  name={phraseAcknowledged ? "checkbox" : "square-outline"}
                  size={22}
                  color={phraseAcknowledged ? authColors.label : authColors.muted}
                />
                <Text style={[authText.body, { flex: 1, color: authColors.label }]}>
                  I&apos;ve saved these 12 words somewhere safe
                </Text>
              </TouchableOpacity>

              <AuthErrorNotice message={error} style={{ marginTop: 12 }} />

              <AuthButton
                variant="primary"
                label="Create my wallet"
                onPress={handlePhraseAcknowledged}
                disabled={!phraseAcknowledged}
                loading={busy}
                style={{ marginTop: 16 }}
              />
              {busy && (
                <Text style={[authText.caption, { marginTop: 12, textAlign: "center" }]}>
                  Creating your wallet and signing you in…
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
                      Unlock with your fingerprint or face — nothing to type or remember. The key
                      stays on this phone, so we&apos;ll show you a 12-word recovery phrase to write
                      down; it is the only way back in from another handset, from the website, or
                      after reinstalling. Pick Password instead and the password itself does that
                      job.
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
                This account has a wallet address on file, but no backup this phone can use — either
                it was protected with{" "}
                <Text style={authText.emphasis}>biometrics or a passkey on the web</Text> (that
                unlock stays in the browser and does not sync here), or an earlier sign-up on this
                phone was interrupted before it finished.
              </Text>
              <Text style={[authText.body, { marginBottom: 20 }]}>
                If you have used dehub.io before, open it on your computer, sign in the same way and
                with the same account, and <Text style={authText.emphasis}>add a wallet password</Text>{" "}
                — that saves an encrypted backup to the cloud. Then come back here and try again.
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
              {!!onResetWallet && (
                <AuthTextButton
                  label="Never used dehub.io — start over"
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
                    This wallet unlocks with{" "}
                    <Text style={authText.emphasis}>biometrics held on one specific device</Text> —
                    the phone or browser it was set up on. This phone doesn&apos;t have that key,
                    and neither does dehub.io: the key never leaves the device that made it.
                  </Text>
                  <Text style={[authText.caption, { marginBottom: 20 }]}>
                    Wallet: {request?.mode === "biometric-unlock"
                      ? `${request.address.slice(0, 6)}…${request.address.slice(-4)}`
                      : ""}
                  </Text>

                  <AuthButton
                    icon="finger-print"
                    label="Try biometrics on this phone"
                    onPress={handleBiometricUnlockPress}
                    disabled={busy}
                    accessibilityHint="Use this if you set this wallet up on this phone and it should already have the key"
                  />

                  <AuthDivider label="or restore it" />

                  <Text style={[authText.body, { marginBottom: 16 }]}>
                    Enter the 12-word recovery phrase you saved when you created this wallet (or its
                    private key, if you exported one). It goes back to the same account, and the
                    password you set below becomes a backup that works everywhere from now on.
                  </Text>

                  <AuthField
                    label="Recovery phrase or private key"
                    value={restoreSecret}
                    onChangeText={setRestoreSecret}
                    placeholder="12 words, or 0x…"
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
                    label={`New wallet password (min ${MIN_PASSWORD_LENGTH} chars)`}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    containerStyle={{ marginTop: 12 }}
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
                    label="Restore this wallet"
                    onPress={handleRestoreSubmit}
                    disabled={!canSubmitRestore}
                    loading={busy}
                    style={{ marginTop: 16 }}
                  />

                  <Text style={[authText.caption, { marginTop: 16 }]}>
                    No phrase and no key? Then this wallet can only be opened from the device that
                    set it up — nothing on the website or on our side can recover it. Sign in on
                    that device if you still have it.
                  </Text>

                  {/* Deliberately the last thing on the screen, and a text
                      button rather than a filled one: it must never read as
                      the way forward. Offered only in the two states nothing
                      can open — here, and web-passkey-sync above. The other
                      unlock states all still have a working key somewhere, and
                      a failed cloud read never reaches this screen at all. */}
                  {!!onResetWallet && (
                    <AuthTextButton
                      label="I've lost the phrase too — start over"
                      onPress={enterResetReview}
                      disabled={busy}
                      style={{ marginTop: 8 }}
                    />
                  )}
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
