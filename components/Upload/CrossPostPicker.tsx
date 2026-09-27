import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { crossPostState, toggleCrossPostAccount } from "../../libs/crosspost-store";
import { PLATFORM_NAMES, getMultipostStatus } from "../../services/multipost.service";
import { multipostQueryKey, platformIcon, useMultipostWallet } from "../Settings/MultiPostPanel";

const CrossPostPicker: React.FC<{ onManage: () => void }> = ({ onManage }) => {
  const { t } = useTranslation();
  const wallet = useMultipostWallet();
  const { selected } = useSnapshot(crossPostState);
  const status = useQuery({
    queryKey: multipostQueryKey(wallet),
    queryFn: () => getMultipostStatus(wallet),
    enabled: !!wallet,
    staleTime: 60_000,
  });

  if (!wallet || status.isError) return null;
  const accounts = status.data?.accounts ?? [];
  const active = accounts.filter((a) => selected.includes(a.id)).length;

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Icon name="Share2" size={12} color="#A1A1AA" />
          <Text className="text-theme-neutrals-400 text-xs">{t("multiPost.alsoPostTo")}</Text>
        </View>
        {active > 0 && (
          <Text className="text-theme-neutrals-400 text-xs">
            {t("multiPost.creditsUsed", { count: active, balance: status.data?.credits ?? 0 })}
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
          <Text className="text-theme-neutrals-400 text-xs">
            {accounts.length ? t("multiPost.manage") : t("multiPost.setUp")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CrossPostPicker;
