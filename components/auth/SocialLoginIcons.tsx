import React, { useMemo } from "react";
import { View, TouchableOpacity, ActivityIndicator } from "react-native";
import { SvgXml } from "react-native-svg";

// Explicitly define supported providers (keys must match the provider id used by Web3Auth config)
export type SocialProvider = "google" | "twitter" | "discord";

interface SocialLoginIconsProps {
  onPress: (provider: SocialProvider) => void;
  busyProvider?: string; // provider currently performing login
  disabled?: boolean;
  providers?: SocialProvider[]; // optional override (defaults to ['google','twitter'])
}

// Monochrome Google glyph (white) enlarged to visually match X
const GOOGLE_ICON = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <g transform='translate(12 12) scale(1.5) translate(-12 -12)'>
    <path fill='#FFFFFF' d='M12.24 20c-4.37 0-7.24-2.96-7.24-7s2.96-7 7.33-7c1.97 0 3.37.55 4.7 1.68.24.2.27.5.07.74l-1.07 1.23c-.2.22-.44.24-.7.05-.83-.64-1.88-.98-3-.98-2.77 0-4.65 1.95-4.65 4.68 0 2.82 1.84 4.72 4.6 4.72 1.47 0 2.47-.37 3.46-1.25l.04-.03v-1.9h-2.62c-.29 0-.5-.21-.5-.5v-1.5c0-.29.21-.5.5-.5h4.9c.29 0 .5.21.5.5v3.66c0 .29-.11.53-.34.74C16.14 19.09 14.36 20 12.24 20Z'/>
  </g>
</svg>`;

// X (Twitter) monochrome icon scaled into 24x24 via transform for consistent visual size
const X_ICON = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' aria-label='X logo'>
  <g transform='scale(1.5)'>
    <path fill='#FFFFFF' d='M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z'/>
  </g>
</svg>`;

const DISCORD_ICON = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <g transform='translate(12 12) scale(1.35) translate(-12 -12)'>
    <path fill='#FFFFFF' d='M18.59 5.89C17.36 5.32 16.05 4.9 14.67 4.66c-.17.3-.37.71-.5 1.04a12.09 12.09 0 0 0-4.34 0c-.14-.33-.34-.74-.5-1.04A15.38 15.38 0 0 0 5.4 5.89c-2.48 3.74-3.16 7.39-2.82 10.98 1.65 1.23 3.25 1.97 4.81 2.48.39-.53.73-1.09 1.03-1.69-.56-.2-1.09-.45-1.6-.75.14-.11.27-.22.4-.33 3.13 1.46 6.51 1.46 9.6 0 .13.11.26.22.4.33-.5.3-1.04.55-1.6.75.3.6.64 1.16 1.03 1.69 1.56-.51 3.16-1.25 4.82-2.48.37-4.17-.68-7.78-2.83-10.98ZM8.84 14.67a1.95 1.95 0 1 1 0-3.88 1.95 1.95 0 0 1 0 3.88Zm6.31 0a1.95 1.95 0 1 1 0-3.88 1.95 1.95 0 0 1 0 3.88Z'/>
  </g>
</svg>`;

const ICON_MAP: Record<SocialProvider, string> = {
  google: GOOGLE_ICON,
  twitter: X_ICON,
  discord: DISCORD_ICON,
};

export const SocialLoginIcons: React.FC<SocialLoginIconsProps> = ({
  onPress,
  busyProvider,
  disabled,
  providers = ["google", "twitter", "discord"],
}) => {
  const items = useMemo(
    () => providers.filter((p) => ICON_MAP[p]),
    [providers]
  );

  return (
    <View className="flex-row justify-center flex-wrap mt-2">
      {items.map((provider) => {
        const busy = !!busyProvider && busyProvider === provider;
        return (
          <TouchableOpacity
            key={provider}
            accessibilityLabel={`Sign in with ${
              provider === "twitter" ? "X" : "Google"
            }`}
            accessibilityRole="button"
            className={`border border-gray-600 bg-transparent rounded-lg m-2 w-14 h-14 items-center justify-center ${
              disabled ? "opacity-50" : ""
            }`}
            disabled={disabled}
            onPress={() => onPress(provider)}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <SvgXml xml={ICON_MAP[provider]} width={24} height={24} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default SocialLoginIcons;
