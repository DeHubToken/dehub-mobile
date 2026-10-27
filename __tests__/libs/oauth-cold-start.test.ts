import { hasHeldCallback, holdLaunchCallback, takeHeldCallback, withoutFragment } from '../../libs/oauth-cold-start';

const GOOGLE = 'dehub://auth-callback#access_token=eyJ.a.b&refresh_token=r1&expires_in=3600';

beforeEach(() => { takeHeldCallback(); });

// Android closed the app while Google was open; the page came back to a new
// launch and the link was dropped, leaving the person on Home signed out.
it('holds a sign-in page that comes back to a fresh launch, once', async () => {
  await expect(holdLaunchCallback(GOOGLE)).resolves.toBe(true);
  expect(hasHeldCallback()).toBe(true);
  expect(takeHeldCallback()).toBe(GOOGLE);
  expect(takeHeldCallback()).toBeNull();
  expect(hasHeldCallback()).toBe(false);
});

it('does not resume the same sign-in again when an update reloads the app', async () => {
  await holdLaunchCallback(GOOGLE);
  takeHeldCallback();
  await new Promise((r) => setTimeout(r, 0));
  await expect(holdLaunchCallback(GOOGLE)).resolves.toBe(false);
});

it('holds a Telegram callback too', async () => {
  await expect(holdLaunchCallback('dehub://auth-callback#tgAuthResult=eyJpZCI6MX0')).resolves.toBe(true);
});

it('ignores links that carry no sign-in', async () => {
  await expect(holdLaunchCallback('dehub://auth-callback')).resolves.toBe(false);
  await expect(holdLaunchCallback('dehub://auth-callback#error=access_denied')).resolves.toBe(false);
  await expect(holdLaunchCallback('https://dehub.io/app/post/1#access_token=a&refresh_token=b')).resolves.toBe(false);
  await expect(holdLaunchCallback('dehub://auth#access_token=a&refresh_token=b')).resolves.toBe(false);
  expect(hasHeldCallback()).toBe(false);
});

it('drops a held sign-in nobody finished within ten minutes', async () => {
  const now = Date.now();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
  await holdLaunchCallback('dehub://auth-callback#access_token=a&refresh_token=late');
  spy.mockReturnValue(now + 11 * 60 * 1000);
  expect(hasHeldCallback()).toBe(false);
  expect(takeHeldCallback()).toBeNull();
  spy.mockRestore();
});

it('keeps tokens out of logs', () => {
  expect(withoutFragment(GOOGLE)).toBe('dehub://auth-callback#…');
  expect(withoutFragment('dehub://post/1')).toBe('dehub://post/1');
});
