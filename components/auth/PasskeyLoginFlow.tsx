import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { AuthButton, authColors } from "./AuthControls";

interface PasskeyLoginFlowProps {
  onSignIn: () => void;
  onSignUp: () => void;
  /** Which of the two is in flight, if either. */
  busy?: "signin" | "signup" | null;
  disabled?: boolean;
  /** Inline message from the last attempt, e.g. "no account on that passkey". */
  error?: string | null;
  /**
   * The last sign-in found a passkey with no account behind it — lead with
   * "create one" so the obvious next tap is the right one.
   */
  suggestCreate?: boolean;
}

/**
 * The fingerprint row of the sign-in stack. Collapsed it is one row like the
 * others; tapped, it opens into the two things a passkey can do — sign in
 * with one that exists, or make a new account from a new one — because the
 * OS sheet cannot tell us which the person meant, and a device with no DeHub
 * passkey yet shows an empty picker if we only ever ask to sign in.
 *
 * Mirrors dehubweb's 'passkey' login step.
 */
const PasskeyLoginFlow: React.FC<PasskeyLoginFlowProps> = ({
  onSignIn,
  onSignUp,
  busy,
  disabled,
  error,
  suggestCreate,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <AuthButton
        icon="finger-print"
        label={t("loginModal.continuePasskey", "Continue with fingerprint")}
        onPress={() => setOpen(true)}
        disabled={disabled}
        loading={!!busy}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.intro}>
        {t("loginModal.passkeyIntro", "Your fingerprint or face is your account. Nothing to remember, nothing to type.")}
      </Text>
      <AuthButton
        variant={suggestCreate ? "secondary" : "primary"}
        icon="finger-print"
        label={t("loginModal.passkeySignIn", "Sign in with fingerprint")}
        onPress={onSignIn}
        disabled={disabled}
        loading={busy === "signin"}
      />
      <AuthButton
        variant={suggestCreate ? "primary" : "secondary"}
        icon="finger-print"
        label={t("loginModal.passkeyCreate", "Create a new account")}
        onPress={onSignUp}
        disabled={disabled}
        loading={busy === "signup"}
      />
      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Text style={styles.hint}>
        {t(
          "loginModal.passkeyBackupHint",
          "Your account lives in this device's passkey. On most phones it syncs with your Google or Apple account, and you can add a password backup in Settings.",
        )}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  intro: {
    fontSize: 14,
    color: authColors.label,
  },
  error: {
    fontSize: 13,
    color: "#f87171",
  },
  hint: {
    fontSize: 12,
    color: authColors.label,
    opacity: 0.7,
  },
});

export default PasskeyLoginFlow;
