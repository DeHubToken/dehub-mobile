import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import MessageBubble from '../components/Messages/MessageBubble';
import MessageInput from '../components/Messages/MessageInput';
import { useAuth } from '../context/AuthContext';

type ID = string;
type Message = {
  id: ID;
  tempId?: ID;
  conversationId: ID;
  senderId: ID;
  kind: 'text' | 'media' | 'system';
  text?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
};

export type ChatScreenProps = {
  route: { params?: { conversationId?: ID; title?: string } };
};

const ChatScreen: React.FC<ChatScreenProps> = ({ route }) => {
  const convId = route?.params?.conversationId || 'demo-1';
  const initial: Message[] = useMemo(
    () => [
      { id: 'm1', conversationId: convId, senderId: 'me', kind: 'text', text: 'Hey! 👋', status: 'read', createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
      { id: 'm2', conversationId: convId, senderId: 'u2', kind: 'text', text: "Hi! I'm doing great.", status: 'read', createdAt: new Date(Date.now() - 1000 * 60 * 58).toISOString() },
      { id: 'm3', conversationId: convId, senderId: 'u2', kind: 'text', text: 'Sent an attachment', status: 'read', createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString() },
    ],
    [convId]
  );
  const [list, setList] = useState<Message[]>(initial);
  const [isTyping, setIsTyping] = useState(false);
  const { user } = useAuth();

  const onSend = useCallback((text: string) => {
    const me = String((user as any)?.id || 'me');
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msg: Message = {
      id: tempId,
      tempId,
      conversationId: convId,
      senderId: me,
      kind: 'text',
      text,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    setList(prev => [...prev, msg]);
  }, [convId, user]);

  const title = route?.params?.title || 'Chat';

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={title} />
      {isTyping ? (
        <View className="px-4 py-1">
          <Text className="text-theme-neutrals-400 text-xs">Typing…</Text>
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View className="px-3 py-1">
            <MessageBubble msg={item as any} isMe={String(item.senderId) === String((user as any)?.id || 'me')} />
          </View>
        )}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
      <MessageInput
        onSend={onSend}
        onTypingChange={setIsTyping}
      />
    </View>
  );
};

export default ChatScreen;
