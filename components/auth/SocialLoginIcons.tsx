import React from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import EmailLoginFlow from "./EmailLoginFlow";
import PhoneLoginFlow from "./PhoneLoginFlow";
import { AuthButton } from "./AuthControls";
import { isWalletConnectAvailable } from "../../config/reown.config";

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

interface SocialLoginIconsProps {
  onGoogle: () => void;
  onApple: () => void;
  onEmailSubmit: (email: string) => void;
  onPhoneSubmit: (phone: string) => void;
  onConnectWallet?: () => void;
  busyProvider?: string; // 'google' | 'apple' | 'email' | 'phone' | 'wallet'
  disabled?: boolean;
  /**
   * Passed straight to the two rows that expand into a text field. The host
   * screen owns the ScrollView, so only it can scroll a newly-revealed input
   * clear of the keyboard that input's own autoFocus just raised.
   */
  onFieldExpand?: (node: View | null) => void;
}

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
  onEmailSubmit,
  onPhoneSubmit,
  onConnectWallet,
  busyProvider,
  disabled,
  onFieldExpand,
}) => {
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

      <AuthButton
        label="Continue with Google"
        onPress={onGoogle}
        disabled={disabled}
        loading={busyProvider === "google"}
        renderIcon={(color, size) => (
          <SvgXml xml={googleIcon(color)} width={size} height={size} />
        )}
      />

      <AuthButton
        label="Continue with Apple"
        onPress={onApple}
        disabled={disabled}
        loading={busyProvider === "apple"}
        renderIcon={(color, size) => (
          <SvgXml xml={appleIcon(color)} width={size} height={size} />
        )}
      />

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
          label="Connect Wallet"
          onPress={onConnectWallet}
          disabled={disabled}
          loading={busyProvider === "wallet"}
        />
      )}
    </View>
  );
};

export default SocialLoginIcons;
