import React from 'react';
import { Modal, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ChatMenuProps = {
  visible: boolean;
  onClose: () => void;
  onViewProfile: () => void;
  isBlocked?: boolean;
  onBlockUser: () => void;
  onUnblockUser?: () => void;
};

const ChatMenu: React.FC<ChatMenuProps> = ({ visible, onClose, onViewProfile, isBlocked, onBlockUser, onUnblockUser }) => {
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
            onPress={onViewProfile}
            accessibilityRole="button"
          >
            <Ionicons name="person-circle-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">View profile</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={isBlocked ? (onUnblockUser || onClose) : onBlockUser}
            accessibilityRole="button"
          >
            <Ionicons name={isBlocked ? 'remove-circle-outline' : 'ban-outline'} size={18} color={isBlocked ? '#93C5FD' : '#FCA5A5'} />
            <Text className={`ml-2 text-sm ${isBlocked ? 'text-blue-300' : 'text-red-300'}`}>{isBlocked ? 'Unblock user' : 'Block user'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default ChatMenu;
