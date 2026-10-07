/** Bounded, account-scoped public chat history. Shared with mobile. */
export interface PublicChatUnreadMessage {
  id: string;
  createdAt: string;
  sender: string;
  excluded?: boolean;
}

interface ReadState {
  readAt: number;
  unread: Map<string, number>;
}

export function createPublicChatUnreadStore(storage: {
  read: (key: string) => string | null | undefined;
  write: (key: string, value: string) => void;
}) {
  const accounts = new Map<string, ReadState>();
  const listeners = new Set<() => void>();
  const keyFor = (account: string) => `dehub_public_chat_unread:${account.toLowerCase()}`;
  const emit = () => listeners.forEach((listener) => listener());

  function stateFor(account: string): ReadState {
    const key = account.toLowerCase();
    const cached = accounts.get(key);
    if (cached) return cached;
    const state: ReadState = { readAt: 0, unread: new Map() };
    try {
      const saved = JSON.parse(storage.read(keyFor(key)) || 'null');
      if (saved && Number.isFinite(saved.readAt) && saved.readAt >= 0) {
        state.readAt = saved.readAt;
        if (Array.isArray(saved.unread)) {
          for (const entry of saved.unread.slice(-100)) {
            if (Array.isArray(entry) && typeof entry[0] === 'string'
              && Number.isFinite(entry[1]) && entry[1] > state.readAt) {
              state.unread.set(entry[0], entry[1]);
            }
          }
        }
      }
    } catch { /* unavailable or stale storage; keep this session working */ }
    accounts.set(key, state);
    return state;
  }

  function save(account: string, state: ReadState) {
    try {
      storage.write(keyFor(account), JSON.stringify({ readAt: state.readAt, unread: [...state.unread] }));
    } catch { /* keep the in-memory count when storage is unavailable */ }
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    count(account: string) {
      return account ? stateFor(account).unread.size : 0;
    },
    record(account: string, message: PublicChatUnreadMessage): boolean {
      if (!account || !message.id || message.excluded
        || message.sender.toLowerCase() === account.toLowerCase()) return false;
      const at = Date.parse(message.createdAt);
      const state = stateFor(account);
      if (!Number.isFinite(at) || at <= state.readAt || state.unread.has(message.id)) return false;
      state.unread.set(message.id, at);
      // Every badge renders 99+ above this point; retain the newest window.
      if (state.unread.size > 100) {
        state.unread = new Map([...state.unread].sort((a, b) => a[1] - b[1]).slice(-100));
      }
      save(account, state);
      return true;
    },
    markRead(account: string, at = Date.now()) {
      if (!account) return;
      const state = stateFor(account);
      state.readAt = Math.max(state.readAt, at, ...state.unread.values());
      state.unread.clear();
      save(account, state);
    },
    refresh() {
      accounts.clear();
      emit();
    },
  };
}
