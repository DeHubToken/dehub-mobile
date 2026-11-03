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
  it('leaves custom content to its existing renderer', () => {
    expect(localizedNotificationContent({ type: 'system', content: 'Maintenance' }, translate('en'))).toBeNull();
  });
  // The server's message row never carries the message itself, only an
  // English "sent you a message on DeHub", so the reader's language wins.
  it('says a message arrived in the reader\'s language', () => {
    const value = localizedNotificationContent({ type: 'new_message', actorUsername: 'Araf', content: 'Araf sent you a message on DeHub' }, translate('tr'));
    expect(value).toContain('Araf');
    expect(value).not.toContain('DeHub');
    expect(value).not.toContain('sent you a message');
  });
  it('keeps the English milestone with its number, and translates it otherwise', () => {
    const item = { type: 'video_milestone', content: '🎉 Your post reached 100 likes!' };
    expect(localizedNotificationContent(item, translate('en'), 'en')).toBeNull();
    expect(localizedNotificationContent(item, translate('tr'), 'tr')).not.toContain('Your post');
  });

  it('says where a mention was made', () => {
    const en = translate('en');
    expect(localizedNotificationContent({ type: 'mention', actorUsername: 'Araf', metadata: { mentionContext: 'live_chat' } }, en)).toBe('Araf mentioned you in live chat');
    expect(localizedNotificationContent({ type: 'mention', actorUsername: 'Araf', metadata: { mentionContext: 'public_chat' } }, en)).toBe('Araf mentioned you in public chat');
    expect(localizedNotificationContent({ type: 'mention', actorUsername: 'Araf', commentId: 3 }, en)).toBe('Araf mentioned you in a comment');
    expect(localizedNotificationContent({ type: 'mention', actorUsername: 'Araf' }, en)).toBe('Araf mentioned you in a post');
  });
});


describe('grouped community chat rows', () => {
  const t = (() => {
    const instance = createInstance();
    instance.init({ lng: 'en', resources: { en: { translation: en } } });
    return instance.t.bind(instance);
  })();
  const row = (names: string[]) => ({
    type: 'community_chat',
    actorUsername: names[0],
    metadata: { communityName: 'Riftn', senders: names.map((n, i) => ({ a: `0x${i}`, n })), senderCount: names.length },
  });
  it('leads with whoever spoke first', () => {
    expect(localizedNotificationContent(row(['james']), t)).toBe('james sent a message in Riftn');
    expect(localizedNotificationContent(row(['james', 'charlie']), t)).toBe('james and charlie sent messages in Riftn');
    expect(localizedNotificationContent(row(['james', 'charlie', 'dana']), t)).toBe('james + 2 others sent messages in Riftn');
  });
});
