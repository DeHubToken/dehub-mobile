import { libraryRequest } from '../../libs/libraryRequest';
afterEach(() => jest.useRealTimers());
it('bounds a stalled request without starting another mutation', async () => {
  jest.useFakeTimers();
  const request = libraryRequest(new Promise<never>(() => {}));
  const rejected = expect(request).rejects.toThrow('timed out');
  jest.advanceTimersByTime(30_000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});
