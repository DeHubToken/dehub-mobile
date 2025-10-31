import React, { useCallback, useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type MessageInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
};

const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled, onTypingChange }) => {
  const [text, setText] = useState('');
  const stopTimer = React.useRef<any>(null);
  const notifyTyping = React.useCallback((typing: boolean) => {
    try { onTypingChange?.(typing); } catch {}
  }, [onTypingChange]);
  const handleSend = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    notifyTyping(false);
  }, [text, onSend]);
  const onChange = React.useCallback((t: string) => {
    setText(t);
    // typing start
    notifyTyping(!!t.trim());
    if (stopTimer.current) clearTimeout(stopTimer.current);
    // auto stop after 5s idle
    stopTimer.current = setTimeout(() => notifyTyping(false), 5000);
  }, [notifyTyping]);
  return (
    <View className="flex-row items-center px-3 py-2 bg-theme-neutrals-900">
      <View className="flex-1 flex-row items-center bg-theme-neutrals-800 rounded-full px-3 py-2 mr-2">
        <TextInput
          value={text}
          onChangeText={onChange}
          placeholder="Message"
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-theme-neutrals-100 text-[15px]"
          multiline
        />
      </View>
      <TouchableOpacity
        className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center active:opacity-80"
        onPress={handleSend}
        disabled={disabled}
      >
        <Ionicons name="send" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default MessageInput;
