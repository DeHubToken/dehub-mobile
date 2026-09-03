import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import Icon from '../ui/Icon';
import AppTopBar from '../AppTopBar';

const AI_SPARKLE_ICON = require('../../assets/web-icons/ai-sparkle-icon.png');

interface AssistantHeaderProps {
  onNewChat: () => void;
  onHistoryPress: () => void;
  onSettingsPress: () => void;
  onStylePress: () => void;
  onSupportPress: () => void;
  /** Tickets still waiting on a human. Badges the support button when above 0. */
  openTicketCount?: number;
  /** Emoji of the active personality, shown on the style button as on web. */
  styleEmoji: string;
  hasMessages?: boolean;
}

const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  onNewChat,
  onHistoryPress,
  onSettingsPress,
  onStylePress,
  onSupportPress,
  openTicketCount = 0,
  styleEmoji,
  hasMessages,
}) => {
  return (
    <View className="bg-theme-neutrals-900">
    {/* The dehub mark bar is constant chrome on every screen, as on web. */}
    <AppTopBar />
    <View className="flex-row items-center justify-between px-4 h-16 bg-theme-neutrals-900">
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
        {/* The desk, not the model: opens the ticket sheet directly, with no
            quote and no DHB transfer. The badge counts tickets still waiting
            on a human, which is the reason people tap it. */}
        <TouchableOpacity
          onPress={onSupportPress}
          className="w-10 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Support"
        >
          <Icon name="LifeBuoy" size={16} color="#A6A9AC" />
          {openTicketCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 15,
                height: 15,
                paddingHorizontal: 3,
                borderRadius: 999,
                backgroundColor: '#F9FBFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#0B0C0D', fontSize: 9, fontWeight: '700' }}>
                {openTicketCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSettingsPress}
          className="w-10 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="AI settings"
        >
          <Icon name="Settings" size={16} color="#A6A9AC" />
        </TouchableOpacity>
        {/* The personality button is its emoji, same as web's header. */}
        <TouchableOpacity
          onPress={onStylePress}
          className="w-10 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="AI personality"
        >
          <Text style={{ fontSize: 17 }}>{styleEmoji}</Text>
        </TouchableOpacity>
      </View>
    </View>
    </View>
  );
};

export default memo(AssistantHeader);
