/**
 * "Cast to TV" row for a video's three-dot menu.
 *
 * iPhone: the row is covered by expo-video's AirPlay button (AVRoutePickerView,
 * already in the installed app), drawn see-through, so a tap anywhere on the
 * row opens the system AirPlay picker. The playing video moves to the TV on its
 * own: expo-video players allow external playback by default.
 *
 * Android: the installed app has no Google Cast library, so the row opens the
 * phone's own screen casting (Cast / Smart View). When a phone has no such
 * screen it says where to find it instead. A direct Chromecast hand-off needs
 * the Cast library in a store build.
 */
import React, { memo } from "react";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { VideoAirPlayButton } from "expo-video";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { toastInfo } from "../../libs";

const ANDROID_CAST_SCREENS = [
  "android.settings.CAST_SETTINGS",
  "android.settings.WIFI_DISPLAY_SETTINGS",
];

export async function openAndroidScreenCast(): Promise<boolean> {
  for (const action of ANDROID_CAST_SCREENS) {
    try {
      await Linking.sendIntent(action);
      return true;
    } catch {
      // Not on this phone; try the next one.
    }
  }
  return false;
}

interface CastToTvRowProps {
  onClose: () => void;
  color?: string;
}

const CastToTvRow: React.FC<CastToTvRowProps> = ({ onClose, color = "#E5E7EB" }) => {
  const { t } = useTranslation();
  const label = t("postOptions.castToTv", "Cast to TV");
  const sublabel = Platform.OS === "ios"
    ? t("postOptions.castIosDesc", "AirPlay to an Apple TV or smart TV")
    : t("postOptions.castAndroidDesc", "Mirror your screen with Cast or Smart View");

  const body = (
    <>
      <View className="w-5 h-5 items-center justify-center mr-3">
        <Icon name="Cast" size={20} color={color} />
      </View>
      <View className="flex-1">
        <Text style={{ color }} className="text-[15px] font-medium">{label}</Text>
        <Text className="text-theme-neutrals-500 text-xs mt-0.5">{sublabel}</Text>
      </View>
    </>
  );

  if (Platform.OS === "ios") {
    return (
      <View
        testID="cast-to-tv"
        accessibilityRole="button"
        accessibilityLabel={label}
        className="mx-3 flex-row items-center rounded-xl px-3 py-3.5"
      >
        {body}
        <VideoAirPlayButton
          style={StyleSheet.absoluteFill}
          tint="transparent"
          activeTint="transparent"
          prioritizeVideoDevices
          // Closing the menu while the picker is up would take the picker
          // down with it, so the menu waits for the picker to finish.
          onEndPresentingRoutes={onClose}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      testID="cast-to-tv"
      onPress={async () => {
        onClose();
        const opened = await openAndroidScreenCast();
        if (!opened) {
          toastInfo(t("postOptions.castAndroidHelp", "Open your quick settings and tap Smart View or Cast, then pick your TV."));
        }
      }}
      activeOpacity={0.7}
      className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
    >
      {body}
    </TouchableOpacity>
  );
};

export default memo(CastToTvRow);
