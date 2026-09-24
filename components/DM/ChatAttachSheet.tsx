/**
 * Everything the DM composer can add to a message, behind its "+" button.
 *
 * The composer used to carry nine 36dp icons in one justify-between row — tip,
 * GIF, image, video, file, mic, poll, AI and send — which is ~348dp of a 360dp
 * phone, so the hit areas overlapped and the neighbour of whatever you aimed
 * at got pressed. The row now keeps only what every message needs (attach,
 * the field, send/mic) and the rest lives here as full-width rows well over
 * the 48dp minimum. Same shape as the public chat's LiveChatAttachSheet.
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";

import GlassModal from "../ui/GlassModal";
import Icon, { type IconName } from "../ui/Icon";

export interface ChatAttachOption {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface ChatAttachSheetProps {
  visible: boolean;
  onClose: () => void;
  options: ChatAttachOption[];
}

const ChatAttachSheet: React.FC<ChatAttachSheetProps> = ({ visible, onClose, options }) => {
  const { t } = useTranslation();

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      scrollable
      maxHeight="70%"
      blurIntensity={30}
    >
      <View className="pb-4 pt-2">
        <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
          {t("liveChat.attachTitle")}
        </Text>

        {options.map((option) => (
          <TouchableOpacity
            key={option.key}
            onPress={option.onPress}
            disabled={option.disabled}
            activeOpacity={0.7}
            className="flex-row items-center px-5"
            style={{ minHeight: 56 }}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ disabled: !!option.disabled }}
          >
            <View className="mr-3 w-10 h-10 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
              <Icon name={option.icon} size={20} color={option.disabled ? "#3F3F46" : "#D4D4D8"} />
            </View>
            <Text
              className={`text-[15px] font-medium ${option.disabled ? "text-theme-neutrals-500" : "text-white"}`}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </GlassModal>
  );
};

export default ChatAttachSheet;
