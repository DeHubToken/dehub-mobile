
import { deliverReply, readReplyDelivery } from '../reply-delivery';
import { observeCommentCount, readCommentCount } from '../comment-count-store';

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('reply delivery', () => {
  it('shows sending immediately, confirms the real row and clears the highlight', async () => {
    jest.useFakeTimers();
    observeCommentCount('delivery', 0);
    let accept!: (value: { id: number }) => void;
    const request = new Promise<{ id: number }>(resolve => { accept = resolve; });
    const task = deliverReply({ tokenId: 'delivery', tempId: -1, request: () => request, onSuccess: jest.fn(), onFailure: jest.fn() });
    expect(readReplyDelivery('delivery', -1)?.status).toBe('sending');
    expect(readCommentCount('delivery')).toBe(1);
    accept({ id: 9 });
    await task;
    expect(readReplyDelivery('delivery', 9)?.status).toBe('posted');
    jest.advanceTimersByTime(2400);
    expect(readReplyDelivery('delivery', 9)).toBeUndefined();
  });

  it('retries the original request once even when Retry is tapped twice', async () => {
    jest.useFakeTimers();
    observeCommentCount('retry', 4);
    const original = { text: 'my reply', gif: 'https://example.com/reply.gif', parentId: 12 };
    const payloads: unknown[] = [];
    let accept!: (value: { commentId: number }) => void;
    const request = jest.fn().mockImplementationOnce(async () => {
      payloads.push(original);
      throw new Error('Offline');
    }).mockImplementation(() => {
      payloads.push(original);
      return new Promise<{ commentId: number }>(resolve => { accept = resolve; });
    });
    await deliverReply({ tokenId: 'retry', tempId: -2, request, onSuccess: jest.fn(), onFailure: jest.fn() });
    expect(readCommentCount('retry')).toBe(4);
    expect(readReplyDelivery('retry', -2)?.status).toBe('failed');
    const retry = readReplyDelivery('retry', -2)!.retry!;
    const retrying = retry();
    await retry();
    expect(request).toHaveBeenCalledTimes(2);
    expect(readCommentCount('retry')).toBe(5);
    expect(payloads).toEqual([original, original]);
    accept({ commentId: 19 });
    await retrying;
    expect(readReplyDelivery('retry', 19)?.status).toBe('posted');
  });

  it('never retries an accepted post when refreshing its thread fails', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    observeCommentCount('accepted', 0);
    const onFailure = jest.fn();
    await deliverReply({ tokenId: 'accepted', tempId: -3, request: async () => ({ result: { id: 33 } }), onSuccess: async () => { throw new Error('Refresh unavailable'); }, onFailure });
    expect(onFailure).not.toHaveBeenCalled();
    expect(readCommentCount('accepted')).toBe(1);
    expect(readReplyDelivery('accepted', 33)?.retry).toBeUndefined();
    expect(readReplyDelivery('accepted', 33)?.status).toBe('posted');
  });
});
