import { act, renderHook } from '@testing-library/react-native';

import { importMarketingProduct, normalizeProductImport, ProductImportError, useProductImporter, type ProductImport } from '../../libs/marketingProductImport';

const sample = { sourceUrl: 'https://shop.example.com/product', finalUrl: 'https://shop.example.com/product', retrievedAt: '2026-10-26T00:00:00Z', reviewRequired: true,
  products: [{ name: 'Tea tin', description: 'Loose leaf tea', brand: 'North', source: 'JSON-LD Product', imageUrls: ['https://127.0.0.1/private'] }] };

describe('reviewed marketing import', () => {
  it('retains text and provenance while excluding all suggested image fetch targets', () => {
    const result = normalizeProductImport(sample)!;
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toEqual({ name: 'Tea tin', description: 'Loose leaf tea', brand: 'North', source: 'JSON-LD Product' });
    expect(result.finalUrl).toBe(sample.finalUrl);
    expect(normalizeProductImport({ ...sample, reviewRequired: false })).toBeNull();
    expect(normalizeProductImport({ ...sample, products: [{ name: 'Tea', source: 'invented' }] })).toBeNull();
  });
  it('uses only the fixed authenticated importer and never starts generation', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => sample });
    await importMarketingProduct(sample.sourceUrl, 'session', undefined, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://live.dehub.io/maboroshi/marketing/import-product', expect.objectContaining({ method: 'POST', credentials: 'omit', headers: expect.objectContaining({ 'x-dehub-token': 'session' }), body: `url=${encodeURIComponent(sample.sourceUrl)}` }));
    await expect(importMarketingProduct(sample.sourceUrl, '', undefined, fetcher)).rejects.toMatchObject({ issue: 'signIn' });
    await expect(importMarketingProduct('http://shop.example.com', 'session', undefined, fetcher)).rejects.toMatchObject({ issue: 'url' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps rejected websites and rate limits without automatic retries', async () => {
    for (const [status, issue] of [[400, 'url'], [401, 'signIn'], [422, 'empty'], [429, 'busy'], [504, 'unavailable']]) {
      const fetcher = jest.fn().mockResolvedValue({ ok: false, status });
      await expect(importMarketingProduct(sample.sourceUrl, 'session', undefined, fetcher)).rejects.toMatchObject({ issue });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('ignores an old account response in an already mounted workspace', async () => {
    let owner: string | null = 'alice';
    let resolve!: (value: ProductImport) => void;
    const request = vi.fn(() => new Promise<ProductImport>((done) => { resolve = done; }));
    const hook = renderHook(() => useProductImporter(owner, async () => 'session', request));
    let run!: Promise<void>;
    await act(async () => { run = hook.result.current.run(sample.sourceUrl); await Promise.resolve(); });
    expect(hook.result.current.loading).toBe(true);
    owner = 'bob'; hook.rerender({});
    await act(async () => { resolve(normalizeProductImport(sample)!); await run; });
    expect(hook.result.current.result).toBeUndefined();
    expect(hook.result.current.loading).toBe(false);
    owner = 'alice'; hook.rerender({});
    expect(hook.result.current.result).toBeUndefined();
    expect(hook.result.current.loading).toBe(false);
  });
  it('keeps a failed import recoverable without removing the manual brief', async () => {
    const request = jest.fn().mockRejectedValue(new ProductImportError('empty'));
    const hook = renderHook(() => useProductImporter('alice', async () => 'session', request));
    await act(async () => { await hook.result.current.run(sample.sourceUrl); });
    expect(hook.result.current.issue).toBe('empty');
    expect(hook.result.current.loading).toBe(false);
  });
});
