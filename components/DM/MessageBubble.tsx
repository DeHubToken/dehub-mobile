import React, { memo, useCallback, useMemo, useState } from 'react';
import { Text, View, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
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

  const media = useMemo(() => {
    const anyMsg: any = msg as any;
    const list: Array<{ url: string; type?: string; mimeType?: string }> = Array.isArray(anyMsg.mediaUrls)
      ? anyMsg.mediaUrls
      : Array.isArray(anyMsg.attachments)
        ? anyMsg.attachments.map((a: any) => ({ url: a?.url, type: a?.type, mimeType: a?.mimeType }))
        : [];
    return list;
  }, [msg]);

  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <View>
      {showMeta ? (
        <Text
          className={`text-theme-neutrals-500 text-[11px] mb-1 ${isMe ? 'self-end text-right' : 'self-start text-left'}`}
        >
          {statusLabel ? `${tsLabel} • ${statusLabel}` : tsLabel}
        </Text>
      ) : null}
      {media && media.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={onLongPress}
          className={`max-w-[82%] ${align}`}
        >
          <View className="rounded-2xl overflow-hidden bg-theme-neutrals-800">
            <View style={{ width: 200, height: 200 }} className="items-center justify-center">
              {!imgLoaded ? (
                <View className="absolute inset-0 items-center justify-center bg-theme-neutrals-800">
                  <ActivityIndicator size="small" />
                </View>
              ) : null}
              <Image
                source={{ uri: media[0].url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                onLoadStart={() => setImgLoaded(false)}
                onLoadEnd={() => setImgLoaded(true)}
              />
            </View>
            {msg.text ? (
              <View className="px-3 py-2">
                <Text className={`text-[15px] ${isMe ? 'text-white' : 'text-theme-neutrals-100'}`}>{msg.text}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity activeOpacity={0.9} onLongPress={onLongPress} className={`max-w-[82%] rounded-2xl px-3 py-2 ${bg} ${align}`}>
          {msg.text ? (
            <Text className={`text-[15px] ${isMe ? 'text-white' : 'text-theme-neutrals-100'}`}>{msg.text}</Text>
          ) : null}
        </TouchableOpacity>
      )}
    </View>
  );
});
MessageBubble.displayName = 'MessageBubble';
export default MessageBubble;
