import { normalizeMsg } from '../../libs/livechat-normalize';

/**
 * The live chat API names the message `id`, and names its author once — inside
 * `sender`. Every "is this mine" test on the screen reads `senderAddress`, so
 * if the normaliser stops deriving it the screen silently decides that nothing
 * belongs to you: no Edit, no Delete, no own-message colour, no @assistant tag.
 * That failure is invisible — the screen renders perfectly, just wrong — which
 * is why it is pinned here rather than left to review.
 */
describe('libs/livechat-normalize', () => {
  const apiMessage = {
    id: '507f1f77bcf86cd799439011',
    roomId: 'global',
    sender: { address: '0xAbCdEf0000000000000000000000000000000001', username: 'moscow' },
    content: 'hello',
    messageType: 'text' as const,
  };

  it('derives senderAddress from sender.address', () => {
    expect(normalizeMsg(apiMessage).senderAddress).toBe(
      '0xAbCdEf0000000000000000000000000000000001',
    );
  });

  it('maps id onto _id', () => {
    expect(normalizeMsg(apiMessage)._id).toBe('507f1f77bcf86cd799439011');
  });

  it('prefers an explicit senderAddress when the payload carries one', () => {
    const withBoth = { ...apiMessage, senderAddress: '0xDEAD' };
    expect(normalizeMsg(withBoth).senderAddress).toBe('0xDEAD');
  });

  it('leaves an authorless message with an empty address, never undefined', () => {
    const { sender, ...noSender } = apiMessage;
    expect(normalizeMsg(noSender).senderAddress).toBe('');
  });

  it('keeps _id when the payload already uses it', () => {
    const { id, ...withUnderscore } = { ...apiMessage, _id: 'abc' };
    expect(normalizeMsg(withUnderscore)._id).toBe('abc');
  });
});
