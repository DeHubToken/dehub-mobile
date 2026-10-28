import { createForegroundReconnect } from '../../libs/foreground-reconnect';
afterEach(() => jest.useRealTimers());
it('cancels foreground recovery if the app backgrounds again before it fires', () => {
  jest.useFakeTimers();
  const connect = jest.fn();
  const recovery = createForegroundReconnect(connect, () => true);
  recovery.schedule(500);
  jest.advanceTimersByTime(100);
  recovery.cancel();
  jest.advanceTimersByTime(1000);
  expect(connect).not.toHaveBeenCalled();
  recovery.schedule(500);
  jest.advanceTimersByTime(500);
  expect(connect).toHaveBeenCalledTimes(1);
});
it('rechecks identity at execution and coalesces repeated active transitions', () => {
  jest.useFakeTimers();
  let allowed = true;
  const connect = jest.fn();
  const recovery = createForegroundReconnect(connect, () => allowed);
  recovery.schedule(500); recovery.schedule(500); allowed = false;
  jest.advanceTimersByTime(500);
  expect(connect).not.toHaveBeenCalled();
});
