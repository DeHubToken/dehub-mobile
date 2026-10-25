import { containedPicture } from '../../libs/live-overlay/layout';
import { startsOnVideoPicture, commitsVideoMinimize } from '../../libs/video-minimize-gesture';

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
