import React, { useState } from "react";
import { TouchableOpacity, StyleSheet, Text, View, ActivityIndicator, Keyboard } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import EmailLoginFlow from "./EmailLoginFlow";
import PhoneLoginFlow from "./PhoneLoginFlow";
import PasskeyLoginFlow from "./PasskeyLoginFlow";
import ImportWalletModal from "./ImportWalletModal";
import { AuthButton, AuthTextButton, authColors, AUTH_DISABLED_OPACITY, AUTH_RADIUS } from "./AuthControls";
import { isWalletConnectAvailable } from "../../config/reown.config";
import { isPasskeyLoginAvailable } from "../../services/auth/passkeyAuth.service";

// Monochrome Google glyph — tinted at render time so it stays legible on both
// the white-glass secondary fill and (if ever reused) the light primary fill.
const googleIcon = (color: string) => `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <g transform='translate(12 12) scale(1.5) translate(-12 -12)'>
    <path fill='${color}' d='M12.24 20c-4.37 0-7.24-2.96-7.24-7s2.96-7 7.33-7c1.97 0 3.37.55 4.7 1.68.24.2.27.5.07.74l-1.07 1.23c-.2.22-.44.24-.7.05-.83-.64-1.88-.98-3-.98-2.77 0-4.65 1.95-4.65 4.68 0 2.82 1.84 4.72 4.6 4.72 1.47 0 2.47-.37 3.46-1.25l.04-.03v-1.9h-2.62c-.29 0-.5-.21-.5-.5v-1.5c0-.29.21-.5.5-.5h4.9c.29 0 .5.21.5.5v3.66c0 .29-.11.53-.34.74C16.14 19.09 14.36 20 12.24 20Z'/>
  </g>
</svg>`;

const appleIcon = (color: string) => `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <path fill='${color}' d='M16.365 1.43c0 1.14-.462 2.15-1.217 2.905-.831.83-2.19 1.47-3.29 1.38-.135-1.09.42-2.24 1.16-2.98.83-.85 2.26-1.48 3.347-1.305ZM20.9 17.19c-.5 1.16-.74 1.68-1.39 2.7-.9 1.42-2.17 3.19-3.75 3.2-1.4.02-1.76-.92-3.66-.91-1.9.01-2.3.93-3.7.92-1.58-.02-2.78-1.62-3.68-3.03-2.53-3.96-2.8-8.6-1.24-11.07 1.11-1.76 2.86-2.79 4.51-2.79 1.68 0 2.73.94 4.12.94 1.35 0 2.16-.94 4.11-.94 1.47 0 3.03.8 4.14 2.18-3.64 2-3.05 7.21.55 8.8Z'/>
</svg>`;

// Telegram's mark as one path, so it takes the row's tint like the other two
// rather than bringing its own blue into a monochrome sheet.
const telegramIcon = (color: string) => `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <path fill='${color}' d='M21.94 4.6 18.63 20.2c-.25 1.1-.9 1.38-1.83.86l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.14 9.36-8.46c.4-.36-.09-.56-.63-.2L6.01 13.67l-4.98-1.56c-1.08-.34-1.1-1.08.23-1.6l19.47-7.5c.9-.33 1.69.2 1.4 1.6Z'/>
</svg>`;

interface SocialLoginIconsProps {
  onGoogle: () => void;
  onApple: () => void;
  /**
   * Telegram sign-in remains visible when supplied. The sign-in action checks
   * the current bot configuration rather than hiding the option on a probe failure.
   */
  onTelegram?: () => void;
  /**
   * Passkey-only sign-in: the fingerprint/face passkey IS the account. The row
   * renders only when the platform can do passkeys (Android 9+ with Google
   * Play services, iOS 15+).
   */
  onPasskeySignIn?: () => void;
  onPasskeySignUp?: () => void;
  passkeyError?: string | null;
  passkeySuggestCreate?: boolean;
  onEmailSubmit: (email: string) => void;
  onEmailPasswordSubmit?: (email: string, password: string) => void;
  onPhoneSubmit: (phone: string) => void;
  onConnectWallet?: () => void;
  busyProvider?: string; // 'google' | 'apple' | 'email' | 'phone' | 'wallet' | 'passkey-signin' | 'passkey-signup'
  disabled?: boolean;
  /**
   * Passed straight to the two rows that expand into a text field. The host
   * screen owns the ScrollView, so only it can scroll a newly-revealed input
   * clear of the keyboard that input's own autoFocus just raised.
   */
  onFieldExpand?: (node: View | null) => void;
  /**
   * `stack` is the email-first sign-in (Shorts Stack): the email field open,
   * then round buttons for the rest (the host shows wallet options as links
   * via ImportWallet variant="links"). `list` is the original
   * one-row-per-provider stack.
   */
  layout?: "list" | "stack";
}

// Brand names stay as they are in every language.
const BRAND_NAMES = { google: "Google", apple: "Apple", telegram: "Telegram" } as const;

interface OptionDiscProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  renderIcon: (color: string, size: number) => React.ReactNode;
}

/** A square provider button with its label underneath. */
const OptionDisc: React.FC<OptionDiscProps> = ({ label, onPress, disabled, loading, active, renderIcon }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled, busy: !!loading, expanded: active }}
    hitSlop={6}
    activeOpacity={0.7}
    style={[styles.option, (disabled && !loading) && { opacity: AUTH_DISABLED_OPACITY }]}
  >
    <View style={[styles.disc, active && styles.discActive]}>
      {loading ? <ActivityIndicator size="small" color={authColors.label} /> : renderIcon(authColors.label, 22)}
    </View>
    <Text style={styles.optionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
  </TouchableOpacity>
);

/**
 * The sign-in option stack. Mirrors dehubweb's LoginModal main step: one
 * full-width white-glass row per provider, same height, same radius, same
 * 16pt label — previously Google/Apple/Wallet were `rounded-2xl bg-neutral-800`
 * at 60pt while Email sat next to them as `rounded-xl bg-white/10` with a 20pt
 * label.
 */
export const SocialLoginIcons: React.FC<SocialLoginIconsProps> = ({
  onGoogle,
  onApple,
  onTelegram,
  onPasskeySignIn,
  onPasskeySignUp,
  passkeyError,
  passkeySuggestCreate,
  onEmailSubmit,
  onPhoneSubmit,
  onConnectWallet,
  busyProvider,
  disabled,
  onFieldExpand,
  layout = "list",
}) => {
  const { t } = useTranslation();
  const passkeyReady = !!onPasskeySignIn && !!onPasskeySignUp && isPasskeyLoginAvailable();

  // The selected method replaces the email form above the provider row.
  const [openFlow, setOpenFlow] = useState<"phone" | "passkey" | "wallet" | null>(null);
  const toggleFlow = (flow: "phone" | "passkey" | "wallet") => {
    if (flow !== "phone" || openFlow === flow) Keyboard.dismiss();
    setOpenFlow((f) => (f === flow ? null : flow));
  };
  const [importVisible, setImportVisible] = useState(false);

  if (layout === "stack") {
    return (
      <View style={{ width: "100%", gap: 18 }}>
        <View style={{ minHeight: 124, gap: 8 }}>
        {openFlow !== null && (
          <AuthTextButton
            label={t("loginModal.continueEmail")}
            tone="muted"
            onPress={() => { Keyboard.dismiss(); setOpenFlow(null); }}
            disabled={disabled}
          />
        )}
        {openFlow === null && <EmailLoginFlow
          startOpen
          onSubmit={(_provider, email) => {
            if (email) onEmailSubmit(email);
          }}
          loading={busyProvider === "email"}
          disabled={disabled}
          onExpand={onFieldExpand}
        />}
        {openFlow === "phone" && (
          <PhoneLoginFlow startOpen onSubmit={onPhoneSubmit} loading={busyProvider === "phone"} disabled={disabled} onExpand={onFieldExpand} />
        )}
        {openFlow === "wallet" && (
          <View style={{ gap: 10 }}>
            {onConnectWallet && isWalletConnectAvailable && (
              <AuthButton icon="wallet" label={t("loginModal.connectWallet", "Connect Wallet")} onPress={onConnectWallet} disabled={disabled} loading={busyProvider === "wallet"} />
            )}
            <AuthButton icon="key" label={t("auth.importWallet", "Import Wallet")} onPress={() => setImportVisible(true)} disabled={disabled} />
          </View>
        )}
        {openFlow === "passkey" && passkeyReady && (
          <PasskeyLoginFlow startOpen compact onSignIn={onPasskeySignIn!} onSignUp={onPasskeySignUp!} busy={busyProvider === "passkey-signin" ? "signin" : busyProvider === "passkey-signup" ? "signup" : null} disabled={disabled} error={passkeyError} suggestCreate={passkeySuggestCreate} />
        )}
        </View>

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>{t("loginStack.orContinueWith", "or continue with")}</Text>
          <View style={styles.rule} />
        </View>

        <View style={styles.row}>
          <OptionDisc
            label={BRAND_NAMES.google}
            onPress={onGoogle}
            disabled={disabled}
            loading={busyProvider === "google"}
            renderIcon={(c, sz) => <SvgXml xml={googleIcon("currentColor")} color={c} width={sz} height={sz} />}
          />
          <OptionDisc
            label={BRAND_NAMES.apple}
            onPress={onApple}
            disabled={disabled}
            loading={busyProvider === "apple"}
            renderIcon={(c, sz) => <SvgXml xml={appleIcon("currentColor")} color={c} width={sz} height={sz} />}
          />
          <OptionDisc
            label={t("loginStack.phone", "Phone")}
            onPress={() => toggleFlow("phone")}
            disabled={disabled}
            loading={busyProvider === "phone"}
            active={openFlow === "phone"}
            renderIcon={(c, sz) => <Ionicons name="call" color={c} size={sz - 2} />}
          />
          {passkeyReady && (
            <OptionDisc
              label={t("loginStack.fingerprint", "Bio")}
              onPress={() => toggleFlow("passkey")}
              disabled={disabled}
              loading={busyProvider === "passkey-signin" || busyProvider === "passkey-signup"}
              active={openFlow === "passkey"}
              renderIcon={(c, sz) => <Ionicons name="finger-print" color={c} size={sz} />}
            />
          )}
          {onTelegram && (
            <OptionDisc
              label={BRAND_NAMES.telegram}
              onPress={onTelegram}
              disabled={disabled}
              loading={busyProvider === "telegram"}
              renderIcon={(c, sz) => <SvgXml xml={telegramIcon("currentColor")} color={c} width={sz} height={sz} />}
            />
          )}
          {/* One way in for every wallet: connect one or import a key, both
              under this button. */}
          <OptionDisc
            label={t("nav.wallet", "Wallet")}
            onPress={() => toggleFlow("wallet")}
            disabled={disabled}
            loading={busyProvider === "wallet"}
            active={openFlow === "wallet"}
            renderIcon={(c, sz) => <Ionicons name="wallet" color={c} size={sz - 2} />}
          />
        </View>

        <ImportWalletModal visible={importVisible} onClose={() => setImportVisible(false)} />
      </View>
    );
  }

  return (
    <View style={{ width: "100%", gap: 12 }}>
      <EmailLoginFlow
        onSubmit={(_provider, email) => {
          if (email) onEmailSubmit(email);
        }}
        loading={busyProvider === "email"}
        disabled={disabled}
        onExpand={onFieldExpand}
      />

      {passkeyReady && (
        <PasskeyLoginFlow
          onSignIn={onPasskeySignIn!}
          onSignUp={onPasskeySignUp!}
          busy={busyProvider === "passkey-signin" ? "signin" : busyProvider === "passkey-signup" ? "signup" : null}
          disabled={disabled}
          error={passkeyError}
          suggestCreate={passkeySuggestCreate}
        />
      )}

      <AuthButton
        label={t("loginModal.continueGoogle", "Continue with Google")}
        onPress={onGoogle}
        disabled={disabled}
        loading={busyProvider === "google"}
        renderIcon={(color, size) => (
          <SvgXml xml={googleIcon(color)} width={size} height={size} />
        )}
      />

      <AuthButton
        label={t("loginModal.continueApple", "Continue with Apple")}
        onPress={onApple}
        disabled={disabled}
        loading={busyProvider === "apple"}
        renderIcon={(color, size) => (
          <SvgXml xml={appleIcon(color)} width={size} height={size} />
        )}
      />

      {onTelegram && (
        <AuthButton
          label={t("loginModal.continueTelegram", "Continue with Telegram")}
          onPress={onTelegram}
          disabled={disabled}
          loading={busyProvider === "telegram"}
          renderIcon={(color, size) => (
            <SvgXml xml={telegramIcon(color)} width={size} height={size} />
          )}
        />
      )}

      <PhoneLoginFlow
        onSubmit={onPhoneSubmit}
        loading={busyProvider === "phone"}
        disabled={disabled}
        onExpand={onFieldExpand}
      />

      {/* Connect Wallet — authenticate with an external wallet app (MetaMask,
          Trust Wallet, Coinbase Wallet, ...) via Reown/WalletConnect. Hidden
          when AppKit could not be configured (missing REOWN_PROJECT_ID, bad
          chain list): reown.config no longer takes the whole app down over
          that, so the button has to answer for itself rather than open a sheet
          that can never connect. */}
      {onConnectWallet && isWalletConnectAvailable && (
        <AuthButton
          icon="wallet"
          label={t("loginModal.connectWallet", "Connect Wallet")}
          onPress={onConnectWallet}
          disabled={disabled}
          loading={busyProvider === "wallet"}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: authColors.hairline },
  dividerText: { color: authColors.subtle, fontSize: 12, fontWeight: "500" },
  row: { width: "100%", flexDirection: "row", gap: 8 },
  option: { flex: 1, alignItems: "center", gap: 6, minWidth: 0 },
  disc: {
    width: "100%",
    maxWidth: 48,
    aspectRatio: 1,
    borderRadius: AUTH_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.border,
  },
  discActive: { backgroundColor: authColors.surfacePressed, borderColor: authColors.label },
  optionLabel: { color: authColors.label, fontSize: 11, fontWeight: "600" },
});

export default SocialLoginIcons;
