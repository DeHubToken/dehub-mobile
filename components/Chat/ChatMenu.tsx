import React from 'react';
import { Modal, Pressable, TouchableOpacity, View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import type { icons } from 'lucide-react-native';

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
  icon: keyof typeof icons;
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
    <Icon name={icon} size={18} color={iconColor || "#F9FBFF"} />
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
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1 }}
        className="bg-black/40"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ top: insets.top + 56 }}
          className="absolute right-3 w-52 rounded-xl bg-theme-neutrals-800 shadow-lg overflow-hidden"
        >
          <ScrollView bounces={false}>
            {onSearchChat && (
              <>
                <MenuRow
                  icon="Search"
                  label="Search in chat"
                  onPress={() => { onClose(); onSearchChat(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {onClearChat && (
              <>
                <MenuRow
                  icon="Trash2"
                  label="Clear messages"
                  onPress={() => { onClose(); onClearChat(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {isCreator && onToggleFreeAccess && (
              <>
                <MenuRow
                  icon={peerHasFreeAccess ? "CircleMinus" : "ShieldCheck"}
                  label={peerHasFreeAccess ? "Remove free access" : "Grant free access"}
                  onPress={() => { onClose(); onToggleFreeAccess(); }}
                  iconColor={peerHasFreeAccess ? "#FCA5A5" : "#22C55E"}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            {isCreator && onManageDmFee && (
              <>
                <MenuRow
                  icon="Coins"
                  label="DM fee settings"
                  onPress={() => { onClose(); onManageDmFee(); }}
                />
                <View className="h-[1px] bg-theme-neutrals-700/60" />
              </>
            )}

            <MenuRow
              icon={isBlocked ? "CircleMinus" : "Ban"}
              label={isBlocked ? "Unblock user" : "Block user"}
              onPress={isBlocked ? (onUnblockUser || onClose) : onBlockUser}
              color={isBlocked ? "text-theme-neutrals-200" : "text-red-300"}
              iconColor={isBlocked ? "#D4D4D8" : "#FCA5A5"}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default ChatMenu;
