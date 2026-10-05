
import { confirmDmSend, type DmSendPayload, type DmSendTransport } from '../../libs/dm-send-confirmation';

class ChatTransport implements DmSendTransport {
  handlers = new Map<string, Set<(data: any) => void>>();
  emitted: DmSendPayload[] = [];
  on(event: string, handler: (data: any) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)!.delete(handler); };
  }
  emit(payload: DmSendPayload) { this.emitted.push(payload); }
  receive(event: string, data: any) { this.handlers.get(event)?.forEach(handler => handler(data)); }
  get listenerCount() { return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0); }
}

const payload = { dmId: 'conversation-1', content: 'reply', type: 'msg' };
const echo = { _id: 'saved-1', conversation: payload.dmId, content: 'reply', msgType: 'msg', author: 'me' };
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('persisted DM confirmation', () => {
  it('stays pending beyond the old two-second refresh until the saved echo arrives', async () => {
    const transport = new ChatTransport();
    let saved = false;
    const pending = confirmDmSend(transport, payload).then(message => { saved = true; return message; });
    await jest.advanceTimersByTimeAsync(3000);
    expect(saved).toBe(false);
    expect(transport.emitted).toEqual([payload]);
    transport.receive('sendMessage', echo);
    await expect(pending).resolves.toEqual(echo);
    expect(transport.listenerCount).toBe(0);
  });

  it('does not confirm on an incoming reply, another thread, or another outgoing message', async () => {
    const transport = new ChatTransport();
    let saved = false;
    const pending = confirmDmSend(transport, payload).then(() => { saved = true; });
    transport.receive('sendMessage', { ...echo, author: 'other' });
    transport.receive('sendMessage', { ...echo, conversation: 'conversation-2' });
    transport.receive('sendMessage', { ...echo, content: 'different' });
    await jest.advanceTimersByTimeAsync(1);
    expect(saved).toBe(false);
    transport.receive('sendMessage', echo);
    await pending;
  });

  it('matches encrypted wire content and a populated conversation', async () => {
    const transport = new ChatTransport();
    const content = 'encrypted:nonce:ciphertext';
    const pending = confirmDmSend(transport, { ...payload, content });
    const saved = { ...echo, content, conversation: { _id: payload.dmId } };
    transport.receive('sendMessage', saved);
    await expect(pending).resolves.toEqual(saved);
  });

  it('surfaces the server rejection instead of claiming the reply was sent', async () => {
    const transport = new ChatTransport();
    const pending = confirmDmSend(transport, payload);
    const assertion = expect(pending).rejects.toThrow('Recipient requires a message fee.');
    transport.receive('error', { msg: 'Recipient requires a message fee.', code: 'DM_FEE_REQUIRED' });
    await assertion;
    expect(transport.listenerCount).toBe(0);
  });

  it('rejects a silent server once, without retrying or leaking listeners', async () => {
    const transport = new ChatTransport();
    const assertion = expect(confirmDmSend(transport, payload)).rejects.toThrow(/did not confirm/);
    await jest.advanceTimersByTimeAsync(15_001);
    await assertion;
    expect(transport.emitted).toHaveLength(1);
    expect(transport.listenerCount).toBe(0);
  });

  it('reports a disconnect while awaiting confirmation', async () => {
    const transport = new ChatTransport();
    const assertion = expect(confirmDmSend(transport, payload)).rejects.toThrow(/disconnected/);
    transport.receive('disconnected', undefined);
    await assertion;
    expect(transport.listenerCount).toBe(0);
  });

  it('catches a disconnected transport that refuses the emit', async () => {
    const transport = new ChatTransport();
    transport.emit = () => { throw new Error('Not connected'); };
    await expect(confirmDmSend(transport, payload)).rejects.toThrow('Not connected');
    expect(transport.listenerCount).toBe(0);
  });

  it('subscribes before emitting, including an immediate server response', async () => {
    const transport = new ChatTransport();
    transport.emit = () => { transport.receive('sendMessage', echo); };
    await expect(confirmDmSend(transport, payload)).resolves.toEqual(echo);
    expect(transport.listenerCount).toBe(0);
  });

  it('matches a GIF by its URL as well as its caption', async () => {
    const transport = new ChatTransport();
    const gif = 'https://example.test/reply.gif';
    const pending = confirmDmSend(transport, { ...payload, type: 'gif', gif });
    transport.receive('sendMessage', { ...echo, msgType: 'gif', mediaUrls: [{ url: 'other.gif' }] });
    const saved = { ...echo, msgType: 'gif', mediaUrls: [{ url: gif }] };
    transport.receive('sendMessage', saved);
    await expect(pending).resolves.toEqual(saved);
  });
});
