import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Message } from '../../store/messages.types';

export type MessageBubbleProps = {
  msg: Message;
  isMe: boolean;
};

const MessageBubble: React.FC<MessageBubbleProps> = memo(({ msg, isMe }) => {
  const bg = isMe ? 'bg-blue-600' : 'bg-theme-neutrals-800';
  const align = isMe ? 'self-end' : 'self-start';
  return (
    <View className={`max-w-[82%] rounded-2xl px-3 py-2 ${bg} ${align}`}>
      {msg.text ? (
        <Text className={`text-[15px] ${isMe ? 'text-white' : 'text-theme-neutrals-100'}`}>{msg.text}</Text>
      ) : null}
      {/* status ticks */}
      {isMe ? (
        <Text className="text-[10px] text-white/80 mt-1">{msg.status}</Text>
      ) : null}
    </View>
  );
});
MessageBubble.displayName = 'MessageBubble';
export default MessageBubble;
