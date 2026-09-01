import React, { memo } from 'react';
import { Animated, View, Text, Pressable } from 'react-native';
import { ChatMessage } from './ChatMessageList';

interface EphemeralMessagesProps {
  messages: ChatMessage[];
  fadeAnim: Animated.Value;
  onPress?: () => void;
}

const EphemeralMessages: React.FC<EphemeralMessagesProps> = ({ messages, fadeAnim, onPress }) => {
  if (!messages.length) return null;
  return (
    <Animated.View style={{ opacity: fadeAnim }} className="absolute left-4 bottom-56 w-[54%]">
      <Pressable onPress={onPress} android_disableSound>
        {messages.map((m) => {
          const color = m.isOwner ? 'text-white' : m.isModerator ? 'text-white/80' : 'text-white/60';
          return (
            <View key={m.id} className="mb-1 bg-black/55 px-3 py-1.5 rounded-lg border border-white/10">
              <Text className="text-white text-[11px]" numberOfLines={2}>
                <Text className={`font-semibold ${color}`}>{m.user}: </Text>
                {m.message}
              </Text>
            </View>
          );
        })}
      </Pressable>
    </Animated.View>
  );
};

export default memo(EphemeralMessages);
