jest.mock('../../libs/analytics', () => ({ track: jest.fn() }));
import { Share } from 'react-native';
import { track } from '../../libs/analytics';
import {
  getShareRefCode,
  setShareRefCode,
  shareContentWithRef,
  shareWithRef,
  withShareRef,
  withShareRefText,
} from '../../libs/shareRef';

// The jest preset leaves these constants undefined, which would make every result look shared.
Object.assign(Share, { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction' });
const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: 'com.apple.UIKit.activity.Message' });
beforeEach(() => { jest.clearAllMocks(); setShareRefCode('ABC123'); });

describe('withShareRef', () => {
  it('adds the code to dehub.io links, keeping existing query and hash', () => {
    expect(withShareRef('https://dehub.io/app/post/12')).toBe('https://dehub.io/app/post/12?ref=ABC123');
    expect(withShareRef('https://dehub.io/app/post/12?c=9')).toBe('https://dehub.io/app/post/12?c=9&ref=ABC123');
    expect(withShareRef('https://www.dehub.io/@mal#top')).toBe('https://www.dehub.io/@mal?ref=ABC123#top');
    expect(withShareRef('https://dehub.io')).toBe('https://dehub.io?ref=ABC123');
  });

  it('leaves other hosts, invite links and already tagged links alone', () => {
    expect(withShareRef('https://evil.com/?x=https://dehub.io')).toBe('https://evil.com/?x=https://dehub.io');
    expect(withShareRef('https://dehub.io.evil.com/app')).toBe('https://dehub.io.evil.com/app');
    expect(withShareRef('https://dehub.io/r/ABC123')).toBe('https://dehub.io/r/ABC123');
    expect(withShareRef('https://dehub.io/app?ref=OTHER')).toBe('https://dehub.io/app?ref=OTHER');
  });

  it('does nothing without a code', () => {
    setShareRefCode(null);
    expect(getShareRefCode()).toBeNull();
    expect(withShareRef('https://dehub.io/app/post/12')).toBe('https://dehub.io/app/post/12');
  });

  it('rejects malformed codes and upper-cases valid ones', () => {
    setShareRefCode('bad code!');
    expect(getShareRefCode()).toBeNull();
    setShareRefCode('abc_12');
    expect(getShareRefCode()).toBe('ABC_12');
  });
});

it('tags every link inside a message without swallowing trailing punctuation', () => {
  expect(withShareRefText('Look https://dehub.io/app/post/1. And https://dehub.io/@mal!'))
    .toBe('Look https://dehub.io/app/post/1?ref=ABC123. And https://dehub.io/@mal?ref=ABC123!');
  expect(withShareRefText('Join me on DeHub')).toBe('Join me on DeHub');
});

it('tags both the message and url fields', () => {
  expect(shareContentWithRef({ message: 'Post https://dehub.io/app/post/1', url: 'https://dehub.io/app/post/1' }))
    .toEqual({ message: 'Post https://dehub.io/app/post/1?ref=ABC123', url: 'https://dehub.io/app/post/1?ref=ABC123' });
});

it('shares the tagged content and records the channel', async () => {
  await shareWithRef({ message: 'https://dehub.io/app/post/1' }, undefined, 'post');
  expect(share).toHaveBeenCalledWith({ message: 'https://dehub.io/app/post/1?ref=ABC123' });
  expect(track).toHaveBeenCalledWith('share', { kind: 'post', channel: 'com.apple.UIKit.activity.Message', has_ref: true });
});

it('does not record a dismissed share', async () => {
  share.mockResolvedValueOnce({ action: Share.dismissedAction });
  await shareWithRef({ message: 'https://dehub.io/app' });
  expect(track).not.toHaveBeenCalled();
});
