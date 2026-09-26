import { createInstance } from 'i18next';
import en from '../../i18n/locales/en.json';
import tr from '../../i18n/locales/tr.json';
import { localizedNotificationContent } from '../../libs/notification-content';

describe('notification content', () => {
  const translate = (language: string) => {
    const instance = createInstance();
    instance.init({ lng: language, fallbackLng: 'en', resources: { en: { translation: en }, tr: { translation: tr } } });
    return instance.t.bind(instance);
  };
  it('renders Turkish event wording without altering the actor name', () => {
    const value = localizedNotificationContent({ type: 'like', actorUsername: 'Araf', content: 'Araf liked your post' }, translate('tr'));
    expect(value).toContain('Araf');
    expect(value).not.toContain('liked your post');
    expect(value).not.toContain('reactionInfo.');
  });
  it('preserves comment previews and payment amounts', () => {
    expect(localizedNotificationContent({ type: 'comment_like', actorUsername: 'Araf', commentPreview: 'hello' }, translate('en'))).toContain('"hello"');
    expect(localizedNotificationContent({ type: 'tip', actorUsername: 'Araf', amount: 20, currency: 'DHB' }, translate('en'))).toContain('20 tokens');
  });
  it('keeps follow requests distinct from accepted follows', () => {
    expect(localizedNotificationContent({ type: 'following', actorUsername: 'Araf', content: 'Araf requested to follow you' }, translate('en'))).toContain('requested');
  });
  it('does not invent other actors for repeated reactions by one person', () => {
    const value = localizedNotificationContent({ type: 'like', actorUsername: 'Araf', aggregatedCount: 4, latestActorNames: ['Araf'] }, translate('en'));
    expect(value).toContain('4');
    expect(value).not.toContain('others');
  });
  it('leaves custom and private message content to its existing renderer', () => {
    expect(localizedNotificationContent({ type: 'new_message', actorUsername: 'Araf', content: 'hello' }, translate('en'))).toBeNull();
    expect(localizedNotificationContent({ type: 'system', content: 'Maintenance' }, translate('en'))).toBeNull();
  });
});

