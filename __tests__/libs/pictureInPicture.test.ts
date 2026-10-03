import { canStartVideo, isPictureInPicturePlayer, setPictureInPicturePlayer, releaseAfterPictureInPicture } from '../../libs/pictureInPicture';
import { claimPostMedia, postMediaSession } from '../../libs/post-media-session';

afterEach(() => { setPictureInPicturePlayer(null); jest.useRealTimers(); });

it('keeps the PiP player while blocking autoplay from the next screen', () => {
  const player = {} as any;
  const next = {} as any;
  setPictureInPicturePlayer(player);
  expect(isPictureInPicturePlayer(player)).toBe(true);
  expect(canStartVideo(player)).toBe(true);
  expect(canStartVideo(next)).toBe(false);
  setPictureInPicturePlayer(null);
  expect(canStartVideo(next)).toBe(true);
});

it('releases native resources only when PiP closes, even if the source unmounts', () => {
  const player = {} as any;
  const release = jest.fn();
  setPictureInPicturePlayer(player);
  releaseAfterPictureInPicture(player, release);
  expect(release).not.toHaveBeenCalled();
  setPictureInPicturePlayer(null);
  setPictureInPicturePlayer(null);
  expect(release).toHaveBeenCalledTimes(1);
});

it('survives navigation past the native session disposal deadline', () => {
  jest.useFakeTimers();
  const dispose = jest.fn();
  const session = postMediaSession<any>('video:pip-test', dispose);
  const player = { pause: jest.fn() };
  session.value = player;
  const release = claimPostMedia('video:pip-test', session, {});
  setPictureInPicturePlayer(player as any);
  release();
  jest.advanceTimersByTime(10000);
  expect(player.pause).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  expect(session.value).toBe(player);
  setPictureInPicturePlayer(null);
  expect(dispose).toHaveBeenCalledWith(player);
  expect(session.value).toBeNull();
});

it('preserves a reclaimed native player after PiP closes', () => {
  jest.useFakeTimers();
  const dispose = jest.fn();
  const session = postMediaSession<any>('video:pip-reclaim-test', dispose);
  const player = { pause: jest.fn() };
  session.value = player;
  setPictureInPicturePlayer(player as any);
  claimPostMedia('video:pip-reclaim-test', session, {})();
  jest.advanceTimersByTime(2000);
  const release = claimPostMedia('video:pip-reclaim-test', session, {});
  setPictureInPicturePlayer(null);
  expect(dispose).not.toHaveBeenCalled();
  release();
  jest.advanceTimersByTime(2000);
  expect(dispose).toHaveBeenCalledTimes(1);
});
