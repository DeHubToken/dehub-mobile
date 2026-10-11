export const MABOROSHI_ORIGIN = 'https://live.dehub.io';
const API = `${MABOROSHI_ORIGIN}/maboroshi`;
export interface MaboroshiPaymentRequest {
  type: 'maboroshi:pay'; requestId: string; id: string; stage: 'prepare' | 'draft' | 'hd';
}
export interface MaboroshiQuote extends MaboroshiPaymentRequest {
  wallet: string; price_micros: number; payment_ref: string | null;
}
export function isMaboroshiPaymentRequest(value: unknown): value is MaboroshiPaymentRequest {
  if (!value || typeof value !== 'object') return false;
  const row = value as MaboroshiPaymentRequest;
  return row.type === 'maboroshi:pay' && typeof row.requestId === 'string'
    && /^[a-f0-9-]{36}$/.test(row.requestId) && /^[a-f0-9]{32}$/.test(row.id)
    && ['prepare', 'draft', 'hd'].includes(row.stage);
}
async function request(path: string, token: string, options: RequestInit = {}, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${API}${path}`, { ...options, headers: {
    'x-dehub-token': token, ...options.headers,
  } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Maboroshi payment could not be confirmed.');
  return result;
}
export async function getMaboroshiQuote(input: MaboroshiPaymentRequest, token: string, wallet: string, fetcher: typeof fetch = fetch): Promise<MaboroshiQuote> {
  if (!isMaboroshiPaymentRequest(input) || !token || !/^0x[a-f0-9]{40}$/i.test(wallet)) throw new Error('Sign in to review this payment.');
  const quote = await request(`/jobs/${input.id}/checkout/${input.stage}`, token, {}, fetcher);
  if (quote.id !== input.id || quote.stage !== input.stage || quote.wallet !== wallet.toLowerCase()
      || !Number.isSafeInteger(quote.price_micros) || quote.price_micros <= 0 || quote.price_micros > 100_000_000
      || (quote.payment_ref !== null && quote.payment_ref !== 'credits' && !/^0x[a-f0-9]{64}$/.test(quote.payment_ref))) throw new Error('The project payment does not match this account.');
  return { ...input, ...quote };
}
export async function completeMaboroshiPayment(quote: MaboroshiQuote, token: string, currentWallet: () => string,
  pay: (dhb: number) => Promise<string>, retire: (hash: string) => void = () => {}, fetcher: typeof fetch = fetch): Promise<void> {
  const sameAccount = () => {
    if (currentWallet().toLowerCase() !== quote.wallet) throw new Error('The signed-in account changed. Review payment again.');
  };
  sameAccount();
  const latest = await getMaboroshiQuote(quote, token, quote.wallet, fetcher);
  if (latest.price_micros !== quote.price_micros) throw new Error('The price changed. Review the new quote.');
  sameAccount();
  const payment = latest.payment_ref || await pay(latest.price_micros / 1000);
  sameAccount();
  await request(`/jobs/${quote.id}/${quote.stage}`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `price_micros=${latest.price_micros}&tx_hash=${encodeURIComponent(payment)}`,
  }, fetcher);
  if (payment !== 'credits') retire(payment);
}
