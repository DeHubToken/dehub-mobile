import MessageSurface from "../DM/MessageSurface";
import React from 'react';
import { Modal, TouchableOpacity, View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';

export type DMSettingsMenuProps = {
  visible: boolean;
  onClose: () => void;
  onNewDM: () => void;
  onOpenDmSettings: () => void;
  dnd: boolean;
  onToggleDnd: () => void;
};

const DMSettingsMenu: React.FC<DMSettingsMenuProps> = ({
  visible,
  onClose,
  onNewDM,
  onOpenDmSettings,
  dnd,
  onToggleDnd,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { skin } = useAppTheme();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className={Platform.OS === 'android' ? 'flex-1' : 'flex-1 dark-surface bg-black/40'}
      >
        <View
          style={[{ top: insets.top + 56 }, Platform.OS === 'android' && skin && { ...skin.card, backgroundColor: skin.page }]}
          className="absolute right-3 w-44 rounded-xl overflow-hidden"
        >
          <MessageSurface radius={12} />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onNewDM}
            accessibilityRole="button"
          >
            <Ionicons name="chatbox-ellipses-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">{t('dm.newDm')}</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onOpenDmSettings}
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">{t('dm.dmSettings')}</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onToggleDnd}
            accessibilityRole="button"
          >
            <Ionicons name={dnd ? 'moon' : 'moon-outline'} size={18} color={dnd ? '#D4D4D8' : '#E5E7EB'} />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">{dnd ? t('dm.doNotDisturbOn') : t('dm.doNotDisturb')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default DMSettingsMenu;
