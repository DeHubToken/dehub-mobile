import React, { memo } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import ChatMessageList, { ChatMessage } from './ChatMessageList';
import { X } from 'lucide-react-native';

interface ChatSidePanelProps {
  messages: ChatMessage[];
  input: string;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
}

const ChatSidePanel: React.FC<ChatSidePanelProps> = ({ messages, input, onChangeInput, onSend, onClose }) => {
  return (
    <View className="absolute right-0 top-0 bottom-0 w-[46%] bg-black/60 border-l border-white/10 pt-16 pb-44">
      <View className="flex-row items-center justify-between px-3 py-2">
        <Text className="text-white font-semibold text-xs">Live Chat</Text>
        <TouchableOpacity onPress={onClose} className="p-1 -m-1">
          <X color="white" size={16} />
        </TouchableOpacity>
      </View>
      <ChatMessageList messages={messages} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View className="px-2 pb-2">
          <View className="flex-row items-center bg-white/10 rounded-full px-3">
            <TextInput
              value={input}
              onChangeText={onChangeInput}
              placeholder="Say something..."
              placeholderTextColor="#8e8e8e"
              className="flex-1 text-white text-[12px] py-2"
              multiline
              maxLength={240}
            />
            <TouchableOpacity onPress={onSend} className="pl-2 py-2" disabled={!input.trim()}>
              <Text className={[ 'text-[12px] font-semibold', input.trim() ? 'text-emerald-400' : 'text-white/30' ].join(' ')}>
                Send
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default memo(ChatSidePanel);
