import { createInstance } from 'i18next';
import en from '../../i18n/locales/en.json';
import { localizedNotificationContent } from '../../libs/notification-content';

/**
 * A badge loan ending is one event read from two ends, and the sentence has to
 * say which end the reader was on — "took back" and "handed back" describe the
 * same row. A loan that lapsed when the grantor's balance fell is a third
 * case: nobody decided it, so nobody is named as having done it.
 */
describe('badge delegation notifications', () => {
  const instance = createInstance();
  instance.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } });
  const t = instance.t.bind(instance);

  it('names the tier that was lent, not the account that lent it', () => {
    const value = localizedNotificationContent(
      { type: 'badge_delegated', actorUsername: 'whale', metadata: { tier: 'Dolphin', role: 'grantee' } },
      t,
    );
    expect(value).toContain('whale');
    expect(value).toContain('Dolphin');
  });

  it('reads the end of a loan from the side the reader was on', () => {
    const toGrantee = localizedNotificationContent(
      {
        type: 'badge_delegation_ended',
        actorUsername: 'whale',
        metadata: { tier: 'Dolphin', role: 'grantee', reason: 'grantor' },
      },
      t,
    );
    const toGrantor = localizedNotificationContent(
      {
        type: 'badge_delegation_ended',
        actorUsername: 'newcomer',
        metadata: { tier: 'Dolphin', role: 'grantor', reason: 'grantee' },
      },
      t,
    );

    expect(toGrantee).toContain('stopped lending');
    expect(toGrantor).toContain('returned');
    expect(toGrantee).not.toEqual(toGrantor);
  });

  it('blames nobody when a loan lapsed on the grantor selling down', () => {
    const value = localizedNotificationContent(
      {
        type: 'badge_delegation_ended',
        actorUsername: 'whale',
        metadata: { tier: 'Dolphin', role: 'grantee', reason: 'unbadged' },
      },
      t,
    );

    expect(value).not.toContain('stopped lending');
    expect(value).toContain('can no longer lend');
  });

  it('says what a re-tiered loan is now worth', () => {
    const value = localizedNotificationContent(
      {
        type: 'badge_delegation_changed',
        actorUsername: 'whale',
        metadata: { tier: 'Crocodile', previousTier: 'Dolphin', role: 'grantee' },
      },
      t,
    );

    expect(value).toContain('Crocodile');
  });

  it('falls back to a plain word when an old row carries no tier', () => {
    const value = localizedNotificationContent(
      { type: 'badge_delegated', actorUsername: 'whale' },
      t,
    );

    expect(value).toContain('whale');
    expect(value).not.toContain('notifications.');
    expect(value).not.toContain('undefined');
  });
});
