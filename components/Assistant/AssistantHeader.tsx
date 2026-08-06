import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import Icon from '../ui/Icon';

const AI_SPARKLE_ICON = require('../../assets/web-icons/ai-sparkle-icon.png');

interface AssistantHeaderProps {
  onNewChat: () => void;
  onHistoryPress: () => void;
  onSettingsPress?: () => void;
  hasMessages?: boolean;
}

const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  onNewChat,
  onHistoryPress,
  onSettingsPress,
  hasMessages,
}) => {
  return (
    <View
      className="flex-row items-center justify-between px-4 h-16 bg-theme-neutrals-900"
    >
      <TouchableOpacity
        onPress={onNewChat}
        className="flex-row items-center"
        activeOpacity={0.7}
      >
        <Image
          source={AI_SPARKLE_ICON}
          style={{ width: 26, height: 26 }}
          resizeMode="contain"
        />
        <Text className="text-theme-neutrals-100 text-2xl font-medium ml-2.5 tracking-wide">
          Assistant
        </Text>
      </TouchableOpacity>

      <View className="flex-row items-center" style={{ gap: 6 }}>
        {hasMessages && (
          <TouchableOpacity
            onPress={onNewChat}
            className="w-10 h-10 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <Icon name="SquarePen" size={16} color="#A6A9AC" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onHistoryPress}
          className="w-10 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Chat history"
        >
          <Icon name="History" size={16} color="#A6A9AC" />
        </TouchableOpacity>
        {onSettingsPress && (
          <TouchableOpacity
            onPress={onSettingsPress}
            className="w-10 h-10 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Icon name="Settings" size={16} color="#A6A9AC" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default memo(AssistantHeader);
