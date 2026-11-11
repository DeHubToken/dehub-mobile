import React, { memo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { type IconName } from '../ui/Icon';
import { useTranslation } from 'react-i18next';

import PillHeader from '../page/PillHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { themeIconUrl } from '../../theme/icons';

const BUTTON_STYLE = { width: 34, height: 34 } as const;

interface AssistantHeaderProps {
  onNewChat: () => void;
  onHistoryPress: () => void;
  onSettingsPress: () => void;
  onStylePress: () => void;
  onSupportPress: () => void;
  /** Tickets still waiting on a human. Badges the menu and its Support row. */
  openTicketCount?: number;
  /** The active personality, shown on its menu row as on web. */
  styleEmoji: string;
  styleLabel?: string;
  hasMessages?: boolean;
}

/**
 * Every page's top pill, at Home's size (36pt row, 18pt icon, 14pt title):
 * title left; history and a ⋯ menu right, as on web. The menu holds new chat,
 * personality, settings and support.
 */
const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  onNewChat,
  onHistoryPress,
  onSettingsPress,
  onStylePress,
  onSupportPress,
  openTicketCount = 0,
  styleEmoji,
  styleLabel,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme, skin } = useAppTheme();
  const softInk = skin ? skin.tabIcon : '#A1A1AA';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close first, then open the sheet, so two modals never fight on iOS.
  const pick = useCallback((action: () => void) => {
    setMenuOpen(false);
    setTimeout(action, 250);
  }, []);

  const rows: { key: string; icon?: IconName; emoji?: string; label: string; badge?: number; onPress: () => void }[] = [
    { key: 'new', icon: 'SquarePen', label: t('assistant.newChat'), onPress: onNewChat },
    { key: 'style', emoji: styleEmoji, label: styleLabel ? `${t('assistant.aiPersonality')} · ${styleLabel}` : t('assistant.aiPersonality'), onPress: onStylePress },
    { key: 'settings', icon: 'Settings', label: t('assistant.aiSettings'), onPress: onSettingsPress },
    { key: 'support', icon: 'LifeBuoy', label: t('settings.support'), badge: openTicketCount, onPress: onSupportPress },
  ];

  return (
    <View>
    <PillHeader
      title={t('assistant.title')}
      showBack={false}
      onBack={() => {}}
      backLabel={t('common.goBack')}
      iconUrl={themeIconUrl(theme, 'assistant')}
      rightContent={
        <>
          <TouchableOpacity
            onPress={onHistoryPress}
            className="items-center justify-center"
            style={BUTTON_STYLE}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.chatHistory')}
          >
            <Icon name="History" size={16} color={softInk} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            className="items-center justify-center"
            style={BUTTON_STYLE}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('feedCard.moreShare')}
          >
            <Icon name="Ellipsis" size={16} color={softInk} strokeWidth={1.8} />
            {openTicketCount > 0 && <View style={s.dot} />}
          </TouchableOpacity>
        </>
      }
    />

    <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel={t('common.close')} />
      <View style={[s.menu, { top: insets.top + 50 }]}>
        {rows.map(row => (
          <TouchableOpacity
            key={row.key}
            onPress={() => pick(row.onPress)}
            style={s.row}
            activeOpacity={0.7}
            accessibilityRole="menuitem"
            accessibilityLabel={row.label}
          >
            <View style={s.rowIcon}>
              {row.emoji ? <Text style={{ fontSize: 16 }}>{row.emoji}</Text> : <Icon name={row.icon!} size={17} color="#D4D4D8" />}
            </View>
            <Text numberOfLines={1} style={s.rowText}>{row.label}</Text>
            {!!row.badge && row.badge > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{row.badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  dot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#F9FBFF' },
  menu: {
    position: 'absolute',
    right: 14,
    minWidth: 220,
    maxWidth: 290,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#141518',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  rowIcon: { width: 22, alignItems: 'center' },
  rowText: { flex: 1, color: '#F4F4F5', fontSize: 15, fontWeight: '500' },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: '#F9FBFF', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#0B0C0D', fontSize: 11, fontWeight: '700' },
});

export default memo(AssistantHeader);
