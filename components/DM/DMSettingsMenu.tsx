import React from 'react';
import { Modal, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/40"
      >
        <View className="absolute right-3 top-16 w-44 rounded-xl bg-theme-neutrals-800 shadow-lg overflow-hidden">
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onNewDM}
            accessibilityRole="button"
          >
            <Ionicons name="chatbox-ellipses-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">New DM</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onOpenDmSettings}
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">DM settings</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onToggleDnd}
            accessibilityRole="button"
          >
            <Ionicons name={dnd ? 'moon' : 'moon-outline'} size={18} color={dnd ? '#D4D4D8' : '#E5E7EB'} />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">{dnd ? 'DND: On' : 'DND'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default DMSettingsMenu;
