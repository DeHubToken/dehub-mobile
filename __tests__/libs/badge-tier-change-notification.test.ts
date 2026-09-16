import { createInstance } from 'i18next';
import fs from 'node:fs';
import path from 'node:path';
import en from '../../i18n/locales/en.json';
import { localizedNotificationContent } from '../../libs/notification-content';

/**
 * Climbing a rung is the one notification with nobody on the other end of it.
 * Every other row is something an account did to the reader, and the renderer
 * bails out to the server's English sentence the moment it cannot name an
 * actor — which is exactly the shape of this one. So the case has to be
 * answered above that guard, and this is what pins it there.
 */
describe('badge tier change notifications', () => {
  const instance = createInstance();
  instance.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } });
  const t = instance.t.bind(instance);

  it('reads as a congratulation naming the tier, with no actor anywhere', () => {
    const value = localizedNotificationContent(
      { type: 'badge_tier_up', metadata: { tier: 'Blue Whale', previousTier: 'Killer Whale' } },
      t,
    );
    expect(value).toContain('Blue Whale');
    // The rung left behind rides on the row for anyone who wants it, but the
    // sentence is about the one just reached.
    expect(value).not.toContain('Killer Whale');
  });

  it('falls back to a generic tier rather than an empty sentence', () => {
    const value = localizedNotificationContent({ type: 'badge_tier_up', metadata: {} }, t);
    expect(value).toBeTruthy();
    expect(value).not.toContain('undefined');
  });

  it('says something different when the badge steps down, and again when it goes', () => {
    const stepped = localizedNotificationContent(
      { type: 'badge_tier_down', metadata: { tier: 'Cobra', previousTier: 'Dolphin' } },
      t,
    );
    const gone = localizedNotificationContent(
      { type: 'badge_tier_down', metadata: { previousTier: 'Crab' } },
      t,
    );
    expect(stepped).toContain('Cobra');
    // Not the same sentence with a hole in it: losing the last rung reads as
    // its own thing, and names no tier because there is none to name.
    expect(gone).not.toEqual(stepped);
    expect(gone).not.toContain('undefined');
    expect(gone).toBeTruthy();
  });

  it('is translated in every locale, not only the ones that render English', () => {
    const dir = path.resolve(__dirname, '../../i18n/locales');
    const missing = fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .filter(file => {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const n = json?.notifications;
        return !n?.badgeTierUp || !n?.badgeTierDown || !n?.badgeTierLost;
      });
    expect(missing).toEqual([]);
  });

  it('keeps the tier placeholder intact in every locale', () => {
    const dir = path.resolve(__dirname, '../../i18n/locales');
    const broken = fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .filter(file => {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const n = json.notifications;
        return (
          !String(n.badgeTierUp).includes('{{tier}}') ||
          !String(n.badgeTierDown).includes('{{tier}}') ||
          String(n.badgeTierLost).includes('{{tier}}')
        );
      });
    expect(broken).toEqual([]);
  });
});
