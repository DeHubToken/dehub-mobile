import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor } from '../../libs/platform-comparison';

describe('platform comparison catalogue', () => {
  it('includes every requested competitor exactly once', () => {
    expect(PLATFORMS.map(p => p.id)).toEqual(['youtube', 'x', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster']);
    expect(new Set(FEATURES.map(f => f.id)).size).toBe(FEATURES.length);
  });
  it('sources claims and keeps unknown competitors unknown', () => {
    for (const feature of FEATURES) for (const value of [feature.dehub, ...Object.values(feature.peers)]) {
      expect(SOURCES[value.source!]?.url).toMatch(/^https:\/\//);
    }
    expect(entryFor(FEATURES.find(f => f.id === 'escrow')!, 'youtube').status).toBe('unverified');
  });
  it('combines search and category without treating no matches as all features', () => {
    expect(filterFeatures('stablecoin', 'Creator income').some(f => f.id === 'stablecoins')).toBe(true);
    expect(filterFeatures('no-such-feature-123', 'all')).toHaveLength(0);
    expect(filterFeatures('', 'all')).toHaveLength(FEATURES.length);
  });
  it('retains the storefront limits beside paid capabilities', () => {
    for (const id of ['tips', 'subs', 'ppv', 'paid-dm', 'generate-video', 'staking']) {
      expect(FEATURES.find(f => f.id === id)?.iosRestricted).toBe(true);
    }
  });
});
