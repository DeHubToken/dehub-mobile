export function isMaboroshiStudio(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://live.dehub.io' && url.pathname === '/maboroshi/' && !url.username && !url.password;
  } catch { return false; }
}

export function isMaboroshiDownload(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://live.dehub.io' && !url.username && !url.password
      && /^\/maboroshi\/media\/[a-f0-9]{32}\/(?:hd\/)?[a-z0-9-]+\.mp4$/.test(url.pathname)
      && /^\d+$/.test(url.searchParams.get('expires') || '')
      && /^[a-f0-9]{64}$/.test(url.searchParams.get('signature') || '');
  } catch { return false; }
}

export function maboroshiSessionScript(token: string, wallet: string, allowPayments: boolean): string {
  const data = JSON.stringify({ token, wallet, allowPayments }).replace(/</g, '\\u003c');
  return `if(location.origin==='https://live.dehub.io'&&location.pathname==='/maboroshi/'){document.dispatchEvent(new CustomEvent('maboroshi:native-session',{detail:${data}}));}true;`;
}
