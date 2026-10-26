import type { PictureRect } from './live-overlay/layout';

/** Hit-test the contained picture, excluding its letterbox and player chrome. */
export function startsOnVideoPicture(x: number, y: number, picture: PictureRect): boolean {
  'worklet';
  return picture.width > 0 && picture.height > 0 && x >= picture.left && x <= picture.left + picture.width
    && y >= picture.top && y <= picture.top + picture.height;
}

/** Existing vertical gesture travel rules, separate from the picture hit test. */
export function commitsVideoMinimize(dx: number, dy: number): boolean {
  'worklet';
  return dy > 40 && dy > Math.abs(dx);
}

export type MinimizeDrag = { amount: number; translateX: number; translateY: number; scale: number };

/**
 * How far a drag down has carried the picture toward the mini player: it
 * follows the finger down, drifts right and shrinks to 40% over the first 65%
 * of the frame. The scale is about the frame's centre.
 */
export function minimizeDrag(dragY: number, frameWidth: number, itemHeight: number): MinimizeDrag {
  'worklet';
  const translateY = Math.max(0, dragY);
  const amount = Math.min(1, translateY / Math.max(1, itemHeight * 0.65));
  return { amount, translateX: amount * frameWidth * 0.24, translateY, scale: 1 - amount * 0.6 };
}

/**
 * Where the picture is drawn during the drag, in the frame's coordinates.
 * The mini player starts from exactly this rectangle so the handoff does not
 * jump. Computed rather than measured: measuring a transformed view returns
 * its layout size, not its scaled size, on some renderers.
 */
export function draggedPictureRect(frameWidth: number, frameHeight: number, picture: PictureRect, drag: MinimizeDrag): PictureRect {
  'worklet';
  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  return {
    left: cx + drag.translateX + (picture.left - cx) * drag.scale,
    top: cy + drag.translateY + (picture.top - cy) * drag.scale,
    width: picture.width * drag.scale,
    height: picture.height * drag.scale,
  };
}

/**
 * The translation for a view boxed to the picture itself, which scales about
 * its own centre, that lands it where the whole-frame transform puts it.
 */
export function pictureBoxTranslate(frameWidth: number, frameHeight: number, picture: PictureRect, drag: MinimizeDrag) {
  'worklet';
  const pcx = picture.left + picture.width / 2;
  const pcy = picture.top + picture.height / 2;
  return {
    translateX: (frameWidth / 2 - pcx) * (1 - drag.scale) + drag.translateX,
    translateY: (frameHeight / 2 - pcy) * (1 - drag.scale) + drag.translateY,
  };
}
