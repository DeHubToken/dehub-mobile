import React from 'react';
import { useChatSocket } from '../services/ws/chat.socket';

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useChatSocket(); // attach global socket handlers once

  return <>{children}</>;
};
