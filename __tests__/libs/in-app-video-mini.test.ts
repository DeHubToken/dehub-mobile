import { claimPostMedia, ownsPostMedia, postMediaSession } from '../../libs/post-media-session';
import { canStartVideo } from '../../libs/pictureInPicture';
import {
  cancelInAppMiniHandoff, closeInAppVideoMini, finishInAppMiniRestore, getInAppVideoMini, inAppMiniReady,
  openInAppVideoMini, restoreInAppVideoMini,
} from '../../libs/in-app-video-mini';

let sequence = 0;
const releases: (() => void)[] = [];
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  closeInAppVideoMini();
  releases.splice(0).forEach(release => release());
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

function source() {
  const url = `https://media.example/${sequence++}.m3u8`;
  const player = { pause: jest.fn(), playing: true } as any;
  const dispose = jest.fn();
  const session = postMediaSession<any>(`video:${url}`, dispose);
  session.value = player;
  session.loadedSource = url;
  const token = {};
  const release = claimPostMedia(`video:${url}`, session, token);
  releases.push(release);
  const onReady = jest.fn();
  const onCancel = jest.fn();
  const input = { player, session, url, item: { tokenId: 7, postType: 'video' } as any,
    initialRect: { x: 10, y: 200, width: 300, height: 168 }, onReady, onCancel };
  return { ...input, input, release, token, dispose };
}

it('retains the exact decoder/source before the source route releases its claim', () => {
  const { input, player, session, release, dispose } = source();
  expect(openInAppVideoMini(input)).toBe(true);
  const mini = getInAppVideoMini()!;
  expect(session.value).toBe(player);
  expect(session.loadedSource).toBe(input.url);
  expect(ownsPostMedia(session, mini.token)).toBe(true);
  release();
  jest.advanceTimersByTime(2500);
  expect(player.pause).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  expect(canStartVideo(player)).toBe(true);
  expect(canStartVideo({})).toBe(false);
});

it('dismisses the watch route only once the hosted surface acknowledges readiness', () => {
  const { input, onReady, onCancel } = source();
  openInAppVideoMini(input);
  const mini = getInAppVideoMini()!;
  expect(onReady).not.toHaveBeenCalled();
  inAppMiniReady(mini);
  inAppMiniReady(mini);
  expect(onReady).toHaveBeenCalledTimes(1);
  closeInAppVideoMini();
  expect(onCancel).not.toHaveBeenCalled();
});

it('restores the existing decoder without pausing it when the new route draws', () => {
  const { input, session, player, release } = source();
  openInAppVideoMini(input);
  release();
  const mini = getInAppVideoMini()!;
  inAppMiniReady(mini);
  expect(restoreInAppVideoMini(mini)).toBe(true);
  expect(restoreInAppVideoMini(mini)).toBe(false);
  const restoredToken = {};
  releases.push(claimPostMedia(`video:${input.url}`, session, restoredToken, true));
  finishInAppMiniRestore(player);
  expect(getInAppVideoMini()).toBeNull();
  expect(session.value).toBe(player);
  expect(ownsPostMedia(session, restoredToken)).toBe(true);
  expect(player.pause).not.toHaveBeenCalled();
  expect(canStartVideo({})).toBe(true);
});

it('keeps the mini surface when the underlying feed remounts the same clip', () => {
  const { input, session } = source();
  openInAppVideoMini(input);
  const mini = getInAppVideoMini()!;
  const recycledFeedToken = {};
  releases.push(claimPostMedia(`video:${input.url}`, session, recycledFeedToken));
  expect(ownsPostMedia(session, mini.token)).toBe(true);
  expect(ownsPostMedia(session, recycledFeedToken)).toBe(false);
});

it('cancels a pending handoff and releases its lease when closed', () => {
  const { input, session, token, player, onCancel } = source();
  openInAppVideoMini(input);
  closeInAppVideoMini();
  expect(getInAppVideoMini()).toBeNull();
  expect(ownsPostMedia(session, token)).toBe(true);
  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('returns a failed first-frame handoff to the source without pausing or disposing it', () => {
  const { input, player, session, token, onCancel, onReady, dispose } = source();
  openInAppVideoMini(input);
  cancelInAppMiniHandoff(getInAppVideoMini()!);
  expect(getInAppVideoMini()).toBeNull();
  expect(ownsPostMedia(session, token)).toBe(true);
  expect(player.pause).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onReady).not.toHaveBeenCalled();
});

it('closes a mini-only lease exactly once without a duplicate pause', () => {
  const { input, player, release, session } = source();
  openInAppVideoMini(input);
  release();
  closeInAppVideoMini();
  closeInAppVideoMini();
  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(session.userPaused).toBe(true);
  expect(getInAppVideoMini()).toBeNull();
});

it('hands a playing clip back to the feed card muted when closed', () => {
  const { input, player, session, release } = source();
  openInAppVideoMini(input);
  release();
  const mini = getInAppVideoMini()!;
  inAppMiniReady(mini);
  const feedToken = {};
  releases.push(claimPostMedia(`video:${input.url}`, session, feedToken));
  player.muted = false;
  closeInAppVideoMini();
  expect(ownsPostMedia(session, feedToken)).toBe(true);
  expect(player.pause).not.toHaveBeenCalled();
  expect(player.muted).toBe(true);
  expect(session.userPaused).toBe(false);
});

it('keeps a clip paused in the mini paused when the feed takes it back', () => {
  const { input, player, session, release } = source();
  openInAppVideoMini(input);
  release();
  inAppMiniReady(getInAppVideoMini()!);
  releases.push(claimPostMedia(`video:${input.url}`, session, {}));
  session.userPaused = true;
  closeInAppVideoMini();
  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(session.userPaused).toBe(true);
});

it('does not restore before the first hosted frame completes its source handoff', () => {
  const { input } = source();
  openInAppVideoMini(input);
  expect(restoreInAppVideoMini(getInAppVideoMini()!)).toBe(false);
});
