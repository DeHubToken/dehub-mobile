import { LIVE_ENGAGEMENT_POLL_MS } from '../../hooks/useNewPostsSignal';

describe('live engagement polling', () => {
  it('refreshes visible post views and reactions every 45 seconds', () => {
    expect(LIVE_ENGAGEMENT_POLL_MS).toBe(45_000);
  });
});
