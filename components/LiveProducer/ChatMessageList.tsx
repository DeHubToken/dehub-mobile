import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { FlatList, Text, View, TouchableOpacity } from 'react-native';

export interface ChatMessage {
  id: string;
  user: string;
  message: string;
  isOwner?: boolean;
  isModerator?: boolean;
  isGift?: boolean;
  amount?: number;
  createdAt: number;
}

interface Props {
  messages: ChatMessage[];
  onPressUser?: (username: string) => void;
  onLongPressMessage?: (msg: ChatMessage) => void;
}

const ChatMessageList: React.FC<Props> = ({ messages, onPressUser, onLongPressMessage }) => {
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages, autoScroll]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPressUser?.(item.user)}
        onLongPress={() => onLongPressMessage?.(item)}
        className="flex-row flex-wrap px-2 py-1"
      >
        <Text className="text-[11px] text-white/60 mr-1">
          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text
          className={[
            'text-[12px] font-semibold mr-1',
            item.isOwner ? 'text-white' : item.isModerator ? 'text-white/80' : 'text-white/60',
          ].join(' ')}
        >
          {item.user}
        </Text>
        {item.isGift ? (
          <Text className="text-[12px] text-amber-300 font-medium">sent a gift x{item.amount}</Text>
        ) : (
          <Text className="text-[12px] text-white/90 flex-shrink">{item.message}</Text>
        )}
      </TouchableOpacity>
    );
  }, [onPressUser, onLongPressMessage]);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const onScroll = useCallback((e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 60; // tolerance
    if (!atBottom && autoScroll) setAutoScroll(false);
    if (atBottom && !autoScroll) setAutoScroll(true);
  }, [autoScroll]);

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 12, paddingTop: 4 }}
        className="flex-1"
      />
    </View>
  );
};

export default ChatMessageList;
