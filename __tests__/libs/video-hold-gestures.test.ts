import { commitsDismiss, heldRate, holdSideAt, seekSideAt } from '../../libs/video-hold-gestures';

it('splits holds into rewind, middle and fast forward', () => {
  expect(holdSideAt(40, 400)).toBe('rewind');
  expect(holdSideAt(200, 400)).toBe('centre');
  expect(holdSideAt(360, 400)).toBe('forward');
});

it('only the outer thirds jump on a double tap', () => {
  expect(seekSideAt(50, 390)).toBe(-1);
  expect(seekSideAt(195, 390)).toBe(0);
  expect(seekSideAt(340, 390)).toBe(1);
});

it('locks the speed once dragged down, faster the further it goes', () => {
  expect(heldRate(0)).toEqual({ rate: 2, locked: false });
  expect(heldRate(30)).toEqual({ rate: 2, locked: true });
  expect(heldRate(70)).toEqual({ rate: 2.5, locked: true });
  expect(heldRate(600)).toEqual({ rate: 4, locked: true });
});

it('leaves past a third or on a fling, and a fling back cancels', () => {
  expect(commitsDismiss(100, 0, 800)).toBe(false);
  expect(commitsDismiss(300, 0, 800)).toBe(true);
  expect(commitsDismiss(60, 1200, 800)).toBe(true);
  expect(commitsDismiss(400, -600, 800)).toBe(false);
});
