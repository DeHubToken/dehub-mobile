import { useSyncExternalStore } from 'react';
import { useAuthState, useUser } from '../context/AuthContext';
import { storage } from '../libs/storage';
import { createPublicChatUnreadStore } from '../libs/public-chat-unread-store';

export const publicChatUnread = createPublicChatUnreadStore({
  read: (key) => storage.getString(key),
  write: (key, value) => storage.set(key, value),
});

export function usePublicChatUnreadCount() {
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const account = isSignedIn ? user?.walletAddress || user?.address || '' : '';
  return useSyncExternalStore(publicChatUnread.subscribe, () => publicChatUnread.count(account), () => 0);
}
