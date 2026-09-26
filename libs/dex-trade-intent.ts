import { supabase } from '../services/supabase';

/** One Easy trade request, as read from a sentence. Numbers are plain decimal strings. */
export interface TradeIntent {
  side: 'sell' | 'buy' | 'unclear';
  amount: string;
  amountUnit: 'dhb' | 'percent' | 'usd' | 'none';
  priceType: 'market' | 'fixed' | 'relative' | 'none';
  price: string;
  relativePercent: string;
  reply: string;
}

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
const plain = (value: number) => String(Number(value.toFixed(12)));

/** A small offline reading of the common phrasings, used when the model is unreachable. */
export function parseTradeLocally(text: string): TradeIntent {
  const s = ` ${text.toLowerCase().replace(/,/g, '')} `;
  const intent: TradeIntent = { side: /\bbuy\b/.test(s) && !/\bsell\b/.test(s) ? 'buy' : /\b(sell|dump|cash ?out|swap)\b/.test(s) ? 'sell' : 'unclear',
    amount: '', amountUnit: 'none', priceType: 'none', price: '', relativePercent: '', reply: '' };

  // Price first, so "at 2 cents" is not also read as the amount.
  let rest = s;
  const rel = s.match(/(\d+(?:\.\d+)?)\s*%\s*(above|over|higher than|below|under|lower than)\s*(?:the\s*)?market/);
  const cents = s.match(/\b(?:at|for|@)\s*(\d+(?:\.\d+)?)\s*(?:c|cents?)\b/);
  const dollars = s.match(/\b(?:at|for|@)\s*\$?\s*(\d*\.?\d+)(?!\s*(?:%|k\b|m\b|b\b|dhb))/);
  if (rel) {
    intent.priceType = 'relative';
    intent.relativePercent = `${/above|over|higher/.test(rel[2]) ? '' : '-'}${rel[1]}`;
    rest = rest.replace(rel[0], ' ');
  } else if (cents) {
    intent.priceType = 'fixed'; intent.price = plain(Number(cents[1]) / 100); rest = rest.replace(cents[0], ' ');
  } else if (dollars) {
    intent.priceType = 'fixed'; intent.price = plain(Number(dollars[1])); rest = rest.replace(dollars[0], ' ');
  } else if (/\b(market|now|instant(ly)?|asap|best price)\b/.test(s)) {
    intent.priceType = 'market';
  }

  const pct = rest.match(/(\d+(?:\.\d+)?)\s*%/);
  const usd = rest.match(/\$\s*(\d+(?:\.\d+)?)\s*([kmb])?\b|(\d+(?:\.\d+)?)\s*([kmb])?\s*(?:usd|dollars?)\b/);
  const qty = rest.match(/(\d+(?:\.\d+)?)\s*([kmb])?\b/);
  if (/\b(all|everything|max|entire)\b/.test(rest)) { intent.amountUnit = 'percent'; intent.amount = '100'; }
  else if (/\bhalf\b/.test(rest)) { intent.amountUnit = 'percent'; intent.amount = '50'; }
  else if (/\bquarter\b/.test(rest)) { intent.amountUnit = 'percent'; intent.amount = '25'; }
  else if (pct) { intent.amountUnit = 'percent'; intent.amount = pct[1]; }
  else if (usd) {
    const [n, unit] = usd[1] ? [usd[1], usd[2]] : [usd[3], usd[4]];
    intent.amountUnit = 'usd'; intent.amount = plain(Number(n) * (SCALE[unit ?? ''] ?? 1));
  } else if (qty) { intent.amountUnit = 'dhb'; intent.amount = plain(Number(qty[1]) * (SCALE[qty[2] ?? ''] ?? 1)); }
  return intent;
}

/** Ask the model to read the request; fall back to the local reading if it cannot. */
export async function readTradeIntent(text: string): Promise<TradeIntent> {
  try {
    const { data, error } = await supabase.functions.invoke('trade-intent', { body: { text } });
    if (!error && data && !data.error && typeof data.side === 'string') return data as TradeIntent;
  } catch { /* the local reading below still covers the usual phrasings */ }
  return parseTradeLocally(text);
}
