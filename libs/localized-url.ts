/** Carry the selected interface language into DeHub documentation and web pages. */
export function withDeHubLanguage(rawUrl: string, language: string): string {
  try {
    const url = new URL(rawUrl);
    if (!['dehub.io', 'www.dehub.io', 'dehub.net', 'www.dehub.net', 'staging.dehub.io'].includes(url.hostname)) return rawUrl;
    if (!/^https?:$/.test(url.protocol) || /^\/(?:api|media|locale-packs|locale-pages)\//.test(url.pathname)) return rawUrl;
    if (url.hostname === 'staging.dehub.io') url.hostname = 'dehub.io';
    if (!url.searchParams.has('hl') && /^[a-z]{2,3}(?:_[a-z]{2})?$/.test(language)) url.searchParams.set('hl', language);
    return url.toString();
  } catch { return rawUrl; }
}
