import { keyboardComposerLift } from '../../libs/keyboard-composer';

describe('keyboard composer positioning', () => {
  it('moves an unresized composer above the keyboard with eight points of spacing', () => {
    expect(keyboardComposerLift(774, 0, 500)).toBe(282);
  });

  it('removes the extra padding after Android already resized the container', () => {
    expect(keyboardComposerLift(474, 0, 500)).toBe(-18);
  });

  it('keeps the same position when measured again after applying the lift', () => {
    expect(keyboardComposerLift(492, 282, 500)).toBe(282);
    expect(keyboardComposerLift(492, -18, 500)).toBe(-18);
  });

  it('undoes a prior lift when the parent subsequently resizes', () => {
    expect(keyboardComposerLift(192, 282, 500)).toBe(-18);
  });
});
