import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from '../ui/Icon';
import { useTranslation } from 'react-i18next';

import { ThemeIcon } from '../page/PageKit';
import NavPillSurface from '../ui/NavPillSurface';

// The buttons share the title row, so they are a touch under 40 to leave the
// title room on a 360dp phone.
const BUTTON_STYLE = { width: 34, height: 34, backgroundColor: 'rgba(255,255,255,0.08)' } as const;

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
  const { t } = useTranslation();
  return (
    <View className="px-2 pt-2">
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15 }}>
    <NavPillSurface borderRadius={15} />
    {/* One row, as on web: title left, the buttons right. The Creator
        shortcut that used to sit here lives at the foot of Settings now. */}
    <View className="flex-row items-center justify-between">
      <TouchableOpacity
        onPress={onNewChat}
        className="flex-row items-center"
        style={{ flexShrink: 1, marginRight: 8 }}
        activeOpacity={0.7}
      >
        <ThemeIcon icon="assistant" size={32} />
        <Text numberOfLines={1} style={{ flexShrink: 1 }} className="text-theme-neutrals-100 text-[17px] font-bold ml-2.5">
          {t('assistant.title')}
        </Text>
      </TouchableOpacity>

      <View className="flex-row items-center justify-end" style={{ gap: 4, flexShrink: 0 }}>
        {hasMessages && (
          <TouchableOpacity
            onPress={onNewChat}
            className="rounded-lg items-center justify-center"
            style={BUTTON_STYLE}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.newChat')}
          >
            <Icon name="SquarePen" size={16} color="#A6A9AC" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onHistoryPress}
          className="rounded-lg items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.chatHistory')}
        >
          <Icon name="History" size={16} color="#A6A9AC" />
        </TouchableOpacity>
        {/* The desk, not the model: opens the ticket sheet directly, with no
            quote and no DHB transfer. The badge counts tickets still waiting
            on a human, which is the reason people tap it. */}
        <TouchableOpacity
          onPress={onSupportPress}
          className="rounded-lg items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('settings.support')}
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
          className="rounded-lg items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.aiSettings')}
        >
          <Icon name="Settings" size={16} color="#A6A9AC" />
        </TouchableOpacity>
        {/* The personality button is its emoji, same as web's header. */}
        <TouchableOpacity
          onPress={onStylePress}
          className="rounded-lg items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.aiPersonality')}
        >
          <Text style={{ fontSize: 17 }}>{styleEmoji}</Text>
        </TouchableOpacity>
      </View>
    </View>
    </View>
    </View>
  );
};

export default memo(AssistantHeader);
