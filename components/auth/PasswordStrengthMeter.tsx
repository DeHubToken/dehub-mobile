import React, { memo } from "react";
import { View, Text } from "react-native";
import type { PasswordAssessment } from "../../libs/wallet-core/passwordStrength";

export interface PasswordStrengthMeterProps {
  assessment: PasswordAssessment | null;
}

// Weak to strong as a brightness ramp — the meter used to run red→green,
// which the design system keeps off every surface.
const BAR_COLORS = ["#52525B", "#71717A", "#A1A1AA", "#D4D4D8", "#FAFAFA"];

const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = memo(({ assessment }) => {
  if (!assessment) return null;
  const { score, label, warnings, breached } = assessment;
  const color = BAR_COLORS[score];

  return (
    <View className="mt-2">
      <View className="flex-row" style={{ gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= score - 1 || (score === 0 && i === 0) ? color : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </View>
      <Text className="text-xs mt-1" style={{ color }}>
        {label}
      </Text>
      {breached === true && (
        <Text className="text-white/80 text-xs mt-1">
          This password has appeared in a data breach — choose a different one
        </Text>
      )}
      {warnings.length > 0 && breached !== true && (
        <Text className="text-theme-neutrals-500 text-xs mt-1">{warnings[0]}</Text>
      )}
    </View>
  );
});

PasswordStrengthMeter.displayName = "PasswordStrengthMeter";
export default PasswordStrengthMeter;
