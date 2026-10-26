import { useEffect, useRef, useState } from 'react';

export interface ImportedProduct { name: string; description: string; brand: string; source: 'JSON-LD Product' | 'Page metadata' }
export interface ProductImport { sourceUrl: string; finalUrl: string; retrievedAt: string; products: ImportedProduct[] }
export type ProductImportIssue = 'signIn' | 'url' | 'empty' | 'busy' | 'unavailable' | 'failed';
export class ProductImportError extends Error {
  constructor(public issue: ProductImportIssue) { super(issue); }
}
const API = 'https://live.dehub.io/maboroshi/marketing/import-product';
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const publicUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : null; } catch { return null; }
};

export function normalizeProductImport(value: unknown): ProductImport | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const sourceUrl = publicUrl(input.sourceUrl), finalUrl = publicUrl(input.finalUrl);
  if (!sourceUrl || !finalUrl || !Array.isArray(input.products) || input.reviewRequired !== true) return null;
  const products = input.products.slice(0, 5).flatMap((candidate): ImportedProduct[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const item = candidate as Record<string, unknown>;
    const name = text(item.name, 180), description = text(item.description, 1000);
    if (!name || (item.source !== 'JSON-LD Product' && item.source !== 'Page metadata')) return [];
    // Suggested image URLs are deliberately not returned to rendering or generation.
    return [{ name, description, brand: text(item.brand, 180), source: item.source }];
  });
  return products.length ? { sourceUrl, finalUrl, retrievedAt: text(input.retrievedAt, 50), products } : null;
}

export async function importMarketingProduct(url: string, token: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<ProductImport> {
  if (!token) throw new ProductImportError('signIn');
  const source = publicUrl(url.trim());
  if (!source) throw new ProductImportError('url');
  const response = await fetcher(API, { method: 'POST', credentials: 'omit', signal,
    headers: { 'x-dehub-token': token, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(source)}` });
  if (!response.ok) throw new ProductImportError(response.status === 401 ? 'signIn' : response.status === 400 ? 'url' : response.status === 422 ? 'empty' : response.status === 429 ? 'busy' : [413, 415, 502, 504].includes(response.status) ? 'unavailable' : 'failed');
  const result = normalizeProductImport(await response.json());
  if (!result) throw new ProductImportError('empty');
  return result;
}

/** Ignore late results from another account, cancelled requests or a newer URL import. */
export function useProductImporter(owner: string | null, getToken: () => Promise<string>, request = importMarketingProduct) {
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ owner: string | null; result?: ProductImport; issue?: ProductImportIssue; loading?: boolean } | null>(null);
  useEffect(() => {
    setState(null);
    return () => { active.current?.abort(); active.current = null; };
  }, [owner]);
  const run = async (url: string) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const current = () => ownerRef.current === owner && active.current === controller && !controller.signal.aborted;
    if (!owner) { setState({ owner, issue: 'signIn' }); return; }
    setState({ owner, loading: true });
    const deadline = setTimeout(() => {
      if (ownerRef.current === owner && active.current === controller) setState({ owner, issue: 'unavailable' });
      controller.abort();
    }, 30000);
    try {
      const token = await getToken();
      if (!current()) return;
      const result = await request(url, token, controller.signal);
      if (current()) setState({ owner, result });
    } catch (error) {
      if (ownerRef.current === owner && active.current === controller) setState({ owner, issue: controller.signal.aborted ? 'unavailable' : error instanceof ProductImportError ? error.issue : 'failed' });
    } finally { clearTimeout(deadline); }
  };
  return { result: state?.owner === owner ? state.result : undefined, issue: state?.owner === owner ? state.issue : undefined, loading: state?.owner === owner && Boolean(state.loading), run };
}
