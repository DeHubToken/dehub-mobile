import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor, comparisonCoverage } from '../../libs/platform-comparison';
import { REVIEWED_FEATURE_IDS, researchedEntry } from '../../libs/platform-comparison-research';

describe('platform comparison catalogue', () => {
  it('includes every requested competitor exactly once', () => {
    expect(PLATFORMS.map(p => p.id)).toEqual(['youtube', 'x', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster']);
    expect(new Set(FEATURES.map(f => f.id)).size).toBe(FEATURES.length);
    expect(FEATURES.length).toBeGreaterThan(500);
  });
  it('sources claims and keeps unknown competitors unknown', () => {
    for (const feature of FEATURES) for (const value of [feature.dehub, ...Object.values(feature.peers)]) {
      expect(SOURCES[value.source!]?.url).toMatch(/^https:\/\//);
    }
    expect(entryFor(FEATURES.find(f => f.id === 'escrow')!, 'youtube').status).toBe('not_documented');
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
  it('uses real native source files and retains encryption fallback limitations', () => {
    for (const feature of FEATURES) if (feature.implementation) expect(existsSync(resolve(process.cwd(), feature.implementation.mobile))).toBe(true);
    expect(FEATURES.find(f => f.id === 'encrypted-attachments')?.dehub.note).toContain('fallback');
    expect(FEATURES.find(f => f.id === 'encrypted-attachments')?.dehub.status).toBe('limited');
    expect(comparisonCoverage('all').total).toBe(FEATURES.length * PLATFORMS.length);
  });
  it('accounts for the complete native editor guide', () => {
    const coverage = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/comparison-editor-coverage.json'), 'utf8')) as Record<string, string>;
    const guide = readFileSync(resolve(process.cwd(), 'libs/editor/editorGuide.ts'), 'utf8');
    const ids = [...guide.matchAll(/\{ id: "([^"]+)", title:/g)].map(match => match[1]);
    expect(Object.keys(coverage).sort()).toEqual(ids.sort());
    for (const id of Object.values(coverage)) expect(FEATURES.some(feature => feature.id === id)).toBe(true);
  });
  it('retains every reviewed pair and leaves new unreviewed features outside the audit', () => {
    expect([...REVIEWED_FEATURE_IDS].sort()).toEqual(FEATURES.map(feature => feature.id).sort());
    for (const feature of FEATURES) for (const platform of PLATFORMS) expect(feature.peers[platform.id]?.source).toBeTruthy();
    expect(comparisonCoverage('all').reviewed).toBe(524 * 11);
    expect(researchedEntry('future-capability', 'Future', 'Video editing', 'youtube')).toBeUndefined();
    expect(entryFor(FEATURES.find(feature => feature.id === 'encrypted-attachments')!, 'x').status).toBe('limited');
    expect(entryFor(FEATURES.find(feature => feature.id === 'stage-dub')!, 'youtube').status).toBe('announced');
  });
});
