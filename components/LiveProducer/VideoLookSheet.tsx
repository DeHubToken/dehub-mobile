import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { VIDEO_LOOKS, type VideoLookId } from "./videoLooks";

interface VideoLookSheetProps {
  visible: boolean;
  active: VideoLookId;
  onSelect: (id: VideoLookId) => void;
  onClose: () => void;
}

/**
 * The look picker — a sheet over the preview, matching GiftModal next door.
 *
 * A plain RN Modal rather than a routed screen: nothing behind it needs to stay
 * tappable while it is open, which is the one case where a routed
 * transparentModal would bite (see the image-feed drawer for the other).
 *
 * Selecting does not dismiss. Every look is visible in the preview underneath
 * the moment it is picked, so the creator can walk the row and watch their own
 * face change — closing after each tap would make that impossible.
 */
const VideoLookSheet: React.FC<VideoLookSheetProps> = ({
  visible,
  active,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        className="flex-1"
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <View className="bg-zinc-950 border-t border-white/10 rounded-t-2xl px-4 pt-4 pb-8">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-base font-semibold">
            {t("videoLooks.title")}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            className="px-3 py-1.5 rounded-xl bg-white/10"
            accessibilityRole="button"
          >
            <Text className="text-white text-xs font-medium">
              {t("common.done")}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {VIDEO_LOOKS.map((look) => {
            const selected = look.id === active;
            return (
              <TouchableOpacity
                key={look.id}
                onPress={() => onSelect(look.id)}
                activeOpacity={0.8}
                className={`mr-2 px-3 py-2 rounded-xl border ${
                  selected
                    ? "bg-white/20 border-white/30"
                    : "bg-white/5 border-white/10"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  className={`text-xs font-medium ${
                    selected ? "text-white" : "text-white/60"
                  }`}
                >
                  {look.emoji} {t(`videoLooks.${look.id}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text className="text-white/40 text-[11px] mt-3">
          {t("videoLooks.hint")}
        </Text>
      </View>
    </Modal>
  );
};

export default VideoLookSheet;
