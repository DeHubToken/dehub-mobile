/**
 * "Lock photo" for a photo or video about to go out in a DM: off by default,
 * one tap turns it on at $5 with quick prices beside it. Prices are in
 * dollars, like subscriptions; the DHB they come to today shows underneath.
 */
import React, { memo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import {
  LOCK_DEFAULT_USD,
  LOCK_MAX_USD,
  LOCK_MIN_USD,
  LOCK_QUICK_USD,
  formatLockDhb,
  formatLockUsd,
  lockDhbForUsd,
} from "../../libs/dmLocked";

/** Quick prices in USD. */
export const LOCK_QUICK_PRICES = LOCK_QUICK_USD;
const MIN = LOCK_MIN_USD;
const MAX = LOCK_MAX_USD;

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
          onPress={() => { setCustom(""); onChange(on ? null : LOCK_DEFAULT_USD); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          style={on ? pill : { ...idle, borderColor: c.border }}
          className={on ? "" : pad}
        >
          <View style={on ? solid : undefined} className={on ? pad : "flex-row items-center gap-1"}>
            <Icon name={on ? "Lock" : "LockOpen"} size={12} color={on ? c.background : c.foreground} />
            <Text style={{ color: on ? c.background : c.foreground }} className="text-[12px] font-semibold">
              {on
                ? t("dmPaidLock.lockOnUsd", { defaultValue: "Locked · {{price}}", price: formatLockUsd(value!) })
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
                      <Text style={{ color: c.foreground }} className="text-[12px] font-semibold">{formatLockUsd(p)}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: c.foreground }} className="text-[12px]">{formatLockUsd(p)}</Text>
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
            placeholder={t("dmPaidLock.lockCustomUsd", "$ Other")}
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel={t("dmPaidLock.lockCustomUsdLabel", "Custom price in dollars")}
            style={[idle, { color: c.foreground }, custom ? { borderColor: c.foreground } : null]}
            className="rounded-full px-3 py-1 text-[12px] min-w-[64px]"
          />
        ) : null}
      </View>
      {on ? (
        <Text style={{ color: c.foreground }} className="text-[11px] font-medium mt-1">
          {t("dmPaidLock.lockDhbNow", { defaultValue: "≈ {{dhb}} today. They always pay {{price}}, whatever DHB is worth.", dhb: formatLockDhb(lockDhbForUsd(value!)), price: formatLockUsd(value!) })}
        </Text>
      ) : null}
      {on ? (
        <Text style={{ color: c.mutedForeground }} className="text-[11px] mt-1">
          {t("dmPaidLock.lockHint", "They see it blurred until they pay you. Locked files are not end-to-end encrypted.")}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(LockPriceRowInner);
