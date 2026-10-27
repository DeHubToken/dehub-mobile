import { TranslationCooldown } from '../../libs/translation-cooldown';
describe('translation backpressure', () => {
  let now = 100000;
  beforeEach(() => { now = 100000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());
  const failure = (code: string, seconds: string) => ({
    context: { status: 503, headers: { get: () => seconds }, clone: () => ({ json: async () => ({ code }) }) },
  });
  it('pauses uncached requests across cards until the server retry time', async () => {
    const cooldown = new TranslationCooldown();
    await cooldown.observe('one', failure('TRANSLATION_BUDGET_EXHAUSTED', '300'));
    expect(() => cooldown.assertReady('two')).toThrow();
    now += 300001;
    expect(() => cooldown.assertReady('two')).not.toThrow();
  });
  it('limits an in-progress cooldown to that text and language', async () => {
    const cooldown = new TranslationCooldown();
    await cooldown.observe('one', failure('TRANSLATION_IN_PROGRESS', '3'));
    expect(() => cooldown.assertReady('one')).toThrow();
    expect(() => cooldown.assertReady('two')).not.toThrow();
  });
});
