import React from "react";
import { Pressable, Text, View } from "react-native";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { isLightToneOn } from "../../libs/jsx/tone";

export interface PollDurationOption {
  label: string;
  hours: number;
}

interface Props {
  options: PollDurationOption[];
  value: number;
  onChange: (hours: number) => void;
}

/**
 * Poll length chips for the composer and DM polls. Idle chips take the theme's
 * control material; the picked one is a solid white pill with a tick (ink on
 * light themes) so it is obvious which length is set.
 */
function PollDurationChips({ options, value, onChange }: Props) {
  const { isLight: themeIsLight } = useAppTheme();
  // System Light keeps the dark palette and flips it on the way out; the
  // picked chip opts out of that pass (dark-surface) and picks its own ink.
  const lightTone = isLightToneOn();
  const isLight = themeIsLight && !lightTone;
  const pickedFill = themeIsLight || lightTone ? "#111114" : "#FFFFFF";
  const pickedInk = themeIsLight || lightTone ? "#FFFFFF" : "#09090B";
  const idleFill = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
  const idleEdge = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
  const idleInk = isLight ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((d) => {
        const selected = value === d.hours;
        return (
          <Pressable
            key={d.hours}
            onPress={() => onChange(d.hours)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={4}
            // The theme's control material repaints neutral chips, which made
            // the picked one look like the rest; dark-surface keeps it solid.
            className={selected ? "dark-surface" : undefined}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selected ? pickedFill : idleEdge,
              backgroundColor: selected ? pickedFill : idleFill,
            }}
          >
            {selected && <Icon name="Check" size={12} color={pickedInk} />}
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: selected ? pickedInk : idleInk,
              }}
            >
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default React.memo(PollDurationChips);
