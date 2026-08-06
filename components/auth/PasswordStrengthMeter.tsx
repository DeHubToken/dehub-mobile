import React, { memo } from "react";
import { View, Text } from "react-native";
import type { PasswordAssessment } from "../../libs/wallet-core/passwordStrength";

export interface PasswordStrengthMeterProps {
  assessment: PasswordAssessment | null;
}

const BAR_COLORS = ["#EF4444", "#F97316", "#EAB308", "#84CC16", "#22C55E"];

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
              backgroundColor: i <= score - 1 || (score === 0 && i === 0) ? color : "#374151",
            }}
          />
        ))}
      </View>
      <Text className="text-xs mt-1" style={{ color }}>
        {label}
      </Text>
      {breached === true && (
        <Text className="text-red-400 text-xs mt-1">
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
