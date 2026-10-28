import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor, comparisonCoverage, featureTotals, markFor } from '../../libs/platform-comparison';
import { REVIEWED_FEATURE_IDS, researchedEntry } from '../../libs/platform-comparison-research';
import { RIVAL_ROWS } from '../../libs/platform-comparison-rival-inventory';
import { inComparisonView } from '../../libs/platform-comparison-views';

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
    const rivalIds = new Set(RIVAL_ROWS.map(row => row.id));
    const documented = FEATURES.filter(feature => !rivalIds.has(feature.id));
    expect([...REVIEWED_FEATURE_IDS].sort()).toEqual(documented.map(feature => feature.id).sort());
    for (const feature of documented) for (const platform of PLATFORMS) expect(feature.peers[platform.id]?.source).toBeTruthy();
    expect(comparisonCoverage('all').reviewed).toBe(534 * 11);
    expect(FEATURES).toHaveLength(850);
    expect(comparisonCoverage('all').total).toBe(850 * 11);
    expect(researchedEntry('future-capability', 'Future', 'Video editing', 'youtube')).toBeUndefined();
    expect(entryFor(FEATURES.find(feature => feature.id === 'encrypted-attachments')!, 'x').status).toBe('limited');
    expect(entryFor(FEATURES.find(feature => feature.id === 'stage-dub')!, 'youtube').status).toBe('announced');
  });
  it('includes rival-only capabilities while retaining unconfirmed competitors', () => {
    expect(RIVAL_ROWS).toHaveLength(316);
    for (const row of RIVAL_ROWS) {
      const feature = FEATURES.find(item => item.id === row.id)!;
      expect(feature).toBeDefined();
      expect(PLATFORMS.some(platform => row.marks[platform.id])).toBe(true);
      expect(feature.dehub.status).toBe(row.marks.dehub === 'yes' ? 'documented' : row.marks.dehub === 'partial' ? 'ecosystem' : 'not_offered');
      for (const platform of PLATFORMS) {
        if (!row.marks[platform.id]) expect(feature.peers[platform.id]).toBeUndefined();
        else expect(SOURCES[feature.peers[platform.id]!.source!]?.url).toMatch(/^https:\/\//);
      }
    }
  });
  it('matches the public social and missing-feature views without claiming unknown means no', () => {
    const social = FEATURES.filter(feature => inComparisonView(feature, 'social'));
    const lacking = FEATURES.filter(feature => inComparisonView(feature, 'lacks'));
    expect(social).toHaveLength(686);
    expect(lacking).toHaveLength(257);
    expect(featureTotals().dehub.yes).toBe(593);
    expect(featureTotals().youtube.yes).toBe(293);
    expect(featureTotals(social).dehub.yes).toBe(429);
    expect(featureTotals(social).youtube.yes).toBe(281);
    expect(lacking.every(feature => markFor(feature.dehub) !== 'yes')).toBe(true);
    expect(markFor({ status: 'not_documented', note: 'Not established.' })).toBe('unknown');
    expect(markFor({ status: 'announced', note: 'Future pilot.' })).toBe('partial');
  });
});
