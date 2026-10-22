import { isPollOpen, parsePoll, pollLeaders, pollShares, type LivePoll } from '../../libs/live-overlay/polls';

const poll = (votes: number[], over: Partial<LivePoll> = {}): LivePoll => ({
  id: 'p1',
  streamId: 's1',
  question: 'Next?',
  options: votes.map((v, i) => ({ text: `o${i}`, votes: v })),
  total: votes.reduce((a, b) => a + b, 0),
  endsAt: new Date(Date.now() + 60_000).toISOString(),
  closed: false,
  ...over,
});

describe('live poll shares', () => {
  it('adds up to exactly 100', () => {
    expect(pollShares(poll([1, 1, 1]))).toEqual([34, 33, 33]);
    expect(pollShares(poll([2, 1])).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('is all zero before anyone votes, and never gives a share to an option nobody chose', () => {
    expect(pollShares(poll([0, 0]))).toEqual([0, 0]);
    expect(pollShares(poll([3, 0, 0]))).toEqual([100, 0, 0]);
  });

  it('names every option tied for the lead, and none before a vote', () => {
    expect([...pollLeaders(poll([2, 2, 1]))]).toEqual([0, 1]);
    expect(pollLeaders(poll([0, 0])).size).toBe(0);
  });
});

describe('live poll state', () => {
  it('stops taking votes when the clock runs out, update or not', () => {
    const p = poll([0, 0], { endsAt: new Date(Date.now() - 1).toISOString() });
    expect(isPollOpen(p)).toBe(false);
    expect(isPollOpen(poll([0, 0]))).toBe(true);
    expect(isPollOpen(poll([0, 0], { closed: true }))).toBe(false);
  });

  it('reads only what looks like a poll', () => {
    expect(parsePoll(null)).toBeNull();
    expect(parsePoll({ id: 'x', question: 'q' })).toBeNull();
    expect(parsePoll({ id: 'x', question: 'q', options: [{ text: 'a', votes: -2 }], total: '3' })).toEqual(
      expect.objectContaining({ options: [{ text: 'a', votes: 0 }], total: 3, closed: false }),
    );
  });
});
