/**
 * "Lock photo" for a photo or video about to go out in a DM: off by default,
 * one tap turns it on at 25 DHB with quick prices beside it.
 */
import React, { memo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";

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
  // The app repaints plain-filled buttons with the theme's control material
  // (libs/jsx/controls.js). Idle chips take that on purpose; the picked ones
  // keep their own look by painting it on an inner layer instead.
  const { colors: c } = useAppTheme();
  const pill = { borderRadius: 999 } as const;
  const idle = { ...pill, borderWidth: 1, borderColor: "transparent", backgroundColor: c.muted };
  const pad = "flex-row items-center gap-1 px-3 py-1";
  const solid = { ...pill, backgroundColor: c.foreground };
  const ring = { ...pill, borderWidth: 1.5, borderColor: c.foreground };

  return (
    <View className="mt-2">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Pressable
          onPress={() => { setCustom(""); onChange(on ? null : LOCK_QUICK_PRICES[1]); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          style={on ? pill : { ...idle, borderColor: c.border }}
          className={on ? "" : pad}
        >
          <View style={on ? solid : undefined} className={on ? pad : "flex-row items-center gap-1"}>
            <Icon name={on ? "Lock" : "LockOpen"} size={12} color={on ? c.background : c.foreground} />
            <Text style={{ color: on ? c.background : c.foreground }} className="text-[12px] font-semibold">
              {on
                ? t("dmPaidLock.lockOnPrice", { defaultValue: "Locked · {{price}} DHB", price: value })
                : kind === "video"
                  ? t("dmPaidLock.lockVideo", "Lock video")
                  : t("dmPaidLock.lockPhoto", "Lock photo")}
            </Text>
          </View>
        </Pressable>
        {on
          ? LOCK_QUICK_PRICES.map((p) => {
              const sel = value === p && !custom;
              return (
                <Pressable key={p} onPress={() => { setCustom(""); onChange(p); }} style={sel ? pill : idle} className={sel ? "" : "px-3 py-1"}>
                  {sel ? (
                    <View style={ring} className="px-3 py-1">
                      <Text style={{ color: c.foreground }} className="text-[12px] font-semibold">{p}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: c.foreground }} className="text-[12px]">{p}</Text>
                  )}
                </Pressable>
              );
            })
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
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel={t("dmPaidLock.lockCustomLabel", "Custom price in DHB")}
            style={[idle, { color: c.foreground }, custom ? { borderColor: c.foreground } : null]}
            className="rounded-full px-3 py-1 text-[12px] min-w-[64px]"
          />
        ) : null}
      </View>
      {on ? (
        <Text style={{ color: c.mutedForeground }} className="text-[11px] mt-1">
          {t("dmPaidLock.lockHint", "They see it blurred until they pay you. Locked files are not end-to-end encrypted.")}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(LockPriceRowInner);
