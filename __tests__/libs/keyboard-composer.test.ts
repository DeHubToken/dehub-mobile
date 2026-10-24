import { keyboardComposerLift, keyboardTopFromEvent } from '../../libs/keyboard-composer';

describe('keyboardTopFromEvent', () => {
  it('trusts the height when screenY sits below the real keys (Galaxy S24+)', () => {
    // 1080x2340 at density 450: screen 832dp, nav bar 20dp, keys start at 592dp
    // while screenY claimed 612dp.
    expect(keyboardTopFromEvent({ screenY: 612, height: 220 }, 'android', 832, 20)).toBe(592);
  });

  it('keeps screenY when it is already the higher reading', () => {
    expect(keyboardTopFromEvent({ screenY: 480, height: 300 }, 'android', 800, 0)).toBe(480);
  });

  it('leaves iOS and events without a height alone', () => {
    expect(keyboardTopFromEvent({ screenY: 500, height: 300 }, 'ios', 800, 34)).toBe(500);
    expect(keyboardTopFromEvent({ screenY: 500 }, 'android', 800, 0)).toBe(500);
  });

  it('lifts a composer by how far it sits past the keys plus the gap', () => {
    expect(keyboardComposerLift(800, 0, 592, 8)).toBe(216);
  });
});
