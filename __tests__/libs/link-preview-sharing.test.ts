import { supabase } from '../../services/supabase';
import { fetchLinkPreview } from '../../libs/link-preview';
jest.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../../libs/predictions', () => ({ parsePredictionLink: () => null }));
jest.mock('../../libs/rich-links', () => ({ parseRichLink: () => null }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ warn: jest.fn() }) }));
const invoke = supabase.functions.invoke as jest.Mock;
describe('preview request sharing', () => {
  it('shares concurrent requests and caches successful metadata', async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const url = 'https://example.com/concurrent';
    const a = fetchLinkPreview(url), b = fetchLinkPreview(url);
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve({ data: { title: 'Article' }, error: null });
    expect(await a).toEqual(await b);
    expect((await fetchLinkPreview(url))?.title).toBe('Article');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('does not cache failure fallbacks, so the next request can recover', async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const url = 'https://example.com/retry';
    expect((await fetchLinkPreview(url))?.title).toBe('example.com');
    invoke.mockResolvedValueOnce({ data: { title: 'Recovered' }, error: null });
    expect((await fetchLinkPreview(url))?.title).toBe('Recovered');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
