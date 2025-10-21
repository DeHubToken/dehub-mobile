import { actions } from '../../store/messages.state';
import { ID, Message, Conversation, TypingEvent, ReadReceipt } from '../../store/messages.types';
import { createLogger } from '../../libs/logger';
import { useEffect } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';

const log = createLogger('ChatSocket');

let registered = false;

function registerGlobalSocketHandlers(ws: ReturnType<typeof useWebSocket>) {
  if (registered) return;
  registered = true;

  ws.on('message_new', (payload: Message) => {
    actions.upsertMessages([payload]);
  });
  ws.on('message_update', (payload: Message) => {
    actions.updateMessage(payload);
  });
  ws.on('conversation_update', (conv: Conversation) => {
    actions.upsertConversations([conv]);
  });
  ws.on('typing', (event: TypingEvent) => {
    actions.setTyping(event);
  });
  ws.on('receipt_delivered', (r: ReadReceipt) => {
    // future: mark delivered
  });
  ws.on('receipt_read', (r: ReadReceipt) => {
    actions.applyRead(r);
  });
  ws.on('ack', ({ tempId, messageId, message }: any) => {
    const msg: Message | undefined = message;
    if (tempId && msg) actions.applyAck(tempId, msg);
  });

  log.info('registered chat socket handlers');
}

export function useChatSocket() {
  const ws = useWebSocket();
  useEffect(() => {
    registerGlobalSocketHandlers(ws);
  }, [ws]);
}
