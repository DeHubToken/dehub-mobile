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
