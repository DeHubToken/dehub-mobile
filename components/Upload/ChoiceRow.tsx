/**
 * One post option as a single row: icon, title, switch. Off keeps the open
 * default (shown greyed after the title); on picks the first narrower choice
 * and shows every narrower choice as a button under the row. Same as web's
 * ChoiceRow in PostAccessToggles.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import CustomSwitch from "../ui/CustomSwitch";

interface Props<T extends string> {
  icon: IconName;
  label: string;
  value: T;
  offValue: T;
  offLabel: string;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}

export default function ChoiceRow<T extends string>({ icon, label, value, offValue, offLabel, options, onChange, hint }: Props<T>) {
  const on = value !== offValue;
  return (
    <View className="py-3">
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onChange(on ? offValue : options[0].value)}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center flex-1 mr-3">
          <Icon name={icon} size={18} color="#fff" />
          <Text className="text-white text-sm ml-3">{label}</Text>
          {!on ? (
            <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1" numberOfLines={1}>({offLabel})</Text>
          ) : null}
        </View>
        <CustomSwitch value={on} onValueChange={(next: boolean) => onChange(next ? options[0].value : offValue)} />
      </TouchableOpacity>
      {on ? (
        <View className="flex-row flex-wrap mt-2 ml-7" accessibilityRole="radiogroup">
          {options.map((o) => (
            <TouchableOpacity
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === o.value }}
              className={`mr-1 mb-1 flex-row items-center rounded-lg px-2.5 py-1 border ${value === o.value ? "bg-white/10 border-white/70" : "border-white/10"}`}
            >
              {value === o.value ? <Icon name="Check" size={12} color="#fff" /> : null}
              <Text className={`text-xs ${value === o.value ? "text-white font-semibold ml-1" : "text-white/60"}`}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {on && hint ? <Text className="text-theme-neutrals-400 text-xs mt-1 ml-7">{hint}</Text> : null}
    </View>
  );
}
