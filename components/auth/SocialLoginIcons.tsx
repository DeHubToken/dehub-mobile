import React from "react";
import { View, TouchableOpacity, ActivityIndicator, Text } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import EmailLoginFlow from "./EmailLoginFlow";

// Monochrome Google glyph (white)
const GOOGLE_ICON = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <g transform='translate(12 12) scale(1.5) translate(-12 -12)'>
    <path fill='#FFFFFF' d='M12.24 20c-4.37 0-7.24-2.96-7.24-7s2.96-7 7.33-7c1.97 0 3.37.55 4.7 1.68.24.2.27.5.07.74l-1.07 1.23c-.2.22-.44.24-.7.05-.83-.64-1.88-.98-3-.98-2.77 0-4.65 1.95-4.65 4.68 0 2.82 1.84 4.72 4.6 4.72 1.47 0 2.47-.37 3.46-1.25l.04-.03v-1.9h-2.62c-.29 0-.5-.21-.5-.5v-1.5c0-.29.21-.5.5-.5h4.9c.29 0 .5.21.5.5v3.66c0 .29-.11.53-.34.74C16.14 19.09 14.36 20 12.24 20Z'/>
  </g>
</svg>`;

const APPLE_ICON = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <path fill='#FFFFFF' d='M16.365 1.43c0 1.14-.462 2.15-1.217 2.905-.831.83-2.19 1.47-3.29 1.38-.135-1.09.42-2.24 1.16-2.98.83-.85 2.26-1.48 3.347-1.305ZM20.9 17.19c-.5 1.16-.74 1.68-1.39 2.7-.9 1.42-2.17 3.19-3.75 3.2-1.4.02-1.76-.92-3.66-.91-1.9.01-2.3.93-3.7.92-1.58-.02-2.78-1.62-3.68-3.03-2.53-3.96-2.8-8.6-1.24-11.07 1.11-1.76 2.86-2.79 4.51-2.79 1.68 0 2.73.94 4.12.94 1.35 0 2.16-.94 4.11-.94 1.47 0 3.03.8 4.14 2.18-3.64 2-3.05 7.21.55 8.8Z'/>
</svg>`;

interface SocialLoginIconsProps {
  onGoogle: () => void;
  onApple: () => void;
  onEmailSubmit: (email: string) => void;
  onConnectWallet?: () => void;
  busyProvider?: string; // 'google' | 'apple' | 'email' | 'wallet'
  disabled?: boolean;
}

const ComingSoonButton: React.FC<{ icon?: string; iconName?: any; label: string }> = ({
  icon,
  iconName,
  label,
}) => (
  <View
    className="flex-row items-center justify-center rounded-2xl bg-neutral-900 border border-neutral-800"
    style={{ width: "100%", height: 60, marginBottom: 12, opacity: 0.5 }}
  >
    {icon ? (
      <SvgXml xml={icon} width={20} height={20} style={{ marginRight: 10 }} />
    ) : iconName ? (
      <Ionicons name={iconName} size={20} color="#9CA3AF" style={{ marginRight: 10 }} />
    ) : null}
    <Text className="text-base font-medium text-gray-400 mr-2">{label}</Text>
    <View className="rounded-full bg-neutral-700 px-2 py-0.5">
      <Text className="text-[10px] text-gray-300">Coming Soon</Text>
    </View>
  </View>
);

export const SocialLoginIcons: React.FC<SocialLoginIconsProps> = ({
  onGoogle,
  onApple,
  onEmailSubmit,
  onConnectWallet,
  busyProvider,
  disabled,
}) => {
  return (
    <View className="flex-col items-center w-full">
      {/* Email — working */}
      <View className="w-full mb-3">
        <EmailLoginFlow
          onSubmit={(_provider, email) => {
            if (email) onEmailSubmit(email);
          }}
          loading={busyProvider === "email"}
          disabled={disabled}
        />
      </View>

      {/* Google — working */}
      <TouchableOpacity
        className="flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700"
        style={{ width: "100%", height: 60, marginBottom: 12 }}
        onPress={onGoogle}
        disabled={disabled}
        accessibilityLabel="Continue with Google"
      >
        {busyProvider === "google" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <SvgXml xml={GOOGLE_ICON} width={20} height={20} style={{ marginRight: 10 }} />
            <Text className="text-base font-medium text-white">Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Apple — working */}
      <TouchableOpacity
        className="flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700"
        style={{ width: "100%", height: 60, marginBottom: 12 }}
        onPress={onApple}
        disabled={disabled}
        accessibilityLabel="Continue with Apple"
      >
        {busyProvider === "apple" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <SvgXml xml={APPLE_ICON} width={20} height={20} style={{ marginRight: 10 }} />
            <Text className="text-base font-medium text-white">Continue with Apple</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Phone — same as web today: shown, disabled, "Coming Soon" */}
      <ComingSoonButton iconName="call" label="Continue with Phone" />

      {/* Connect Wallet — authenticate with an external wallet app (MetaMask,
          Trust Wallet, Coinbase Wallet, ...) via Reown/WalletConnect. */}
      {onConnectWallet && (
        <TouchableOpacity
          className="flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700"
          style={{ width: "100%", height: 60, marginBottom: 12 }}
          onPress={onConnectWallet}
          disabled={disabled}
          accessibilityLabel="Connect Wallet"
        >
          {busyProvider === "wallet" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="wallet" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
              <Text className="text-base font-medium text-white">Connect Wallet</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

export default SocialLoginIcons;
