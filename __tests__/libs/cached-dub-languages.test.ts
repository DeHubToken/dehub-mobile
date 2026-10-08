import { dubLanguage, hasCachedDubLanguage } from '../../libs/cached-dub-languages';

it('uses the existing regional translation cache', () => {
  expect(dubLanguage('en-GB')).toBe('en-gb');
  expect(dubLanguage('zh_TW')).toBe('zh-tw');
  expect(hasCachedDubLanguage('zh-Hant')).toBe(true);
  expect(hasCachedDubLanguage('hu')).toBe(false);
});
