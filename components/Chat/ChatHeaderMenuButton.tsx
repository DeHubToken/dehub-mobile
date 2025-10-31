import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ChatHeaderMenuButtonProps = {
  onPress: () => void;
};

const ChatHeaderMenuButton: React.FC<ChatHeaderMenuButtonProps> = ({ onPress }) => {
  return (
    <TouchableOpacity
      className="w-10 h-10 items-center justify-center active:opacity-70"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open chat menu"
    >
      <Ionicons name="ellipsis-vertical" size={20} color="#E5E7EB" />
    </TouchableOpacity>
  );
};

export default ChatHeaderMenuButton;
