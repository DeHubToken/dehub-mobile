import { __resetFirstScreenForTests, claimFirstScreen, whenFirstScreenReady } from '../../libs/firstScreenReady';

beforeEach(() => { jest.useFakeTimers(); __resetFirstScreenForTests(); });
afterEach(() => { jest.useRealTimers(); });

it('reveals at once when no screen claimed the launch', async () => {
  await expect(whenFirstScreenReady(1000)).resolves.toBeUndefined();
});

it('waits for the claiming screen to release', async () => {
  const release = claimFirstScreen();
  const seen = jest.fn();
  void whenFirstScreenReady(1000).then(seen);
  await Promise.resolve();
  expect(seen).not.toHaveBeenCalled();
  release();
  await Promise.resolve();
  expect(seen).toHaveBeenCalled();
});

it('gives up after the cap so a slow network still opens the app', async () => {
  claimFirstScreen();
  const seen = jest.fn();
  void whenFirstScreenReady(1000).then(seen);
  jest.advanceTimersByTime(999);
  await Promise.resolve();
  expect(seen).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await Promise.resolve();
  expect(seen).toHaveBeenCalled();
});

it('ignores claims after the launch was revealed', async () => {
  await whenFirstScreenReady(1000);
  claimFirstScreen();
  await expect(whenFirstScreenReady(1000)).resolves.toBeUndefined();
});
