import { containedPicture } from '../../libs/live-overlay/layout';
import { startsOnVideoPicture, commitsVideoMinimize, minimizeDrag, draggedPictureRect, pictureBoxTranslate } from '../../libs/video-minimize-gesture';

it('keeps the full poster box until intrinsic metadata exists', () => {
  expect(containedPicture(360, 780, 0, 0)).toEqual({ left: 0, top: 0, width: 360, height: 780 });
});

it('uses a wide picture instead of the whole portrait player as the drag origin', () => {
  const picture = containedPicture(360, 780, 1920, 1080);
  expect(startsOnVideoPicture(180, 390, picture)).toBe(true);
  expect(startsOnVideoPicture(180, 150, picture)).toBe(false);
  expect(startsOnVideoPicture(180, 650, picture)).toBe(false);
});

it('recognizes the actual square picture and excludes the space below it', () => {
  const picture = containedPicture(360, 780, 1080, 1080);
  expect(startsOnVideoPicture(180, 220, picture)).toBe(true);
  expect(startsOnVideoPicture(180, 590, picture)).toBe(false);
});

it('leaves upward paging, horizontal Back, and cancelled short drags alone', () => {
  expect(commitsVideoMinimize(0, -200)).toBe(false);
  expect(commitsVideoMinimize(100, 60)).toBe(false);
  expect(commitsVideoMinimize(0, 20)).toBe(false);
  expect(commitsVideoMinimize(15, 140)).toBe(true);
});

describe('the drag into the mini player', () => {
  const W = 360, H = 780;
  const picture = containedPicture(W, H, 1920, 1080);

  it('leaves the picture where it is before the finger moves', () => {
    const drag = minimizeDrag(0, W, H);
    expect(drag).toEqual({ amount: 0, translateX: 0, translateY: 0, scale: 1 });
    expect(draggedPictureRect(W, H, picture, drag)).toEqual(picture);
    const still = pictureBoxTranslate(W, H, picture, drag);
    expect(still.translateX).toBeCloseTo(0);
    expect(still.translateY).toBeCloseTo(0);
  });

  it('shrinks to 40% and stops shrinking once two thirds of the frame is crossed', () => {
    expect(minimizeDrag(H * 0.65, W, H).scale).toBeCloseTo(0.4);
    expect(minimizeDrag(H, W, H).scale).toBeCloseTo(0.4);
    expect(minimizeDrag(-50, W, H).translateY).toBe(0);
  });

  it('keeps the video aspect, so the mini player opens over exactly the drawn picture', () => {
    const rect = draggedPictureRect(W, H, picture, minimizeDrag(240, W, H));
    expect(rect.width / rect.height).toBeCloseTo(1920 / 1080);
  });

  it('moves a box cut to the picture exactly as the whole frame would', () => {
    // The same drag drawn two ways: the whole frame scaled about the frame's
    // centre (the handoff rect), or a box the size of the picture scaled about
    // its own centre (what the screen draws while dragging).
    for (const box of [picture, { left: 10, top: 40, width: 300, height: 120 }]) {
      const drag = minimizeDrag(300, W, H);
      const move = pictureBoxTranslate(W, H, box, drag);
      const rect = draggedPictureRect(W, H, box, drag);
      expect(box.left + box.width / 2 + move.translateX).toBeCloseTo(rect.left + rect.width / 2);
      expect(box.top + box.height / 2 + move.translateY).toBeCloseTo(rect.top + rect.height / 2);
      expect(box.width * drag.scale).toBeCloseTo(rect.width);
    }
  });
});
