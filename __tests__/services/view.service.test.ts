/**
 * Feed impressions: a post counts the moment half of it is on screen, with no
 * dwell time — the same rule as web. Leaving the screen and coming back is
 * another impression.
 */
const mockPost = jest.fn();
jest.mock('../../libs', () => ({
  apiClient: { get: jest.fn(), post: (...args: any[]) => mockPost(...args) },
}));
const mockAnon = jest.fn();
jest.mock('../../services/anonView.service', () => ({
  recordAnonViews: (ids: string[]) => mockAnon(ids),
}));

import { createPostViewTracker, flushBatchViews } from '../../services/view.service';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue({ processed: 1, newUniqueViews: 1, rateLimited: 0 });
  mockAnon.mockReset().mockResolvedValue({ success: true, submitted: 1, recorded: 1 });
});

it('counts a post the moment half of it is on screen', async () => {
  const tracker = createPostViewTracker(101, true);
  tracker.onVisibilityChange(0.6);
  expect(tracker.hasRecorded()).toBe(true);

  await settle();
  await flushBatchViews();
  expect(mockPost).toHaveBeenCalledWith('/view/batch', { tokenIds: [101] }, { isAuthRequired: true });
});

it('does not count a post that is less than half on screen', async () => {
  const tracker = createPostViewTracker(102, true);
  tracker.onVisibilityChange(0.4);
  expect(tracker.hasRecorded()).toBe(false);

  await settle();
  await flushBatchViews();
  expect(mockPost).not.toHaveBeenCalled();
});

it('counts again after the post leaves the screen and comes back', async () => {
  const tracker = createPostViewTracker(103, false);
  tracker.onVisibilityChange(0.6);
  tracker.onVisibilityChange(0.8); // still on screen: the same impression
  await settle();
  await flushBatchViews();
  expect(mockAnon).toHaveBeenCalledTimes(1);

  tracker.onVisibilityChange(0);
  tracker.onVisibilityChange(0.6);
  await settle();
  await flushBatchViews();
  expect(mockAnon).toHaveBeenCalledTimes(2);
  expect(mockAnon).toHaveBeenLastCalledWith(['103']);
});
