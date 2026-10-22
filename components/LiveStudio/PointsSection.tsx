/**
 * Live Studio's loyal viewers on a phone: the creator's top viewers by points,
 * a point for every minute watched and one per 100 DHB paid.
 */
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { getPointsBoard } from "../../services/live.service";

export function PointsSection({ address }: { address: string | null | undefined }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["points-board", address, 10],
    queryFn: () => getPointsBoard(address || "", 10),
    enabled: !!address,
    staleTime: 60_000,
  });
  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.points.intro")}</Text>
      {isLoading ? (
        <ActivityIndicator color="#a1a1aa" />
      ) : !data?.length ? (
        <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.points.empty")}</Text>
      ) : (
        data.map((r, i) => (
          <View key={r.address} className="flex-row items-center gap-3">
            <Text className="text-theme-neutrals-500 text-sm w-5 text-center">{i + 1}</Text>
            <Avatar uri={getAvatarUrl(r.avatarImageUrl, 28)} size={28} name={r.displayName || r.username} />
            <Text className="text-white text-sm flex-1" numberOfLines={1}>
              {r.displayName || r.username || `${r.address.slice(0, 6)}…`}
            </Text>
            <Text className="text-theme-neutrals-300 text-sm">{t("liveOverlay.points", { count: r.points, formatted: r.points.toLocaleString() })}</Text>
          </View>
        ))
      )}
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.points.widgetHint")}</Text>
    </View>
  );
}
