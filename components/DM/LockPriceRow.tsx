/**
 * "Lock photo" for a photo or video about to go out in a DM: off by default,
 * one tap turns it on at 25 DHB with quick prices beside it.
 */
import React, { memo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";

export const LOCK_QUICK_PRICES = [5, 25, 100];
const MIN = 1;
const MAX = 1_000_000;

interface Props {
  value?: number | null;
  onChange: (price: number | null) => void;
  kind: "image" | "video";
}

function LockPriceRowInner({ value, onChange, kind }: Props) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState("");
  const on = !!value;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 ${active ? "bg-white/25" : "bg-white/[0.08]"}`;

  return (
    <View className="mt-2">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Pressable
          onPress={() => { setCustom(""); onChange(on ? null : LOCK_QUICK_PRICES[1]); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          className={`flex-row items-center gap-1 rounded-full px-3 py-1 border ${on ? "bg-white border-white" : "border-white/20 bg-white/[0.06]"}`}
        >
          <Icon name={on ? "Lock" : "LockOpen"} size={12} color={on ? "#09090B" : "#fff"} />
          <Text className={`text-[12px] font-semibold ${on ? "text-black" : "text-white"}`}>
            {on
              ? t("dmPaidLock.lockOnPrice", { defaultValue: "Locked · {{price}} DHB", price: value })
              : kind === "video"
                ? t("dmPaidLock.lockVideo", "Lock video")
                : t("dmPaidLock.lockPhoto", "Lock photo")}
          </Text>
        </Pressable>
        {on
          ? LOCK_QUICK_PRICES.map((p) => (
              <Pressable key={p} onPress={() => { setCustom(""); onChange(p); }} className={chip(value === p && !custom)}>
                <Text className="text-[12px] text-white">{p}</Text>
              </Pressable>
            ))
          : null}
        {on ? (
          <TextInput
            value={custom}
            onChangeText={(raw) => {
              const clean = raw.replace(/[^0-9.]/g, "");
              setCustom(clean);
              const n = Number(clean);
              if (Number.isFinite(n) && n >= MIN && n <= MAX) onChange(Math.round(n * 100) / 100);
            }}
            keyboardType="decimal-pad"
            placeholder={t("dmPaidLock.lockCustom", "Other")}
            placeholderTextColor="#8B8D90"
            accessibilityLabel={t("dmPaidLock.lockCustomLabel", "Custom price in DHB")}
            className="rounded-full px-3 py-1 bg-white/[0.08] text-white text-[12px] min-w-[64px]"
          />
        ) : null}
      </View>
      {on ? (
        <Text className="text-[11px] text-white/60 mt-1">
          {t("dmPaidLock.lockHint", "They see it blurred until they pay you. Locked files are not end-to-end encrypted.")}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(LockPriceRowInner);
