/**
 * Quick controls on a phone: the switches a creator reaches for mid-stream.
 * Each holds for everyone at once — every viewer's app and the OBS page — and
 * stays as set until flipped back. The twin of dehubweb's QuickControls.
 */
import React from "react";
import { Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastError } from "../../libs";
import { setMyControls, type CreatorOverlay } from "../../services/live.service";
import { parseControls, type OverlayControls } from "../../libs/live-overlay/types";

const SWITCHES: Array<keyof OverlayControls> = ["alertsPaused", "soundsMuted", "readAloudMuted"];

export function QuickControls({ overlay, queryKey }: { overlay: CreatorOverlay; queryKey: readonly unknown[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const controls = parseControls(overlay.controls);

  const flip = useMutation({
    mutationFn: (change: Partial<OverlayControls>) => setMyControls(change),
    onMutate: (change) => {
      const previous = queryClient.getQueryData<CreatorOverlay>(queryKey);
      queryClient.setQueryData<CreatorOverlay>(queryKey, (prev) => (prev ? { ...prev, controls: { ...controls, ...change } } : prev));
      return { previous };
    },
    onSuccess: (saved) =>
      queryClient.setQueryData<CreatorOverlay>(queryKey, (prev) => (prev ? { ...prev, controls: saved.controls, version: saved.version } : saved)),
    onError: (_err, _change, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toastError(t("liveStudio.controls.failed"));
    },
  });

  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.controls.intro")}</Text>
      {SWITCHES.map((key) => (
        <View key={key} className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-white text-sm font-medium">{t(`liveStudio.controls.${key}`)}</Text>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5">{t(`liveStudio.controls.${key}Hint`)}</Text>
          </View>
          <Switch
            value={controls[key]}
            disabled={flip.isPending}
            onValueChange={(on) => flip.mutate({ [key]: on })}
            accessibilityLabel={t(`liveStudio.controls.${key}`)}
          />
        </View>
      ))}
    </View>
  );
}
