import { createPublicChatUnreadStore } from '../../libs/public-chat-unread-store';

const BASE = Date.parse('2026-10-07T12:00:00Z');
const message = (id: string, offset = 1, sender = '0xother') => ({
  id, createdAt: new Date(BASE + offset).toISOString(), sender,
});

function fixture() {
  const saved = new Map<string, string>();
  const storage = {
    read: (key: string) => saved.get(key),
    write: (key: string, value: string) => { saved.set(key, value); },
  };
  return { saved, storage, store: createPublicChatUnreadStore(storage) };
}

describe('public chat unread counts', () => {
  it('deduplicates history and socket events and excludes own or automated messages', () => {
    const { store } = fixture();
    expect(store.record('0xME', message('one'))).toBe(true);
    expect(store.record('0xme', message('one'))).toBe(false);
    store.record('0xme', message('own', 2, '0xME'));
    store.record('0xme', { ...message('bot'), excluded: true });
    store.record('0xme', { ...message('invalid'), createdAt: 'invalid' });
    expect(store.count('0xme')).toBe(1);
  });

  it('clears on opening chat and ignores replayed history after a reload', () => {
    const { store, storage } = fixture();
    store.record('0xme', message('old'));
    store.markRead('0xme', BASE + 10);
    expect(store.count('0xme')).toBe(0);
    const restored = createPublicChatUnreadStore(storage);
    expect(restored.record('0xme', message('old'))).toBe(false);
    expect(restored.record('0xme', message('new', 11))).toBe(true);
    expect(restored.count('0xme')).toBe(1);
  });

  it('preserves outstanding messages per account without clearing another account', () => {
    const { store, storage } = fixture();
    store.record('0xme', message('one'));
    store.record('0xsecond', message('two'));
    const restored = createPublicChatUnreadStore(storage);
    expect(restored.count('0xME')).toBe(1);
    restored.markRead('0xsecond', BASE + 20);
    expect(restored.count('0xme')).toBe(1);
    expect(restored.count('0xsecond')).toBe(0);
    expect(restored.count('')).toBe(0);
  });

  it('keeps the 99+ count bounded and acknowledges server timestamps ahead of the device', () => {
    const { store } = fixture();
    for (let n = 1; n <= 150; n++) store.record('0xme', message(String(n), n));
    expect(store.count('0xme')).toBe(100);
    store.markRead('0xme', BASE);
    expect(store.record('0xme', message('150', 150))).toBe(false);
    expect(store.count('0xme')).toBe(0);
  });

  it('updates subscribers and keeps counting when persistence is unavailable', () => {
    const store = createPublicChatUnreadStore({
      read: () => { throw new Error('disabled'); },
      write: () => { throw new Error('disabled'); },
    });
    let updates = 0;
    const unsubscribe = store.subscribe(() => { updates++; });
    store.record('0xme', message('one'));
    expect(store.count('0xme')).toBe(1);
    store.markRead('0xme', BASE + 10);
    expect(updates).toBe(2);
    unsubscribe();
    store.record('0xme', message('two', 11));
    expect(updates).toBe(2);
  });
});
