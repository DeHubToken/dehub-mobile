/**
 * The video uploaded while the post is still being written.
 *
 * Its whole contract with the post is "use me if you can, otherwise send the
 * file": a draft the server refused must never be handed to a job, a draft the
 * creator walked away from must stop, and one a post has claimed must survive
 * the composer closing.
 */
const mockUpload = jest.fn();
jest.mock('../../libs/xhr-upload', () => ({
  xhrUploadFormData: (opts: any) => mockUpload(opts),
}));
jest.mock('../../libs', () => ({ apiClient: { get: jest.fn(() => new Promise(() => {})) } }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn() }));
const mockUnsubscribe = jest.fn();
jest.mock('../../libs/socket-events', () => ({ onSocketEvent: jest.fn(() => mockUnsubscribe) }));

import {
  startDraftVideo,
  cancelDraftVideo,
  claimDraftVideo,
  getDraftVideo,
  waitForDraftVideo,
  releaseDraftVideo,
} from '../../services/draftVideo';
import { onSocketEvent } from '../../libs/socket-events';

const media = (uri: string) => ({ uri, name: 'v.mp4', mimeType: 'video/mp4' });

beforeEach(() => {
  jest.useRealTimers();
  mockUpload.mockReset();
  mockUnsubscribe.mockReset();
});

it('hands a finished upload to the post and follows its transcode', async () => {
  mockUpload.mockResolvedValue({ draftId: 'd1', status: 'processing' });
  const key = startDraftVideo(media('file:///a.mp4'));
  const claim = claimDraftVideo('file:///a.mp4', 'job-1');
  expect(claim?.key).toBe(key);

  await expect(waitForDraftVideo(key, () => {}, { current: false })).resolves.toBe('d1');
  expect(getDraftVideo(key)?.phase).toBe('processing');
  expect(onSocketEvent).toHaveBeenCalledWith('draft:d1', expect.any(Function));

  // Claimed: closing the composer leaves it alone.
  cancelDraftVideo(key);
  expect(getDraftVideo(key)).toBeDefined();
  releaseDraftVideo(key);
  expect(getDraftVideo(key)).toBeUndefined();
  expect(mockUnsubscribe).toHaveBeenCalled();
});

it('falls back to the file when the server has no draft endpoint', async () => {
  mockUpload.mockRejectedValue(Object.assign(new Error('Upload failed (404)'), { status: 404 }));
  const key = startDraftVideo(media('file:///b.mp4'));
  await expect(waitForDraftVideo(key, () => {}, { current: false })).resolves.toBeNull();
  expect(getDraftVideo(key)?.phase).toBe('unusable');
  // Nothing left to claim.
  expect(claimDraftVideo('file:///b.mp4', 'job-2')).toBeNull();
  releaseDraftVideo(key);
});

it('drops an unclaimed draft when the composer lets go of it', () => {
  let opts: any;
  mockUpload.mockImplementation((o: any) => {
    opts = o;
    return new Promise(() => {});
  });
  const key = startDraftVideo(media('file:///c.mp4'));
  cancelDraftVideo(key);
  expect(getDraftVideo(key)).toBeUndefined();
  expect(opts.abortRef.current).toBe(true);
});

it('reports no draft after a restart', async () => {
  await expect(waitForDraftVideo('gone', () => {}, { current: false })).resolves.toBeNull();
});
