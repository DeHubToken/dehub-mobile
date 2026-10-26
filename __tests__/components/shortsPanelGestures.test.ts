import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import ts from 'typescript';
import { seekSideAt } from '../../libs/video-hold-gestures';

const source = readFileSync(resolve(__dirname, '../../screens/ShortsViewerScreen.tsx'), 'utf8');

function viewer(overrides: Record<string, unknown> = {}) {
  const handlers: Record<string, Function> = {};
  const pan: Record<string, Function> = {};
  for (const method of ['enabled', 'manualActivation', 'blocksExternalGesture', 'simultaneousWithExternalGesture']) pan[method] = jest.fn(() => pan);
  for (const method of ['onTouchesDown', 'onTouchesMove', 'onEnd']) {
    pan[method] = (callback: Function) => { handlers[method] = callback; return pan; };
  }
  const context = {
    useMemo: (callback: Function) => callback(), useCallback: (callback: Function) => callback,
    Gesture: { Pan: () => pan }, runOnJS: (callback: Function) => callback,
    isActive: true, showComments: false, screenshotMode: false,
    overlaysHidden: true, autoHidden: false, itemHeight: 800, SCREEN_HEIGHT: 800, SCREEN_WIDTH: 400,
    PAUSE_ZONE_START: 1 / 3, PAUSE_ZONE_END: 2 / 3, setCaptionExpanded: jest.fn(), singleTapChromeRef: { current: null },
    RESTORE_ZONE_TOP: 0.61, RESTORE_ZONE_BOTTOM: 0.85,
    DRAG_CLAIM_MIN: 16, DRAG_RELEASE_MIN: 6, HIDE_SWIPE_MIN: 40,
    restorePanStart: { value: { x: 0, y: 0 } }, pagerGesture: {},
    setOverlaysHidden: jest.fn(), setAutoHidden: jest.fn(), resetTapSequence: jest.fn(),
    longPressActiveRef: { current: false }, pickerOpen: false, setOpenTray: jest.fn(),
    commitTapReaction: jest.fn(), showTapReactionAnimation: jest.fn(),
    continuesTapGesture: () => false, lastTapRef: { current: 0 }, tapCountRef: { current: 0 },
    tapTimerRef: { current: null }, singleTapToggledPlaybackRef: { current: false },
    togglePlayPauseRef: { current: jest.fn() }, TAP_GESTURE_WINDOW_MS: 260,
    TAP_REACTION_RESOLUTION_MS: 260, setTimeout: () => 1, clearTimeout: jest.fn(),
    lockedHoldRef: { current: null }, seekRunRef: { current: null }, seekSideAt,
    stopHold: jest.fn(), jumpBy: jest.fn(), endSeekRunLater: jest.fn(),
    ...overrides,
  };
  const callbacks = source.slice(source.indexOf('  const restorePan ='), source.indexOf('  // Long press —'));
  const code = ts.transpileModule(callbacks + '\n({ handleScreenTap })', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return { ...context, ...runInNewContext(code, context), handlers, pan };
}

describe('shorts panel gestures', () => {
  it('does not intercept navigation when controls were hidden by the timer', () => {
    const v = viewer({ overlaysHidden: false, autoHidden: true });
    expect(v.pan.enabled).toHaveBeenCalledWith(false);
  });

  it('restores on an upward swipe without blocking the pager', () => {
    const v = viewer();
    expect(v.pan.simultaneousWithExternalGesture).toHaveBeenCalledWith(v.pagerGesture);
    expect(v.pan.blocksExternalGesture).not.toHaveBeenCalled();
    const state = { activate: jest.fn(), fail: jest.fn() };
    v.handlers.onTouchesDown({ numberOfTouches: 1, allTouches: [{ x: 150, y: 600 }] }, state);
    v.handlers.onTouchesMove({ numberOfTouches: 1, allTouches: [{ x: 150, y: 580 }] }, state);
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

  it.each([300, 460, 700, 790])('immediately releases navigation outside the smaller restore band: %s', (y) => {
    const v = viewer();
    const state = { activate: jest.fn(), fail: jest.fn() };
    v.handlers.onTouchesDown({ numberOfTouches: 1, allTouches: [{ x: 150, y }] }, state);
    expect(state.fail).toHaveBeenCalledTimes(1);
    expect(state.activate).not.toHaveBeenCalled();
  });

  it('releases downward swipes to the pager', () => {
    const v = viewer();
    const state = { activate: jest.fn(), fail: jest.fn() };
    v.handlers.onTouchesDown({ numberOfTouches: 1, allTouches: [{ x: 150, y: 600 }] }, state);
    v.handlers.onTouchesMove({ numberOfTouches: 1, allTouches: [{ x: 150, y: 620 }] }, state);
    expect(state.fail).toHaveBeenCalledTimes(1);
    expect(state.activate).not.toHaveBeenCalled();
  });

  it.each([{ overlaysHidden: true }, { overlaysHidden: false }, { overlaysHidden: false, autoHidden: true }])(
    'a centre tap plays/pauses and leaves the buttons alone: %o', (state) => {
      const v = viewer(state);
      v.handleScreenTap(200, 400);
      expect(v.togglePlayPauseRef.current).toHaveBeenCalledTimes(1);
      expect(v.setOverlaysHidden).not.toHaveBeenCalled();
    },
  );

  it.each([[40, 150], [380, 600], [200, 100], [200, 700]])('a tap outside the centre hides every button without pausing: %s,%s', (x, y) => {
    const v = viewer({ overlaysHidden: false });
    v.handleScreenTap(x, y);
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(true);
    expect(v.togglePlayPauseRef.current).not.toHaveBeenCalled();
  });

  it.each([{ overlaysHidden: true }, { overlaysHidden: false, autoHidden: true }])('the next outside tap brings them back: %o', (state) => {
    const v = viewer(state);
    v.handleScreenTap(40, 150);
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
    expect(v.setAutoHidden).toHaveBeenCalledWith(false);
    expect(v.togglePlayPauseRef.current).not.toHaveBeenCalled();
  });

  it('a double tap above or below the centre likes and puts the buttons back', () => {
    let tapped = false;
    const v = viewer({ overlaysHidden: false, continuesTapGesture: () => { const again = tapped; tapped = true; return again; } });
    v.handleScreenTap(200, 150);
    v.handleScreenTap(200, 150);
    expect(v.setOverlaysHidden).toHaveBeenLastCalledWith(false);
    expect(v.showTapReactionAnimation).toHaveBeenCalledWith('like', 200, 150);
  });

  it.each([[40, -1], [370, 1]])('a double tap on a side jumps instead of liking: %s', (x, side) => {
    let tapped = false;
    const v = viewer({ overlaysHidden: false, continuesTapGesture: () => { const again = tapped; tapped = true; return again; } });
    v.handleScreenTap(x, 400);
    v.handleScreenTap(x, 400);
    expect(v.setOverlaysHidden).toHaveBeenLastCalledWith(false);
    expect(v.jumpBy).toHaveBeenCalledWith(side);
    expect(v.showTapReactionAnimation).not.toHaveBeenCalled();
  });

  it('a tap while a speed-up is locked on only turns it off', () => {
    const v = viewer({ lockedHoldRef: { current: 'speed' } });
    v.handleScreenTap(200, 400);
    expect(v.stopHold).toHaveBeenCalledWith('speed');
    expect(v.togglePlayPauseRef.current).not.toHaveBeenCalled();
  });
});
