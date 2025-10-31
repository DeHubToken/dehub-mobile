import React, { memo, useCallback, useState } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { Message } from '../../store/messages.types';
import { formatChatTimeSmart } from '../../libs/date.util';

export type MessageBubbleProps = {
  msg: Message;
  isMe: boolean;
};

const MessageBubble: React.FC<MessageBubbleProps> = memo(({ msg, isMe }) => {
  const [showMeta, setShowMeta] = useState<boolean>(false);
  const bg = isMe ? 'bg-blue-600' : 'bg-theme-neutrals-800';
  const align = isMe ? 'self-end' : 'self-start';
  const tsLabel = formatChatTimeSmart(msg.createdAt, 6);
  const statusLabel = isMe
    ? (msg.status === 'sending' ? 'Sending…'
      : msg.status === 'sent' ? 'Sent'
      : msg.status === 'delivered' ? 'Delivered'
      : msg.status === 'read' ? 'Read'
      : undefined)
    : undefined;

  const onLongPress = useCallback(() => {
    setShowMeta((prev) => !prev);
  }, []);

  return (
    <View>
      {showMeta ? (
        <Text
          className={`text-theme-neutrals-500 text-[11px] mb-1 ${isMe ? 'self-end text-right' : 'self-start text-left'}`}
        >
          {statusLabel ? `${tsLabel} • ${statusLabel}` : tsLabel}
        </Text>
      ) : null}
      <TouchableOpacity activeOpacity={0.9} onLongPress={onLongPress} className={`max-w-[82%] rounded-2xl px-3 py-2 ${bg} ${align}`}>
        {msg.text ? (
          <Text className={`text-[15px] ${isMe ? 'text-white' : 'text-theme-neutrals-100'}`}>{msg.text}</Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
});
MessageBubble.displayName = 'MessageBubble';
export default MessageBubble;
