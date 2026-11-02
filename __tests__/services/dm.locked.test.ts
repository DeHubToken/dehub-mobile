import { apiClient } from '../../libs/api.client';
import { getLockedMedia, unlockLockedMedia, uploadDmMedia } from '../../services/dm/dm.api';

jest.mock('../../libs/api.client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../libs/assets.util', () => ({
  getFileName: jest.fn(() => 'file'),
  guessMime: jest.fn(() => 'image/jpeg'),
}));
jest.mock('../../services/user.service', () => ({ getAccountSummaries: jest.fn() }));

const post = apiClient.post as jest.Mock;
const get = apiClient.get as jest.Mock;

function formFields(form: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const parts: any[] = form?._parts ?? (typeof form?.entries === 'function' ? Array.from(form.entries()) : []);
  for (const [k, v] of parts) out[k] = v;
  return out;
}

describe('locked DM media', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the price with a plain photo upload', async () => {
    post.mockResolvedValue({ _id: 'm1' });
    await uploadDmMedia({
      conversationId: 'c1', senderId: '0xme', files: [{ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }], lockPrice: 25,
    });
    expect(formFields(post.mock.calls[0][1]).lockPrice).toBe('25');
  });

  it('never sends a price with an encrypted upload', async () => {
    post.mockResolvedValue({ _id: 'm1' });
    await uploadDmMedia({
      conversationId: 'c1', senderId: '0xme', files: [{ uri: 'file:///a.bin', name: 'media.bin', type: 'application/octet-stream' }],
      encryptedKind: 'image', lockPrice: 25,
    });
    expect(formFields(post.mock.calls[0][1]).lockPrice).toBeUndefined();
  });

  it('reads status and unlocks through the locked routes', async () => {
    get.mockResolvedValue({ payTo: '0xseller', lock: { price: 25 } });
    post.mockResolvedValue({ status: 'unlocked', lock: { price: 25, mediaUrl: 'https://signed' } });
    await getLockedMedia('m1');
    expect(get.mock.calls[0][0]).toBe('/dm/locked/m1');
    const res = await unlockLockedMedia('m1', '0xabc');
    expect(post.mock.calls[0][0]).toBe('/dm/locked/m1/unlock');
    expect(post.mock.calls[0][1]).toEqual({ txHash: '0xabc' });
    expect(res.lock.mediaUrl).toBe('https://signed');
  });
});
