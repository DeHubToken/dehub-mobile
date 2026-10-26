import { quoteAiJob, type AiQuoteRequest } from '../services/ai.service';

/** A displayed amount never authorizes a changed request or a higher live quote. */
export async function confirmQuotedJob(request: AiQuoteRequest, priceDhb: number, isCurrent: () => boolean,
  pay: (price: number) => Promise<string>, staleMessage: string): Promise<string> {
  const fresh = await quoteAiJob(request);
  if (!isCurrent() || priceDhb <= 0 || fresh.priceDhb !== priceDhb) throw new Error(staleMessage);
  return pay(priceDhb);
}
