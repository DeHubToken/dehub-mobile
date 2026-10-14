jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo/virtual/env', () => ({ env: process.env }));

const originalFetch = global.fetch;
beforeEach(() => { jest.resetModules(); });
afterEach(() => { global.fetch = originalFetch; });

it('uses inline English instead of fetching optional copy and editor dictionaries', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  await storage.clear();
  const fetchPack = jest.fn();
  global.fetch = fetchPack;
  const { default: i18n } = require('../../i18n');
  expect(i18n.t('copy.performanceProbe', { defaultValue: 'Hello {{name}}', name: 'Sam' })).toBe('Hello Sam');
  expect(i18n.t('editor.rail.agent', 'Agent')).toBe('Agent');
  await Promise.resolve();
  expect(fetchPack).not.toHaveBeenCalled();
});

it('loads a requested translation even when its inline English fallback avoids a download', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  await storage.clear();
  const fetchPack = jest.fn(async () => ({ ok: true, json: async () => ({ copy: { performanceProbe: 'Hallo {{name}}' } }) }));
  global.fetch = fetchPack as unknown as typeof fetch;
  const { default: i18n } = require('../../i18n');
  i18n.t('copy.performanceProbe', { lng: 'de', defaultValue: 'Hello {{name}}', name: 'Sam' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(i18n.getResource('de', 'translation', 'copy.performanceProbe')).toBe('Hallo {{name}}');
  expect(fetchPack).toHaveBeenCalledTimes(1);
});

it('loads a committed language source when the CDN has not published its version yet', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  await storage.clear();
  const fetchSource = jest.fn(async (url: string) => url.includes('raw.githubusercontent.com')
    ? { ok: true, json: async () => ({ common: { sourceProbe: 'Bonjour' } }) }
    : { ok: false });
  global.fetch = fetchSource as unknown as typeof fetch;
  const { default: i18n, loadLanguage } = require('../../i18n');
  expect(await loadLanguage('fr')).toBe(true);
  expect(i18n.getResource('fr', 'translation', 'common.sourceProbe')).toBe('Bonjour');
  const requests = fetchSource.mock.calls.map(([url]) => url);
  expect(requests.filter(url => url.includes('/locale-packs/'))).toHaveLength(6);
  expect(requests.filter(url => /raw\.githubusercontent\.com\/DeHubToken\/dehub-mobile\/[a-f0-9]{40}\/i18n\/locales\/fr.json$/.test(url))).toHaveLength(1);
});

it('uses a cached source language on the next launch without a network request', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  const manifest = require('../../i18n/locale-manifest.json');
  await storage.clear();
  await storage.setItem(`locale-pack:${manifest.version}:fr:source`, JSON.stringify({ common: { sourceProbe: 'Hors ligne' } }));
  const fetchSource = jest.fn().mockRejectedValue(new Error('offline'));
  global.fetch = fetchSource;
  const { default: i18n, loadLanguage } = require('../../i18n');
  expect(await loadLanguage('fr')).toBe(true);
  expect(i18n.getResource('fr', 'translation', 'common.sourceProbe')).toBe('Hors ligne');
  expect(fetchSource).not.toHaveBeenCalled();
});
