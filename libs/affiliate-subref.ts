export const normalizeSubReferral = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value.trim()) ? value.trim() : null;

export type ReferralTouch = { code: string; subId: string | null };

export function referralFromUrl(raw: string): ReferralTouch | null {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:', 'dehub:'].includes(url.protocol)) return null;
    if (url.protocol !== 'dehub:' && !['dehub.io', 'www.dehub.io', 'legacy.dehub.io'].includes(url.hostname.toLowerCase())) return null;
    const path = url.protocol === 'dehub:' ? '/' + url.hostname + url.pathname : url.pathname;
    const code = (path.match(/^\/r\/([^/]+)/)?.[1] || url.searchParams.get('ref') || url.searchParams.get('aff') || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return null;
    return { code, subId: normalizeSubReferral(url.searchParams.get('sub')) };
  } catch { return null; }
}
