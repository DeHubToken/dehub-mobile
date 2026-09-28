import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { crossPostState, toggleCrossPostAccount } from "../../libs/crosspost-store";
import { PLATFORM_NAMES, getMultipostStatus } from "../../services/multipost.service";
import { creditsFor } from "../../libs/social-pricing";
import { multipostQueryKey, platformIcon, useMultipostWallet } from "../Settings/MultiPostPanel";

function useCrossPostAccounts() {
  const wallet = useMultipostWallet();
  const { selected } = useSnapshot(crossPostState);
  const status = useQuery({
    queryKey: multipostQueryKey(wallet),
    queryFn: () => getMultipostStatus(wallet),
    enabled: !!wallet,
    staleTime: 60_000,
  });
  const hidden = !wallet || status.isError;
  const accounts = (status.data?.accounts ?? []).filter((a) => !a.pending);
  return { hidden, accounts, selected, credits: status.data?.credits ?? 0 };
}

/**
 * The one control for posting to other platforms, sitting in the composer's
 * icon row. With nothing connected it goes straight to setup; otherwise it
 * shows or hides the account list, and the badge counts accounts switched on.
 */
export const CrossPostButton: React.FC<{ open: boolean; onToggle: () => void; onManage: () => void }> = ({
  open,
  onToggle,
  onManage,
}) => {
  const { t } = useTranslation();
  const { hidden, accounts, selected } = useCrossPostAccounts();
  if (hidden) return null;
  const count = accounts.filter((a) => selected.includes(a.id)).length;
  const lit = open || count > 0;

  return (
    <TouchableOpacity
      onPress={accounts.length ? onToggle : onManage}
      activeOpacity={0.7}
      className="w-9 h-9 rounded-xl items-center justify-center border"
      style={{
        backgroundColor: lit ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)",
        borderColor: lit ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)",
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={accounts.length ? t("multiPost.alsoPostTo") : t("multiPost.setUp")}
    >
      <Icon name="Share2" size={16} color="#fff" />
      {count > 0 && (
        <View
          className="absolute w-4 h-4 rounded-full bg-white items-center justify-center"
          style={{ top: -4, right: -4 }}
        >
          <Text className="text-black font-bold" style={{ fontSize: 10 }}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const CrossPostPicker: React.FC<{ onManage: () => void }> = ({ onManage }) => {
  const { t } = useTranslation();
  const { hidden, accounts, selected, credits } = useCrossPostAccounts();

  if (hidden || !accounts.length) return null;
  const active = accounts.filter((a) => selected.includes(a.id)).reduce((sum, a) => sum + creditsFor(a.platform), 0);

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-theme-neutrals-400 text-xs">{t("multiPost.alsoPostTo")}</Text>
        {active > 0 && (
          <Text className="text-theme-neutrals-400 text-xs">
            {t("multiPost.creditsUsed", { count: active, balance: credits })}
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {accounts.map((a) => {
          const on = selected.includes(a.id);
          return (
            <TouchableOpacity
              key={a.id}
              onPress={() => toggleCrossPostAccount(a.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{
                borderWidth: 1,
                borderColor: on ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)",
                backgroundColor: on ? "rgba(255,255,255,0.15)" : "transparent",
              }}
            >
              <Icon name={platformIcon(a.platform)} size={12} color={on ? "#fff" : "#A1A1AA"} />
              <Text className={on ? "text-white text-xs" : "text-theme-neutrals-400 text-xs"}>
                {a.username || PLATFORM_NAMES[a.platform]}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={onManage}
          accessibilityRole="button"
          className="px-2.5 py-1 rounded-full"
          style={{ borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" }}
        >
          <Text className="text-theme-neutrals-400 text-xs">{t("multiPost.manage")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CrossPostPicker;
