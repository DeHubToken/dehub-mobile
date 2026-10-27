jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { setAppPref } from '../../hooks/useAppPrefs';
import { postLandingActions, postLandingState, SHEET_CLEAR_MS } from '../../libs/postLanding';

describe('postLanding', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    postLandingState.landing = null;
    postLandingState.pinnedTokenId = null;
  });
  afterEach(() => jest.useRealTimers());

  it('lands as a ghost slot by default, once the composer has cleared', () => {
    expect(postLandingActions.begin('job-1')).toBe('ghost');
    expect(postLandingState.landing?.phase).toBe('waiting');
    jest.advanceTimersByTime(SHEET_CLEAR_MS);
    expect(postLandingState.landing?.phase).toBe('arriving');
    postLandingActions.settle('job-1');
    expect(postLandingState.landing?.phase).toBe('shown');
  });

  it('flies a morph in straight away', () => {
    setAppPref('postLanding', 'morph');
    postLandingActions.begin('job-2');
    expect(postLandingState.landing).toMatchObject({ style: 'morph', phase: 'arriving' });
    setAppPref('postLanding', 'ghost');
  });

  it('holds the pill card until the post is published', () => {
    setAppPref('postLanding', 'pill');
    postLandingActions.begin('job-3');
    jest.advanceTimersByTime(SHEET_CLEAR_MS * 2);
    expect(postLandingState.landing?.phase).toBe('waiting');
    postLandingActions.published('job-3');
    expect(postLandingState.landing?.phase).toBe('arriving');
    setAppPref('postLanding', 'ghost');
  });

  it('pins the real post when it takes the card\'s place, then forgets the landing', () => {
    postLandingActions.begin('job-4');
    jest.advanceTimersByTime(SHEET_CLEAR_MS);
    postLandingActions.settle('job-4');
    postLandingActions.leave('job-4', 42);
    expect(postLandingState.landing?.phase).toBe('leaving');
    expect(postLandingState.pinnedTokenId).toBe(42);
    jest.advanceTimersByTime(1000);
    expect(postLandingState.landing).toBeNull();
    postLandingActions.unpin();
    expect(postLandingState.pinnedTokenId).toBeNull();
  });

  it('drops a landing whose upload failed before the card came in', () => {
    postLandingActions.begin('job-5');
    postLandingActions.leave('job-5');
    expect(postLandingState.landing).toBeNull();
  });

  it('gives up on a card the feed never replaces', () => {
    postLandingActions.begin('job-6');
    jest.advanceTimersByTime(SHEET_CLEAR_MS);
    postLandingActions.settle('job-6');
    postLandingActions.published('job-6');
    jest.advanceTimersByTime(12_000);
    expect(postLandingState.landing?.phase).toBe('leaving');
  });
});
