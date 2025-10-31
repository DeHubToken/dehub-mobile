import React, { useEffect } from 'react';
import { hydrateFromStorage, actions } from '../store/messages.state';
import { useChatSocket } from '../services/ws/chat.socket';
import { fetchConversations } from '../services/dm/conversations';
import { createLogger } from '../libs/logger';

const log = createLogger('MessagingProvider');

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useChatSocket(); // attach global socket handlers once

  useEffect(() => {
    // (async () => {
    //   await hydrateFromStorage();
    //   try {
    //     const first = await fetchConversations(undefined, 30);
    //     actions.upsertConversations(first.items);
    //   } catch (e) {
    //     log.warn('initial conversations fetch failed', e);
    //   }
    // })();
  }, []);

  return <>{children}</>;
};
