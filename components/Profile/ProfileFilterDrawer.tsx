import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import FeedFilterPanel from "../Home/FeedFilterPanel";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";

type FeedFilterPanelProps = React.ComponentProps<typeof FeedFilterPanel>;

interface ProfileFilterDrawerProps
  extends Omit<FeedFilterPanelProps, "visible" | "embedded" | "innerScrollEnabled"> {
  visible: boolean;
  onClose: () => void;
}

/** A thumb-friendly profile filter surface that leaves the feed layout stable. */
const ProfileFilterDrawer: React.FC<ProfileFilterDrawerProps> = ({
  visible,
  onClose,
  ...panelProps
}) => {
  const { t } = useTranslation();

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="88%"
    >
      <View className="items-center pt-3">
        <View className="h-1 w-10 rounded-full bg-white/30" />
      </View>
      <View className="h-14 flex-row items-center justify-between px-4">
        <Text className="text-lg font-semibold text-white">
          {t("filters.filters", "Filters")}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Close")}
          className="h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 active:bg-white/10"
        >
          <Icon name="X" size={18} color="#ffffff" />
        </Pressable>
      </View>
      <FeedFilterPanel
        {...panelProps}
        visible
        embedded
        innerScrollEnabled
      />
    </GlassModal>
  );
};

export default React.memo(ProfileFilterDrawer);
