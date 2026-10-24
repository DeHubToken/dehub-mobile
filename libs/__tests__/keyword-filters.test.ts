import { filterContextForRoute, matchKeywordFilter } from '../keyword-filters';
import type { KeywordFilter } from '../../services/keyword-filter.service';

jest.mock('../api.client', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

const filter = (over: Partial<KeywordFilter>): KeywordFilter => ({
  id: over.phrase || 'f',
  phrase: 'cat',
  wholeWord: true,
  action: 'warn',
  contexts: ['home', 'public', 'notifications', 'thread', 'profile'],
  expiresAt: null,
  createdAt: null,
  ...over,
});

describe('keyword filter matching', () => {
  it('matches whole words, case-insensitively', () => {
    const filters = [filter({ phrase: 'cat' })];
    expect(matchKeywordFilter(['My CAT is asleep'], filters, 'home')?.phrase).toBe('cat');
    expect(matchKeywordFilter(['A new category'], filters, 'home')).toBeNull();
  });

  it('matches inside words when whole-word is off', () => {
    expect(matchKeywordFilter(['A new category'], [filter({ phrase: 'cat', wholeWord: false })], 'home')).not.toBeNull();
  });

  it('treats the phrase as text, not a pattern', () => {
    expect(matchKeywordFilter(['abc'], [filter({ phrase: 'a.c', wholeWord: false })], 'home')).toBeNull();
  });

  it('applies only in the places chosen, hiding before warning, and never once expired', () => {
    const filters = [
      filter({ phrase: 'match', action: 'warn' }),
      filter({ phrase: 'final', action: 'hide', contexts: ['home'] }),
      filter({ phrase: 'score', action: 'hide', expiresAt: '2020-01-01T00:00:00Z' }),
    ];
    expect(matchKeywordFilter(['match final'], filters, 'home')?.action).toBe('hide');
    expect(matchKeywordFilter(['match final'], filters, 'thread')?.action).toBe('warn');
    expect(matchKeywordFilter(['the score'], filters, 'home')).toBeNull();
  });
});

describe('filter places', () => {
  it.each([
    ['Home', 'home'],
    ['PostInfo', 'thread'],
    ['Notifications', 'notifications'],
    ['Explore', 'public'],
    ['Search', 'public'],
    ['Profile', 'profile'],
    [undefined, 'home'],
  ])('%s is %s', (route, place) => {
    expect(filterContextForRoute(route as string | undefined)).toBe(place);
  });
});
