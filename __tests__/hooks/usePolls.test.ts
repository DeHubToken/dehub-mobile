/**
 * What the feed's poll lookup must not do.
 * ========================================
 * Every feed card asks whether its post has a poll, because the feed payload
 * does not say. One request per card, against a global throttle of 20 requests
 * per 10 seconds, is how scrolling used to spend the whole budget on posts with
 * no poll and leave the feed refresh and comment loads to be rejected with 429.
 *
 * Pinned here: cards that mount together produce ONE request; an id with no
 * poll is written down and never asked about again, including after a restart;
 * and a FAILED lookup is never written down — the old code caught every error
 * to null and treated a cached null as fresh forever, so a single 429 hid a
 * real poll for the rest of the session.
 *
 * No jest.resetModules() anywhere below. The hook's caches are module-scoped by
 * design, but resetting the registry hands the hook a second copy of `react`
 * whose dispatcher the already-imported renderer never sets, and every render
 * dies on "Cannot read properties of null (reading 'useState')". Each test uses
 * its own token ids instead, and the restore-from-disk path is covered by
 * seeding storage before the module first reads it.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

const NO_POLL_KEY = 'dehub-posts-without-polls';

// Seeded before the first render so the hook's one-time read of the persisted
// set picks it up — this is the "app was killed and reopened" path.
const mockStore: Record<string, string> = { [NO_POLL_KEY]: '[100]' };

jest.mock('../../libs/storage', () => ({
  storage: {
    getString: jest.fn((k: string) => mockStore[k]),
    set: jest.fn((k: string, v: string) => {
      mockStore[k] = v;
    }),
    getBoolean: jest.fn(() => true),
    delete: jest.fn((k: string) => {
      delete mockStore[k];
    }),
  },
}));

const mockGetPolls = jest.fn();

jest.mock('../../services/polls.service', () => ({
  POLL_BATCH_LIMIT: 50,
  getPolls: (...args: any[]) => mockGetPolls(...args),
  createPoll: jest.fn(),
  voteOnPoll: jest.fn(),
  removePollVote: jest.fn(),
  closePoll: jest.fn(),
}));

jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));

import { usePoll } from '../../hooks/usePolls';

function poll(tokenId: number) {
  return { _id: `p${tokenId}`, tokenId, question: `Q${tokenId}`, options: [], totalVotes: 0 };
}

function emptied(): number[] {
  return JSON.parse(mockStore[NO_POLL_KEY] ?? '[]');
}

beforeEach(() => {
  mockGetPolls.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePoll', () => {
  // First, so the persisted set is read before anything else has touched it.
  it('never asks again about a post it already knows has no poll', async () => {
    const { result } = renderHook(() => usePoll(100));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.poll).toBeNull();
    // A poll can only be attached when a post is created, so the answer from a
    // previous run is still good and costs nothing to reuse.
    expect(mockGetPolls).not.toHaveBeenCalled();
  });

  it('asks about a page of cards in one request', async () => {
    mockGetPolls.mockResolvedValue({ status: true, result: { '2': poll(2) } });

    const a = renderHook(() => usePoll(1));
    const b = renderHook(() => usePoll(2));
    const c = renderHook(() => usePoll(3));

    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.poll).not.toBeNull());

    // The failure being pinned: this used to be one request per card, and a
    // feed page is ten to twenty cards.
    expect(mockGetPolls).toHaveBeenCalledTimes(1);
    expect(mockGetPolls).toHaveBeenCalledWith([1, 2, 3]);
    expect(b.result.current.poll?.tokenId).toBe(2);
    expect(c.result.current.poll).toBeNull();
  });

  it('writes down the ids that came back with no poll', async () => {
    mockGetPolls.mockResolvedValue({ status: true, result: {} });

    const first = renderHook(() => usePoll(7));
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    expect(mockGetPolls).toHaveBeenCalledTimes(1);
    expect(emptied()).toContain(7);

    const second = renderHook(() => usePoll(7));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockGetPolls).toHaveBeenCalledTimes(1);
  });

  it('does not record a failed lookup as "this post has no poll"', async () => {
    jest.useFakeTimers();

    const rateLimited: any = new Error('ThrottlerException: Too Many Requests');
    rateLimited.status = 429;
    mockGetPolls.mockRejectedValueOnce(rateLimited);

    renderHook(() => usePoll(9));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(mockGetPolls).toHaveBeenCalledTimes(1);
    // The failure being pinned: a 429 used to be written down as "no poll" and
    // read as fresh forever, so a real poll stayed invisible for the session.
    expect(emptied()).not.toContain(9);

    // And it must be willing to ask again — after a backoff, so a rate limit is
    // never retried straight back into itself.
    mockGetPolls.mockResolvedValue({ status: true, result: { '9': poll(9) } });
    renderHook(() => usePoll(9));
    await act(async () => {
      jest.advanceTimersByTime(11_000);
    });

    expect(mockGetPolls).toHaveBeenCalledTimes(2);
    expect(mockGetPolls).toHaveBeenLastCalledWith([9]);
  });
});
