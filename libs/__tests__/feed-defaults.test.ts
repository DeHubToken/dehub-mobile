import { storage } from '../storage';
import {
  adoptAccountFeedDefaults,
  feedDefaultsCustoms,
  getAppFeedToggles,
  getDefaultFeedTab,
  readFeedToggles,
  resetFeedToggles,
  setAppFeedToggles,
  setDefaultFeedTab,
} from '../feed-defaults';

beforeEach(() => {
  storage.clearAll();
});

describe('feed defaults', () => {
  it('stores the tab in web names and reads it back as the pager key', () => {
    setDefaultFeedTab('feed-audio');
    expect(feedDefaultsCustoms().defaultFeedTab).toBe('music');
    expect(getDefaultFeedTab()).toBe('feed-audio');
  });

  it('opens on Home with nothing saved or an unknown value', () => {
    expect(getDefaultFeedTab()).toBe('all');
    adoptAccountFeedDefaults({ defaultFeedTab: 'nonsense' });
    expect(getDefaultFeedTab()).toBe('all');
  });

  it('saves only changed toggles, in web vocabulary, keeping web-only feeds', () => {
    adoptAccountFeedDefaults({ feedToggles: JSON.stringify({ videos: { sort: 'most-viewed' }, home: { postType: 'text' } }) });
    setAppFeedToggles({ sortBy: 'likes', dateRange: '', contentAccess: ['bounty'], category: 'Gaming' });
    expect(readFeedToggles()).toEqual({
      videos: { sort: 'most-viewed' },
      home: { postType: 'text', sort: 'most-liked', contentFilters: ['w2e'], categories: ['Gaming'] },
    });
    expect(getAppFeedToggles()).toEqual({ sortBy: 'likes', contentAccess: ['bounty'], category: 'Gaming' });
  });

  it('reads toggles set on web', () => {
    adoptAccountFeedDefaults({ feedToggles: JSON.stringify({ home: { sort: 'for-you', date: 'week', contentFilters: ['ppv', 'locked'] } }) });
    expect(getAppFeedToggles()).toEqual({ sortBy: 'score', dateRange: 'week', contentAccess: ['ppv', 'locked'] });
  });

  it('back on the defaults saves nothing; reset clears every feed', () => {
    setAppFeedToggles({ sortBy: 'createdAt', dateRange: '', contentAccess: [] });
    expect(readFeedToggles()).toEqual({});
    setAppFeedToggles({ sortBy: 'views' });
    resetFeedToggles();
    expect(readFeedToggles()).toEqual({});
    expect(feedDefaultsCustoms().feedToggles).toBe('{}');
  });

  it('reports whether the account had values, so this device can send its own', () => {
    expect(adoptAccountFeedDefaults({})).toEqual({ hasTab: false, hasToggles: false, changed: false });
    expect(adoptAccountFeedDefaults({ defaultFeedTab: 'live', feedToggles: '{}' })).toEqual({ hasTab: true, hasToggles: true, changed: true });
  });
});
