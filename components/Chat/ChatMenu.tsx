import React from 'react';
import { Modal, TouchableOpacity, View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ChatMenuProps = {
  visible: boolean;
  onClose: () => void;
  isBlocked?: boolean;
  onBlockUser: () => void;
  onUnblockUser?: () => void;
  onSearchChat?: () => void;
  onManageDmFee?: () => void;
  onClearChat?: () => void;
  /** Toggle free access for the peer (creator only). */
  onToggleFreeAccess?: () => void;
  /** Whether the peer currently has free access. */
  peerHasFreeAccess?: boolean;
  isCreator?: boolean;
};

type MenuRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  iconColor?: string;
};

const MenuRow: React.FC<MenuRowProps> = ({ icon, label, onPress, color, iconColor }) => (
  <TouchableOpacity
    className="flex-row items-center px-3 py-3 active:opacity-70"
    onPress={onPress}
    accessibilityRole="button"
  >
    <Ionicons name={icon} size={18} color={iconColor || "#F9FBFF"} />
    <Text className={`ml-2 text-sm ${color || "text-theme-neutrals-100"}`}>{label}</Text>
  </TouchableOpacity>
);

const ChatMenu: React.FC<ChatMenuProps> = ({
  visible,
  onClose,
  isBlocked,
  onBlockUser,
  onUnblockUser,
  onSearchChat,
  onManageDmFee,
  onClearChat,
  onToggleFreeAccess,
  peerHasFreeAccess,
  isCreator,
}) => {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/40"
      >
        <View className="absolute right-3 top-16 w-52 rounded-xl bg-theme-neutrals-800 shadow-lg overflow-hidden">
          <ScrollView bounces={false}>
            {/* Search in Chat */}
            {onSearchChat && (
              <>
                <MenuRow
                  icon="search-outline"
                  label="Search in chat"
                  onPress={() => { onClose(); onSearchChat(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {/* Clear Messages */}
            {onClearChat && (
              <>
                <MenuRow
                  icon="trash-outline"
                  label="Clear messages"
                  onPress={() => { onClose(); onClearChat(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {/* Free Access Toggle (creator only — exclude/include peer from fee) */}
            {isCreator && onToggleFreeAccess && (
              <>
                <MenuRow
                  icon={peerHasFreeAccess ? "remove-circle-outline" : "shield-checkmark-outline"}
                  label={peerHasFreeAccess ? "Remove free access" : "Grant free access"}
                  onPress={() => { onClose(); onToggleFreeAccess(); }}
                  iconColor={peerHasFreeAccess ? "#FCA5A5" : "#22C55E"}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {/* DM Fee Management (for creators) */}
            {isCreator && onManageDmFee && (
              <>
                <MenuRow
                  icon="cash-outline"
                  label="DM fee settings"
                  onPress={() => { onClose(); onManageDmFee(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {/* Block / Unblock */}
            <MenuRow
              icon={isBlocked ? "remove-circle-outline" : "ban-outline"}
              label={isBlocked ? "Unblock user" : "Block user"}
              onPress={isBlocked ? (onUnblockUser || onClose) : onBlockUser}
              color={isBlocked ? "text-theme-blue-300" : "text-red-300"}
              iconColor={isBlocked ? "#93C5FD" : "#FCA5A5"}
            />
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default ChatMenu;
