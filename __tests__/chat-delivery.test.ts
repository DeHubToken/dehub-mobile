import { confirmChatDelivery, roomMessageMatches } from '../../libs/chat-delivery';

afterEach(() => jest.useRealTimers());
function channel() {
  const handlers = new Map<string, Set<(message: any) => void>>();
  return {
    listen(event: string, handler: (message: any) => void) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler); handlers.set(event, set);
      return () => { set.delete(handler); };
    },
    receive(event: string, message: any = {}) { handlers.get(event)?.forEach(handler => handler(message)); },
    count() { return [...handlers.values()].reduce((n, set) => n + set.size, 0); },
  };
}
const expected = { account: 'alice', room: 'one', content: 'hello' };
const accepted = { _id: 'server-id', roomId: 'one', senderAddress: 'ALICE', content: 'hello' };

describe('confirmed chat submission', () => {
  it('registers before emission and accepts the matching server message', async () => {
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => socket.receive('message', accepted),
      messageEvent: 'message', errorEvent: 'error', matches: value => roomMessageMatches(value, expected) });
    expect(await sent).toBe(true);
    expect(socket.count()).toBe(0);
  });
  it('does not treat emitting, another sender, or another room as success', async () => {
    jest.useFakeTimers();
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => {}, messageEvent: 'message', errorEvent: 'error',
      matches: value => roomMessageMatches(value, expected), timeoutMs: 50 });
    socket.receive('message', { ...accepted, senderAddress: 'bob' });
    socket.receive('message', { ...accepted, roomId: 'two' });
    socket.receive('message', { ...accepted, _id: undefined });
    jest.advanceTimersByTime(50);
    expect(await sent).toBe(false);
    expect(socket.count()).toBe(0);
  });
  it.each(['error', 'disconnect'])('keeps a draft on %s and removes listeners', async event => {
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => {}, messageEvent: 'message', errorEvent: 'error', matches: () => true });
    socket.receive(event);
    expect(await sent).toBe(false);
    expect(socket.count()).toBe(0);
  });
  it('matches an edited message and attachment only when their identities agree', () => {
    expect(roomMessageMatches(accepted, { ...expected, messageId: 'other' })).toBe(false);
    expect(roomMessageMatches(accepted, { ...expected, attachment: 'photo' })).toBe(false);
    expect(roomMessageMatches({ ...accepted, media: [{ url: 'photo' }] }, { ...expected, attachment: 'photo' })).toBe(true);
  });
});
