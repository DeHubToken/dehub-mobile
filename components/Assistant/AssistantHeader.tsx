import React, { memo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { type IconName } from '../ui/Icon';
import { useTranslation } from 'react-i18next';

import { ThemeIcon } from '../page/PageKit';
import NavPillSurface from '../ui/NavPillSurface';

const BUTTON_STYLE = { width: 36, height: 36 } as const;

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
 * Title left; history and a ⋯ menu right, as on web's quiet start. The menu
 * holds what used to be a row of five buttons: new chat, personality,
 * settings and support.
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
    <View className="px-2 pt-2">
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15 }}>
    <NavPillSurface borderRadius={15} />
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

      <View className="flex-row items-center justify-end" style={{ gap: 2, flexShrink: 0 }}>
        <TouchableOpacity
          onPress={onHistoryPress}
          className="rounded-full items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.chatHistory')}
        >
          <Icon name="History" size={19} color="#E4E4E7" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          className="rounded-full items-center justify-center"
          style={BUTTON_STYLE}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('feedCard.moreShare')}
        >
          <Icon name="Ellipsis" size={20} color="#E4E4E7" />
          {openTicketCount > 0 && <View style={s.dot} />}
        </TouchableOpacity>
      </View>
    </View>
    </View>

    <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel={t('common.close')} />
      <View style={[s.menu, { top: insets.top + 58 }]}>
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
  dot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: '#F9FBFF' },
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
