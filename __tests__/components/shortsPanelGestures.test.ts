import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import ts from 'typescript';

const source = readFileSync(resolve(__dirname, '../../screens/ShortsViewerScreen.tsx'), 'utf8');

function viewer(overrides: Record<string, unknown> = {}) {
  const handlers: Record<string, Function> = {};
  const pan: Record<string, Function> = {};
  for (const method of ['enabled', 'manualActivation', 'blocksExternalGesture']) pan[method] = () => pan;
  for (const method of ['onTouchesDown', 'onTouchesMove', 'onEnd']) {
    pan[method] = (callback: Function) => { handlers[method] = callback; return pan; };
  }
  const context = {
    useMemo: (callback: Function) => callback(), useCallback: (callback: Function) => callback,
    Gesture: { Pan: () => pan }, runOnJS: (callback: Function) => callback,
    isActive: true, showComments: false, screenshotMode: false,
    overlaysHidden: true, autoHidden: false, itemHeight: 800, SCREEN_HEIGHT: 800,
    RESTORE_ZONE_TOP: 0.55, RESTORE_ZONE_BOTTOM: 0.85,
    DRAG_CLAIM_MIN: 16, DRAG_RELEASE_MIN: 6, HIDE_SWIPE_MIN: 40,
    restorePanStart: { value: { x: 0, y: 0 } }, pagerGesture: {},
    setOverlaysHidden: jest.fn(), setAutoHidden: jest.fn(), resetTapSequence: jest.fn(),
    longPressActiveRef: { current: false }, pickerOpen: false, setOpenTray: jest.fn(),
    commitTapReaction: jest.fn(), showTapReactionAnimation: jest.fn(),
    continuesTapGesture: () => false, lastTapRef: { current: 0 }, tapCountRef: { current: 0 },
    tapTimerRef: { current: null }, singleTapToggledPlaybackRef: { current: false },
    togglePlayPauseRef: { current: jest.fn() }, TAP_GESTURE_WINDOW_MS: 260,
    TAP_REACTION_RESOLUTION_MS: 260, setTimeout: () => 1, clearTimeout: jest.fn(),
    ...overrides,
  };
  const callbacks = source.slice(source.indexOf('  const restorePan ='), source.indexOf('  // Long press —'));
  const code = ts.transpileModule(callbacks + '\n({ handleScreenTap })', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return { ...context, ...runInNewContext(code, context), handlers };
}

describe('shorts panel gestures', () => {
  it('claims an upward lower-area swipe before the pager and restores on release', () => {
    const v = viewer();
    const state = { activate: jest.fn(), fail: jest.fn() };
    v.handlers.onTouchesDown({ numberOfTouches: 1, allTouches: [{ x: 150, y: 700 }] }, state);
    v.handlers.onTouchesMove({ numberOfTouches: 1, allTouches: [{ x: 150, y: 680 }] }, state);
    expect(state.activate).toHaveBeenCalledTimes(1);
    v.handlers.onEnd({ translationY: -60, translationX: 0 }, true);
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
    expect(v.setAutoHidden).toHaveBeenCalledWith(false);
    expect(v.togglePlayPauseRef.current).not.toHaveBeenCalled();
  });

  it.each([[-25, true], [-60, false]])('does not restore a short or cancelled swipe: %s', (dy, success) => {
    const v = viewer();
    v.handlers.onEnd({ translationY: dy, translationX: 0 }, success);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('releases downward swipes to the pager', () => {
    const v = viewer();
    const state = { activate: jest.fn(), fail: jest.fn() };
    v.handlers.onTouchesDown({ numberOfTouches: 1, allTouches: [{ x: 150, y: 700 }] }, state);
    v.handlers.onTouchesMove({ numberOfTouches: 1, allTouches: [{ x: 150, y: 720 }] }, state);
    expect(state.fail).toHaveBeenCalledTimes(1);
    expect(state.activate).not.toHaveBeenCalled();
  });

  it.each([{ overlaysHidden: true }, { overlaysHidden: false }, { overlaysHidden: false, autoHidden: true }])(
    'keeps central video pause/play taps working: %o', (state) => {
      const v = viewer(state);
      v.handleScreenTap(150, 300);
      expect(v.togglePlayPauseRef.current).toHaveBeenCalledTimes(1);
    },
  );

  it('restores on a lower-band tap without toggling playback', () => {
    const v = viewer();
    v.handleScreenTap(150, 600);
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
    expect(v.togglePlayPauseRef.current).not.toHaveBeenCalled();
  });
});
